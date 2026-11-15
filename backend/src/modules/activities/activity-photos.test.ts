import sharp from 'sharp';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import type { Activity, SharedArea } from '../../generated/prisma/client.js';
import { addDays, dateOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { MAX_PHOTOS, MAX_PHOTOS_PER_ACCOUNT } from '../../lib/photos.js';
import { prisma } from '../../lib/prisma.js';
import { SHARED_AREAS } from '../../lib/shared-areas.js';
import { createConfirmedUser, createTestLink, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import type { Session } from '../appointments/sessions.js';
import { arePhotosOpen, photosDeadlineFor } from './activities.service.js';

// Fotos das atividades (DEC-103). Dados e imagens fictícios (regra 5).
const PHOTOS_VERSION = '2026-11.5';
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const OTHER_PATIENT = 'outra-paciente@faisca.test';
const THERAPIST = 'terapeuta@faisca.test';
const OTHER_THERAPIST = 'outra-terapeuta@faisca.test';

let app: ReturnType<typeof createApp>;
let patientId: string;
let otherPatientId: string;
let therapistId: string;
let linkId: string;

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  // Já com a versão do aviso que cita as fotos (a atual só muda no PR das telas, como na DEC-064).
  const privacyVersion = PHOTOS_VERSION;
  patientId = (await createConfirmedUser({ email: PATIENT, privacyVersion })).id;
  otherPatientId = (await createConfirmedUser({ email: OTHER_PATIENT, privacyVersion })).id;
  therapistId = (await createConfirmedUser({ email: THERAPIST, patient: false, therapist: true, privacyVersion })).id;
  await createConfirmedUser({ email: OTHER_THERAPIST, patient: false, therapist: true, privacyVersion });
  linkId = (await createTestLink({ patientId, therapistId })).id;
});

async function loginAgent(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

// Uma atividade fictícia: concluída por padrão.
function seedActivity(userId: string, data: Partial<Activity> = {}) {
  return prisma.activity.create({
    data: {
      userId,
      name: 'Caminhada fictícia no parque',
      activityDate: dateOnlyToDate(todayInAppZone()),
      status: 'CONCLUIDA',
      wantBefore: 3,
      pleasure: 8,
      achievement: 7,
      completedAt: new Date(),
      ...data,
    },
  });
}

const open = { status: 'PLANEJADA' as const, wantBefore: null, pleasure: null, achievement: null, completedAt: null };

// Uma "foto de celular" fictícia, com metadados de câmera e uma localização fictícia no XMP.
const FAKE_XMP =
  "<x:xmpmeta xmlns:x='adobe:ns:meta/'><rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'><rdf:Description xmlns:exif='http://ns.adobe.com/exif/1.0/' exif:GPSLatitude='22,54.0S'/></rdf:RDF></x:xmpmeta>";
function cameraPhoto(width = 3000, height = 2000) {
  return sharp({ create: { width, height, channels: 3, background: '#8fa9b8' } })
    .withExif({ IFD0: { Make: 'Camera Ficticia' } })
    .withXmp(FAKE_XMP)
    .jpeg()
    .toBuffer();
}

function upload(agent: request.Agent, activityId: string, photo: Buffer) {
  return agent.post(`/activities/${activityId}/photos`).set('Content-Type', 'image/jpeg').send(photo);
}

const tiny = new Uint8Array([1]);
function seedPhotos(activityId: string, count: number) {
  return prisma.activityPhoto.createMany({
    data: Array.from({ length: count }, () => ({ activityId, image: tiny, thumbnail: tiny })),
  });
}

const today = () => todayInAppZone();

describe('prazo das fotos (funções puras)', () => {
  const completedAt = new Date('2026-11-10T15:00:00Z'); // 12:00 em São Paulo
  const done = { status: 'CONCLUIDA', completedAt, updatedAt: completedAt, photosDeadlineAt: null } as Activity;
  const session = (date: string, time: string | null): Session =>
    ({ kind: 'AVULSA', date, time, status: 'AGENDADA', ruleDate: null }) as unknown as Session;

  it('concluída: vale até a hora da próxima consulta depois da conclusão', () => {
    const sessions = [session('2026-11-12', '14:00')];
    expect(photosDeadlineFor(done, sessions)).toEqual({ date: '2026-11-12', time: '14:00' });
    expect(arePhotosOpen(done, sessions, new Date('2026-11-12T16:59:00Z'))).toBe(true); // 13:59
    expect(arePhotosOpen(done, sessions, new Date('2026-11-12T17:00:00Z'))).toBe(false); // 14:00
  });

  it('aberta: sempre, sem prazo; não realizada: nunca; concluída sem consulta: sem prazo', () => {
    const sessions = [session('2026-11-01', '09:00')];
    for (const status of ['PLANEJADA', 'PENDENTE'] as const) {
      expect(arePhotosOpen({ ...done, status }, sessions, new Date('2026-12-01T12:00:00Z'))).toBe(true);
      expect(photosDeadlineFor({ ...done, status }, sessions)).toBeNull();
    }
    expect(arePhotosOpen({ ...done, status: 'NAO_REALIZADA' }, [])).toBe(false);
    expect(photosDeadlineFor(done, [])).toBeNull();
    expect(arePhotosOpen(done, [])).toBe(true);
    // Congelado: apagar a consulta que já passou não reabre o prazo.
    const frozen = { ...done, photosDeadlineAt: new Date('2026-11-12T17:00:00Z') };
    expect(arePhotosOpen(frozen, [], new Date('2026-11-13T12:00:00Z'))).toBe(false);
  });
});

describe('adicionar e remover fotos', () => {
  it('guarda a foto grande (até 2560 px) e a miniatura (400×400), sem metadados nem cache', async () => {
    const activity = await seedActivity(patientId);
    const agent = await loginAgent(PATIENT);

    const res = await upload(agent, activity.id, await cameraPhoto());
    expect(res.status).toBe(201);
    expect(res.body.activity.photos).toEqual([{ id: res.body.photo.id, createdAt: expect.any(String) }]);
    expect(res.body.activity.photosOpen).toBe(true);

    const full = await agent.get(`/activities/${activity.id}/photos/${res.body.photo.id}?size=full`).buffer(true);
    const fullMeta = await sharp(full.body as Buffer).metadata();
    expect([full.headers['content-type'], fullMeta.width, fullMeta.height]).toEqual(['image/webp', 2560, 1707]);
    expect(fullMeta.exif).toBeUndefined();
    expect(fullMeta.xmp).toBeUndefined();
    expect(full.headers['cache-control']).toBe('no-store');
    const thumb = await agent.get(`/activities/${activity.id}/photos/${res.body.photo.id}`).buffer(true);
    const thumbMeta = await sharp(thumb.body as Buffer).metadata();
    expect([thumbMeta.width, thumbMeta.height]).toEqual([400, 400]);
  });

  it('a lista de atividades traz as fotos (só id e data) e se dá para mexer nelas', async () => {
    const activity = await seedActivity(patientId);
    const agent = await loginAgent(PATIENT);
    const { body } = await upload(agent, activity.id, await cameraPhoto(20, 20));

    const list = await agent.get('/activities').query({ from: today(), to: today() });
    expect(list.body.activities[0]).toEqual(
      expect.objectContaining({
        photos: [{ id: body.photo.id, createdAt: expect.any(String) }],
        photosDeadline: null,
        photosOpen: true,
      }),
    );
    expect(JSON.stringify(list.body)).not.toContain('thumbnail');
  });

  it('com a atividade aberta (planejada ou pendente), dá para pôr e tirar', async () => {
    const planned = await seedActivity(patientId, open);
    const pending = await seedActivity(patientId, { ...open, status: 'PENDENTE', wantBefore: 5 });
    const agent = await loginAgent(PATIENT);

    const first = await upload(agent, planned.id, await cameraPhoto(20, 20));
    expect(first.status).toBe(201);
    expect((await upload(agent, pending.id, await cameraPhoto(20, 20))).status).toBe(201);
    expect((await agent.delete(`/activities/${planned.id}/photos/${first.body.photo.id}`)).status).toBe(204);
    expect(await prisma.activityPhoto.count()).toBe(1);
  });

  it('as fotos não mudam a atividade concluída: notas e observação seguem iguais (regra 2)', async () => {
    const activity = await seedActivity(patientId, { observation: 'Observação fictícia' });
    const agent = await loginAgent(PATIENT);
    await upload(agent, activity.id, await cameraPhoto(20, 20));

    const saved = await prisma.activity.findUniqueOrThrow({ where: { id: activity.id } });
    expect(saved).toEqual(activity);
    // Editar a concluída continua 409.
    expect((await agent.patch(`/activities/${activity.id}`).send({ name: 'Outro nome' })).status).toBe(409);
  });

  it('atividade não realizada não recebe fotos, mas as que já tinha saem a qualquer hora', async () => {
    const notDone = await seedActivity(patientId, { ...open, status: 'NAO_REALIZADA' });
    const [photo] = await prisma.activityPhoto.createManyAndReturn({
      data: [{ activityId: notDone.id, image: tiny, thumbnail: tiny }],
    });
    // Mesmo com uma consulta que já passou: remover não tem prazo na não realizada.
    await prisma.appointment.create({ data: { userId: patientId, appointmentDate: dateOnlyToDate(addDays(today(), -1)) } });
    const agent = await loginAgent(PATIENT);

    const res = await upload(agent, notDone.id, await cameraPhoto(20, 20));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHOTOS_NOT_ALLOWED');

    expect((await agent.delete(`/activities/${notDone.id}/photos/${photo!.id}`)).status).toBe(204);
    expect(await prisma.activityPhoto.count()).toBe(0);
    // A atividade em si não muda (regra 2).
    expect(await prisma.activity.findUniqueOrThrow({ where: { id: notDone.id } })).toEqual(notDone);
  });

  it(`até ${MAX_PHOTOS} fotos por atividade`, async () => {
    const activity = await seedActivity(patientId);
    await seedPhotos(activity.id, MAX_PHOTOS);
    const agent = await loginAgent(PATIENT);

    const over = await upload(agent, activity.id, await cameraPhoto(20, 20));
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('PHOTO_LIMIT');
    expect(await prisma.activityPhoto.count()).toBe(MAX_PHOTOS);
  });

  it(`o teto de ${MAX_PHOTOS_PER_ACCOUNT} soma as fotos da Ação e das atividades`, async () => {
    // 29 atividades cheias e uma Ação com 10 fotos: 300 na conta.
    for (let i = 0; i < MAX_PHOTOS_PER_ACCOUNT / MAX_PHOTOS - 1; i++) {
      await seedPhotos((await seedActivity(patientId)).id, MAX_PHOTOS);
    }
    const action = await prisma.behavioralAction.create({
      data: {
        userId: patientId,
        actionDate: dateOnlyToDate(today()),
        name: 'Ação fictícia',
        category: 'CONEXAO',
        status: 'AVALIADA',
        expectation: 5,
        pleasure: 7,
        achievement: 6,
        evaluatedAt: new Date(),
      },
    });
    await prisma.actionPhoto.createMany({
      data: Array.from({ length: MAX_PHOTOS }, () => ({ actionId: action.id, image: tiny, thumbnail: tiny })),
    });
    const activity = await seedActivity(patientId);
    const agent = await loginAgent(PATIENT);

    const overActivity = await upload(agent, activity.id, await cameraPhoto(20, 20));
    expect(overActivity.status).toBe(409);
    expect(overActivity.body.error.code).toBe('ACCOUNT_PHOTO_LIMIT');

    // E na Ação também: o teto é um só.
    const freeAction = await prisma.behavioralAction.create({
      data: { ...action, id: undefined, createdAt: undefined, updatedAt: undefined },
    });
    const overAction = await agent
      .post(`/actions/${freeAction.id}/photos`)
      .set('Content-Type', 'image/jpeg')
      .send(await cameraPhoto(20, 20));
    expect(overAction.body.error.code).toBe('ACCOUNT_PHOTO_LIMIT');
  });

  it('com 299 fotos na conta, uma foto na atividade e outra na Ação ao mesmo tempo: uma entra', async () => {
    for (let i = 0; i < MAX_PHOTOS_PER_ACCOUNT / MAX_PHOTOS; i++) {
      await seedPhotos((await seedActivity(patientId)).id, i === 0 ? MAX_PHOTOS - 1 : MAX_PHOTOS);
    }
    const activity = await seedActivity(patientId);
    const action = await prisma.behavioralAction.create({
      data: {
        userId: patientId,
        actionDate: dateOnlyToDate(today()),
        name: 'Ação fictícia',
        category: 'PRAZER',
        status: 'AVALIADA',
        expectation: 5,
        pleasure: 7,
        achievement: 6,
        evaluatedAt: new Date(),
      },
    });
    const agent = await loginAgent(PATIENT);
    const photo = await cameraPhoto(20, 20);

    const results = await Promise.all([
      upload(agent, activity.id, photo),
      agent.post(`/actions/${action.id}/photos`).set('Content-Type', 'image/jpeg').send(photo),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await prisma.activityPhoto.count()) + (await prisma.actionPhoto.count())).toBe(MAX_PHOTOS_PER_ACCOUNT);
  });

  it('remover apaga de verdade; a mesma foto de novo é 404', async () => {
    const activity = await seedActivity(patientId);
    const agent = await loginAgent(PATIENT);
    const { body } = await upload(agent, activity.id, await cameraPhoto(20, 20));

    expect((await agent.delete(`/activities/${activity.id}/photos/${body.photo.id}`)).status).toBe(204);
    expect(await prisma.activityPhoto.count()).toBe(0);
    expect((await agent.delete(`/activities/${activity.id}/photos/${body.photo.id}`)).status).toBe(404);
  });

  it('excluir a atividade aberta apaga as fotos junto', async () => {
    const planned = await seedActivity(patientId, open);
    await seedPhotos(planned.id, 2);
    const agent = await loginAgent(PATIENT);

    expect((await agent.delete(`/activities/${planned.id}`)).status).toBe(204);
    expect(await prisma.activityPhoto.count()).toBe(0);
  });

  it('o prazo congela na leitura e fecha depois que a consulta começa', async () => {
    const activity = await seedActivity(patientId, { completedAt: dateOnlyToDate(addDays(today(), -3)) });
    const [photo] = await prisma.activityPhoto.createManyAndReturn({
      data: [{ activityId: activity.id, image: tiny, thumbnail: tiny }],
    });
    // Consulta avulsa de ontem, sem hora: começou no início do dia.
    const past = await prisma.appointment.create({
      data: { userId: patientId, appointmentDate: dateOnlyToDate(addDays(today(), -1)) },
    });
    const agent = await loginAgent(PATIENT);
    const day = addDays(today(), 0);

    const list = await agent.get('/activities').query({ from: day, to: day });
    expect(list.body.activities[0].photosOpen).toBe(false);
    const frozen = await prisma.activity.findUniqueOrThrow({ where: { id: activity.id } });
    expect(frozen.photosDeadlineAt).toBeInstanceOf(Date);
    expect(frozen.updatedAt).toEqual(activity.updatedAt);

    expect((await upload(agent, activity.id, await cameraPhoto(20, 20))).body.error.code).toBe('PHOTOS_CLOSED');
    expect((await agent.delete(`/activities/${activity.id}/photos/${photo!.id}`)).body.error.code).toBe('PHOTOS_CLOSED');

    // Apagar a consulta que já passou não reabre.
    await prisma.appointment.delete({ where: { id: past.id } });
    expect((await upload(agent, activity.id, await cameraPhoto(20, 20))).body.error.code).toBe('PHOTOS_CLOSED');
  });

  it('concluir pela API e registrar já concluída marcam a hora da conclusão', async () => {
    const pending = await seedActivity(patientId, { ...open, status: 'PENDENTE', wantBefore: 4 });
    const agent = await loginAgent(PATIENT);

    expect((await agent.post(`/activities/${pending.id}/complete`).send({ pleasure: 8, achievement: 6 })).status).toBe(200);
    expect((await prisma.activity.findUniqueOrThrow({ where: { id: pending.id } })).completedAt).toBeInstanceOf(Date);

    const created = await agent
      .post('/activities')
      .send({ status: 'CONCLUIDA', name: 'Leitura fictícia', activityDate: today(), wantBefore: 3, pleasure: 7, achievement: 5 });
    expect(created.status).toBe(201);
    expect((await prisma.activity.findUniqueOrThrow({ where: { id: created.body.activity.id } })).completedAt).toBeInstanceOf(
      Date,
    );
  });

  it('não é imagem: 400; outro tipo de corpo: 415; acima de 20 MB: 413', async () => {
    const activity = await seedActivity(patientId);
    const agent = await loginAgent(PATIENT);

    const notImage = await agent
      .post(`/activities/${activity.id}/photos`)
      .set('Content-Type', 'image/png')
      .send(Buffer.from('x'));
    expect(notImage.body.error.code).toBe('INVALID_IMAGE');
    expect((await agent.post(`/activities/${activity.id}/photos`).send({ image: 'x' })).status).toBe(415);
    const big = await agent
      .post(`/activities/${activity.id}/photos`)
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.alloc(20 * 1024 * 1024 + 1));
    expect(big.status).toBe(413);
  });

  it('"bomba de imagem": arquivo pequeno com mais de 50 MP é recusado antes de abrir', async () => {
    const activity = await seedActivity(patientId);
    const agent = await loginAgent(PATIENT);
    const bomb = await sharp({ create: { width: 7080, height: 7080, channels: 3, background: '#000' } })
      .png({ compressionLevel: 9 })
      .toBuffer();

    const res = await agent.post(`/activities/${activity.id}/photos`).set('Content-Type', 'image/png').send(bomb);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_IMAGE');
    expect(await prisma.activityPhoto.count()).toBe(0);
  });
});

describe('aviso de privacidade (DEC-103)', () => {
  it('sem o aceite das fotos, as atividades funcionam e as fotos pedem o aceite', async () => {
    await prisma.user.update({ where: { id: patientId }, data: { privacyVersion: '2026-11.4' } });
    const activity = await seedActivity(patientId);
    const agent = await loginAgent(PATIENT);

    expect((await agent.get('/activities').query({ from: today(), to: today() })).status).toBe(200);
    const res = await upload(agent, activity.id, await cameraPhoto(20, 20));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
  });
});

describe('autorização (regra 1)', () => {
  async function activityWithPhoto() {
    const activity = await seedActivity(patientId);
    const agent = await loginAgent(PATIENT);
    const { body } = await upload(agent, activity.id, await cameraPhoto(20, 20));
    return { activityId: activity.id, photoId: body.photo.id as string };
  }

  const therapistPath = (activityId: string, photoId: string, id = patientId) =>
    `/therapist/patients/${id}/activities/${activityId}/photos/${photoId}`;
  const setAreas = (sharedAreas: SharedArea[]) =>
    prisma.therapistLink.update({ where: { id: linkId }, data: { sharedAreas } });

  it('atividade de outra pessoa: 403 em adicionar, ver e remover, sem mudar nada', async () => {
    const { activityId, photoId } = await activityWithPhoto();
    const other = await loginAgent(OTHER_PATIENT);

    expect((await upload(other, activityId, await cameraPhoto(20, 20))).status).toBe(403);
    expect((await other.get(`/activities/${activityId}/photos/${photoId}`)).status).toBe(403);
    expect((await other.delete(`/activities/${activityId}/photos/${photoId}`)).status).toBe(403);
    expect(await prisma.activityPhoto.count()).toBe(1);
  });

  it('a foto pedida por outra atividade do mesmo paciente: 404', async () => {
    const { photoId } = await activityWithPhoto();
    const otherActivity = await seedActivity(patientId, { name: 'Outra atividade fictícia' });
    const agent = await loginAgent(PATIENT);

    expect((await agent.get(`/activities/${otherActivity.id}/photos/${photoId}`)).status).toBe(404);
    expect((await agent.delete(`/activities/${otherActivity.id}/photos/${photoId}`)).status).toBe(404);
  });

  it('sem sessão: 401; conta só de terapeuta: 403', async () => {
    const { activityId, photoId } = await activityWithPhoto();
    expect((await request(app).get(`/activities/${activityId}/photos/${photoId}`)).status).toBe(401);
    const therapist = await loginAgent(THERAPIST);
    expect((await therapist.get(`/activities/${activityId}/photos/${photoId}`)).status).toBe(403);
    expect((await upload(therapist, activityId, await cameraPhoto(20, 20))).status).toBe(403);
  });

  it('a profissional com vínculo ativo e as duas caixas liberadas vê; e nunca escreve', async () => {
    const { activityId, photoId } = await activityWithPhoto();
    const therapist = await loginAgent(THERAPIST);

    const photo = await therapist.get(`${therapistPath(activityId, photoId)}?size=full`);
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toBe('image/webp');
    expect(photo.headers['cache-control']).toBe('no-store');
    expect((await therapist.delete(therapistPath(activityId, photoId))).status).toBe(403);
    const post = await therapist
      .post(`/therapist/patients/${patientId}/activities/${activityId}/photos`)
      .set('Content-Type', 'image/jpeg')
      .send(await cameraPhoto(20, 20));
    expect(post.status).toBe(403);
    expect(await prisma.activityPhoto.count()).toBe(1);
  });

  it('sem vínculo, com vínculo revogado ou com outro paciente: 403', async () => {
    const { activityId, photoId } = await activityWithPhoto();
    expect((await (await loginAgent(OTHER_THERAPIST)).get(therapistPath(activityId, photoId))).status).toBe(403);

    const therapist = await loginAgent(THERAPIST);
    expect((await therapist.get(therapistPath(activityId, photoId, otherPatientId))).status).toBe(403);
    await prisma.therapistLink.update({ where: { id: linkId }, data: { revokedAt: new Date() } });
    expect((await therapist.get(therapistPath(activityId, photoId))).status).toBe(403);
  });

  it('a foto de outro paciente pedida pelo caminho do paciente vinculado: 404', async () => {
    const other = await seedActivity(otherPatientId);
    const otherAgent = await loginAgent(OTHER_PATIENT);
    const { body } = await upload(otherAgent, other.id, await cameraPhoto(20, 20));
    const therapist = await loginAgent(THERAPIST);

    expect((await therapist.get(therapistPath(other.id, body.photo.id))).status).toBe(404);
  });

  it('caixa das fotos fechada: a imagem é 403 e a lista vem sem fotos; liberar abre na hora', async () => {
    const { activityId, photoId } = await activityWithPhoto();
    await setAreas(SHARED_AREAS.filter((area) => area !== 'ACTIVITY_PHOTOS'));
    const therapist = await loginAgent(THERAPIST);
    const listUrl = `/therapist/patients/${patientId}/activities?from=${today()}&to=${today()}`;

    expect((await therapist.get(therapistPath(activityId, photoId))).status).toBe(403);
    expect((await therapist.get(listUrl)).body.activities[0].photos).toEqual([]);

    await setAreas([...SHARED_AREAS]);
    expect((await therapist.get(therapistPath(activityId, photoId))).status).toBe(200);
    expect((await therapist.get(listUrl)).body.activities[0].photos).toEqual([
      { id: photoId, createdAt: expect.any(String) },
    ]);
  });

  it('só a caixa das fotos, sem a das atividades: 403', async () => {
    const { activityId, photoId } = await activityWithPhoto();
    await setAreas(['ACTIVITY_PHOTOS']);
    const therapist = await loginAgent(THERAPIST);
    expect((await therapist.get(therapistPath(activityId, photoId))).status).toBe(403);
  });

  it('sem a agenda liberada, a lista da profissional não mostra o prazo', async () => {
    await seedActivity(patientId);
    await setAreas(['ACTIVITIES', 'ACTIVITY_PHOTOS']);
    const therapist = await loginAgent(THERAPIST);

    const list = await therapist.get(`/therapist/patients/${patientId}/activities?from=${today()}&to=${today()}`);
    expect(list.body.activities[0]).toEqual(expect.objectContaining({ photosDeadline: null, photosOpen: false }));
  });

  it('a profissional sem o aceite das fotos: 403 PRIVACY_CONSENT_REQUIRED', async () => {
    const { activityId, photoId } = await activityWithPhoto();
    await prisma.user.update({ where: { id: therapistId }, data: { privacyVersion: '2026-11.4' } });
    const therapist = await loginAgent(THERAPIST);

    const res = await therapist.get(therapistPath(activityId, photoId));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
  });

  it('a leitura da profissional não congela o prazo (não grava nada)', async () => {
    const activity = await seedActivity(patientId, { completedAt: dateOnlyToDate(addDays(today(), -3)) });
    await prisma.appointment.create({ data: { userId: patientId, appointmentDate: dateOnlyToDate(addDays(today(), -1)) } });
    const therapist = await loginAgent(THERAPIST);

    await therapist.get(`/therapist/patients/${patientId}/activities?from=${today()}&to=${today()}`);
    expect((await prisma.activity.findUniqueOrThrow({ where: { id: activity.id } })).photosDeadlineAt).toBeNull();
  });
});
