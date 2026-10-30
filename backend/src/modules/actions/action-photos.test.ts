import sharp from 'sharp';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import type { BehavioralAction } from '../../generated/prisma/client.js';
import { addDays, dateOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import type { Session } from '../appointments/sessions.js';
import { arePhotosOpen, MAX_PHOTOS, MAX_PHOTOS_PER_ACCOUNT, photosDeadlineFor } from './actions.service.js';

// Fotos da Ação (DEC-064). Dados e imagens fictícios (regra 5).
const PHOTOS_VERSION = '2026-10.6';
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const OTHER_PATIENT = 'outra-paciente@faisca.test';
const THERAPIST = 'terapeuta@faisca.test';
const OTHER_THERAPIST = 'outra-terapeuta@faisca.test';

let app: ReturnType<typeof createApp>;
let patientId: string;
let otherPatientId: string;
let therapistId: string;

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  // Já com a versão do aviso que cita as fotos (a atual ainda é a anterior até as telas, DEC-064).
  const privacyVersion = PHOTOS_VERSION;
  patientId = (await createConfirmedUser({ email: PATIENT, privacyVersion })).id;
  otherPatientId = (await createConfirmedUser({ email: OTHER_PATIENT, privacyVersion })).id;
  therapistId = (await createConfirmedUser({ email: THERAPIST, patient: false, therapist: true, privacyVersion })).id;
  await createConfirmedUser({ email: OTHER_THERAPIST, patient: false, therapist: true, privacyVersion });
  await prisma.therapistLink.create({ data: { patientId, therapistId, method: 'CODE' } });
});

async function loginAgent(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

// Uma ação avaliada (ou planejada) fictícia.
function seedAction(userId: string, data: Partial<BehavioralAction> = {}) {
  return prisma.behavioralAction.create({
    data: {
      userId,
      actionDate: dateOnlyToDate(todayInAppZone()),
      name: 'Passeio fictício no museu',
      category: 'CONEXAO',
      status: 'AVALIADA',
      expectation: 6,
      pleasure: 9,
      achievement: 7,
      evaluatedAt: new Date(),
      ...data,
    },
  });
}

// Uma "foto de celular" fictícia, maior que a foto guardada, com metadados de câmera e uma
// localização fictícia no XMP (onde alguns celulares também guardam o GPS).
const FAKE_XMP = "<x:xmpmeta xmlns:x='adobe:ns:meta/'><rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'><rdf:Description xmlns:exif='http://ns.adobe.com/exif/1.0/' exif:GPSLatitude='22,54.0S'/></rdf:RDF></x:xmpmeta>";
function cameraPhoto(width = 3000, height = 2000) {
  return sharp({ create: { width, height, channels: 3, background: '#8fa9b8' } })
    .withExif({ IFD0: { Make: 'Camera Ficticia' } })
    .withXmp(FAKE_XMP)
    .jpeg()
    .toBuffer();
}

function upload(agent: request.Agent, actionId: string, photo: Buffer) {
  return agent.post(`/actions/${actionId}/photos`).set('Content-Type', 'image/jpeg').send(photo);
}

describe('prazo das fotos (funções puras)', () => {
  const evaluatedAt = new Date('2026-10-20T15:00:00Z'); // 12:00 em São Paulo
  const action = { status: 'AVALIADA', evaluatedAt, updatedAt: evaluatedAt } as BehavioralAction;
  const session = (date: string, time: string | null): Session =>
    ({ kind: 'AVULSA', date, time, status: 'AGENDADA', ruleDate: null }) as unknown as Session;

  it('vale até a hora da próxima consulta depois da avaliação', () => {
    const sessions = [session('2026-10-22', '14:00')];
    expect(photosDeadlineFor(action, sessions)).toEqual({ date: '2026-10-22', time: '14:00' });
    expect(arePhotosOpen(action, sessions, new Date('2026-10-22T16:59:00Z'))).toBe(true); // 13:59
    expect(arePhotosOpen(action, sessions, new Date('2026-10-22T17:00:00Z'))).toBe(false); // 14:00
  });

  it('sem consulta marcada, sem prazo; fora da avaliada, fechado', () => {
    expect(photosDeadlineFor(action, [])).toBeNull();
    // Congelado: apagar a consulta que já passou não reabre o prazo.
    const frozen = { ...action, photosDeadlineAt: new Date('2026-10-22T17:00:00Z') } as BehavioralAction;
    expect(arePhotosOpen(frozen, [], new Date('2026-10-23T12:00:00Z'))).toBe(false);
    expect(arePhotosOpen(action, [])).toBe(true);
    expect(arePhotosOpen({ ...action, status: 'PLANEJADA' } as BehavioralAction, [])).toBe(false);
  });
});

describe('adicionar e remover fotos', () => {
  it('guarda a foto grande (até 2560 px) e a miniatura (400×400), sem metadados', async () => {
    const action = await seedAction(patientId);
    const agent = await loginAgent(PATIENT);

    const res = await upload(agent, action.id, await cameraPhoto());
    expect(res.status).toBe(201);
    expect(res.body.action.photos).toEqual([{ id: res.body.photo.id, createdAt: expect.any(String) }]);
    expect(res.body.action.photosOpen).toBe(true);

    const full = await agent.get(`/actions/${action.id}/photos/${res.body.photo.id}?size=full`).buffer(true);
    const fullMeta = await sharp(full.body as Buffer).metadata();
    expect([full.headers['content-type'], fullMeta.width, fullMeta.height]).toEqual(['image/webp', 2560, 1707]);
    expect(fullMeta.exif).toBeUndefined();
    expect(fullMeta.xmp).toBeUndefined();
    expect(fullMeta.iptc).toBeUndefined();
    // Dado de saúde: nada fica no cache do aparelho (DEC-066).
    expect(full.headers['cache-control']).toBe('no-store');
    const thumb = await agent.get(`/actions/${action.id}/photos/${res.body.photo.id}`).buffer(true);
    const thumbMeta = await sharp(thumb.body as Buffer).metadata();
    expect([thumbMeta.width, thumbMeta.height]).toEqual([400, 400]);
    expect(thumb.headers['cache-control']).toBe('no-store');
  });

  it('foto menor que o limite não é aumentada', async () => {
    const action = await seedAction(patientId);
    const agent = await loginAgent(PATIENT);
    const res = await upload(agent, action.id, await cameraPhoto(800, 600));

    const full = await agent.get(`/actions/${action.id}/photos/${res.body.photo.id}?size=full`).buffer(true);
    const meta = await sharp(full.body as Buffer).metadata();
    expect([meta.width, meta.height]).toEqual([800, 600]);
  });

  it(`até ${MAX_PHOTOS} fotos por ação`, async () => {
    const action = await seedAction(patientId);
    const agent = await loginAgent(PATIENT);
    const small = await cameraPhoto(20, 20);
    for (let i = 0; i < MAX_PHOTOS; i++) expect((await upload(agent, action.id, small)).status).toBe(201);

    const over = await upload(agent, action.id, small);
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('PHOTO_LIMIT');
    expect(await prisma.actionPhoto.count()).toBe(MAX_PHOTOS);
  });

  it(`até ${MAX_PHOTOS_PER_ACCOUNT} fotos por conta, somando todas as ações (DEC-074)`, async () => {
    // Ações já cheias, com bytes fictícios: o teto conta linhas, não abre as imagens.
    const tiny = new Uint8Array([1]);
    for (let i = 0; i < MAX_PHOTOS_PER_ACCOUNT / MAX_PHOTOS; i++) {
      const full = await seedAction(patientId);
      await prisma.actionPhoto.createMany({
        data: Array.from({ length: MAX_PHOTOS }, () => ({ actionId: full.id, image: tiny, thumbnail: tiny })),
      });
    }
    const action = await seedAction(patientId);
    const agent = await loginAgent(PATIENT);

    const over = await upload(agent, action.id, await cameraPhoto(20, 20));

    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('ACCOUNT_PHOTO_LIMIT');
    expect(await prisma.actionPhoto.count({ where: { actionId: action.id } })).toBe(0);
    // A conta de outra pessoa não entra na conta.
    const other = await seedAction(otherPatientId);
    const otherAgent = await loginAgent(OTHER_PATIENT);
    expect((await upload(otherAgent, other.id, await cameraPhoto(20, 20))).status).toBe(201);
  });

  it('com 299 fotos na conta, dois envios juntos em ações diferentes: um entra, o outro é 409', async () => {
    const tiny = new Uint8Array([1]);
    for (let i = 0; i < MAX_PHOTOS_PER_ACCOUNT / MAX_PHOTOS; i++) {
      const full = await seedAction(patientId);
      // A última ação fica com uma vaga a menos: 299 na conta.
      const count = i === 0 ? MAX_PHOTOS - 1 : MAX_PHOTOS;
      await prisma.actionPhoto.createMany({
        data: Array.from({ length: count }, () => ({ actionId: full.id, image: tiny, thumbnail: tiny })),
      });
    }
    const [first, second] = [await seedAction(patientId), await seedAction(patientId)];
    const agent = await loginAgent(PATIENT);
    const photo = await cameraPhoto(20, 20);

    const results = await Promise.all([upload(agent, first.id, photo), upload(agent, second.id, photo)]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.actionPhoto.count()).toBe(MAX_PHOTOS_PER_ACCOUNT);
  });

  it('remover apaga de verdade; a mesma foto de novo é 404', async () => {
    const action = await seedAction(patientId);
    const agent = await loginAgent(PATIENT);
    const { body } = await upload(agent, action.id, await cameraPhoto(20, 20));

    expect((await agent.delete(`/actions/${action.id}/photos/${body.photo.id}`)).status).toBe(204);
    expect(await prisma.actionPhoto.count()).toBe(0);
    expect((await agent.delete(`/actions/${action.id}/photos/${body.photo.id}`)).status).toBe(404);
  });

  it('só na ação avaliada', async () => {
    const planned = await seedAction(patientId, { status: 'PLANEJADA', pleasure: null, achievement: null, evaluatedAt: null });
    const agent = await loginAgent(PATIENT);

    const res = await upload(agent, planned.id, await cameraPhoto(20, 20));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHOTOS_NOT_ALLOWED');
  });

  it('o prazo congela: apagar a consulta que já passou não reabre', async () => {
    const today = todayInAppZone();
    const action = await seedAction(patientId, { evaluatedAt: dateOnlyToDate(addDays(today, -3)) });
    const past = await prisma.appointment.create({
      data: { userId: patientId, appointmentDate: dateOnlyToDate(addDays(today, -1)) },
    });
    const agent = await loginAgent(PATIENT);

    // A leitura da paciente congela o prazo (o updatedAt fica igual: não é mudança da ação).
    expect((await agent.get(`/actions/${action.id}`)).body.action.photosOpen).toBe(false);
    const frozen = await prisma.behavioralAction.findUniqueOrThrow({ where: { id: action.id } });
    expect(frozen.photosDeadlineAt).toBeInstanceOf(Date);
    expect(frozen.updatedAt).toEqual(action.updatedAt);

    await prisma.appointment.delete({ where: { id: past.id } });
    expect((await agent.get(`/actions/${action.id}`)).body.action.photosOpen).toBe(false);
  });

  it('depois que a consulta começa, não dá mais para adicionar nem remover', async () => {
    const today = todayInAppZone();
    const action = await seedAction(patientId, { evaluatedAt: dateOnlyToDate(addDays(today, -3)) });
    const photo = await prisma.actionPhoto.create({
      data: { actionId: action.id, image: new Uint8Array([1]), thumbnail: new Uint8Array([1]) },
    });
    // Consulta avulsa de ontem, sem hora: começou no início do dia.
    await prisma.appointment.create({ data: { userId: patientId, appointmentDate: dateOnlyToDate(addDays(today, -1)) } });
    const agent = await loginAgent(PATIENT);

    expect((await agent.get(`/actions/${action.id}`)).body.action.photosOpen).toBe(false);
    expect((await upload(agent, action.id, await cameraPhoto(20, 20))).body.error.code).toBe('PHOTOS_CLOSED');
    expect((await agent.delete(`/actions/${action.id}/photos/${photo.id}`)).body.error.code).toBe('PHOTOS_CLOSED');
  });

  it('avaliar marca a hora da avaliação', async () => {
    const planned = await seedAction(patientId, { status: 'PLANEJADA', pleasure: null, achievement: null, evaluatedAt: null });
    const agent = await loginAgent(PATIENT);

    expect((await agent.post(`/actions/${planned.id}/evaluate`).send({ pleasure: 8, achievement: 6 })).status).toBe(200);
    const saved = await prisma.behavioralAction.findUniqueOrThrow({ where: { id: planned.id } });
    expect(saved.evaluatedAt).toBeInstanceOf(Date);
  });

  it('não é imagem: 400; outro tipo de corpo: 415; acima de 20 MB: 413', async () => {
    const action = await seedAction(patientId);
    const agent = await loginAgent(PATIENT);

    const notImage = await agent.post(`/actions/${action.id}/photos`).set('Content-Type', 'image/png').send(Buffer.from('x'));
    expect(notImage.body.error.code).toBe('INVALID_IMAGE');
    expect((await agent.post(`/actions/${action.id}/photos`).send({ image: 'x' })).status).toBe(415);
    const big = await agent
      .post(`/actions/${action.id}/photos`)
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.alloc(20 * 1024 * 1024 + 1));
    expect(big.status).toBe(413);
  });

  it('"bomba de imagem": arquivo pequeno com mais de 50 MP é recusado antes de abrir', async () => {
    const action = await seedAction(patientId);
    const agent = await loginAgent(PATIENT);
    // ~50,1 MP numa cor só: o PNG fica com poucos KB, mas descomprimido passaria de 150 MB.
    const bomb = await sharp({ create: { width: 7080, height: 7080, channels: 3, background: '#000' } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(1024 * 1024);

    const res = await agent.post(`/actions/${action.id}/photos`).set('Content-Type', 'image/png').send(bomb);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_IMAGE');
    expect(await prisma.actionPhoto.count()).toBe(0);
  });
});

describe('aviso de privacidade (DEC-064)', () => {
  it('sem o aceite das fotos, a Ação funciona e as fotos pedem o aceite', async () => {
    await prisma.user.update({ where: { id: patientId }, data: { privacyVersion: '2026-10.5' } });
    const action = await seedAction(patientId);
    const agent = await loginAgent(PATIENT);

    expect((await agent.get(`/actions/${action.id}`)).status).toBe(200);
    const res = await upload(agent, action.id, await cameraPhoto(20, 20));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
  });
});

describe('autorização (regra 1)', () => {
  async function actionWithPhoto() {
    const action = await seedAction(patientId);
    const agent = await loginAgent(PATIENT);
    const { body } = await upload(agent, action.id, await cameraPhoto(20, 20));
    return { actionId: action.id, photoId: body.photo.id as string };
  }

  it('ação de outra pessoa: 403 em adicionar, ver e remover, sem mudar nada', async () => {
    const { actionId, photoId } = await actionWithPhoto();
    const other = await loginAgent(OTHER_PATIENT);

    expect((await upload(other, actionId, await cameraPhoto(20, 20))).status).toBe(403);
    expect((await other.get(`/actions/${actionId}/photos/${photoId}`)).status).toBe(403);
    expect((await other.delete(`/actions/${actionId}/photos/${photoId}`)).status).toBe(403);
    expect(await prisma.actionPhoto.count()).toBe(1);
    void otherPatientId;
  });

  it('a foto pedida por outra ação do mesmo paciente: 404', async () => {
    const { photoId } = await actionWithPhoto();
    const otherAction = await seedAction(patientId, { name: 'Outra ação fictícia' });
    const agent = await loginAgent(PATIENT);

    expect((await agent.get(`/actions/${otherAction.id}/photos/${photoId}`)).status).toBe(404);
    expect((await agent.delete(`/actions/${otherAction.id}/photos/${photoId}`)).status).toBe(404);
  });

  it('sem sessão: 401; conta só de terapeuta: 403', async () => {
    const { actionId, photoId } = await actionWithPhoto();
    expect((await request(app).get(`/actions/${actionId}/photos/${photoId}`)).status).toBe(401);
    const therapist = await loginAgent(THERAPIST);
    expect((await therapist.get(`/actions/${actionId}/photos/${photoId}`)).status).toBe(403);
  });

  it('a terapeuta com vínculo ativo vê; sem vínculo, não; e nunca escreve', async () => {
    const { actionId, photoId } = await actionWithPhoto();
    const path = `/therapist/patients/${patientId}/actions/${actionId}/photos/${photoId}`;

    const therapist = await loginAgent(THERAPIST);
    const photo = await therapist.get(`${path}?size=full`);
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toBe('image/webp');
    expect(photo.headers['cache-control']).toBe('no-store');
    expect((await therapist.delete(path)).status).toBe(403);
    expect((await therapist.post(`/therapist/patients/${patientId}/actions/${actionId}/photos`)).status).toBe(403);

    expect((await (await loginAgent(OTHER_THERAPIST)).get(path)).status).toBe(403);
    await prisma.therapistLink.updateMany({ data: { revokedAt: new Date() } });
    expect((await therapist.get(path)).status).toBe(403);
  });

  it('a terapeuta sem o aceite das fotos: 403', async () => {
    const { actionId, photoId } = await actionWithPhoto();
    await prisma.user.update({ where: { id: therapistId }, data: { privacyVersion: '2026-10.5' } });
    const therapist = await loginAgent(THERAPIST);

    const res = await therapist.get(`/therapist/patients/${patientId}/actions/${actionId}/photos/${photoId}`);
    expect(res.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
  });

  it('foto nova numa ação já lida volta como "atualizado" para a terapeuta (DEC-057)', async () => {
    const action = await seedAction(patientId);
    const therapist = await loginAgent(THERAPIST);
    await therapist.put(`/therapist/read-marks/${patientId}`).send({ items: [{ type: 'ACTION', id: action.id }] });

    const agent = await loginAgent(PATIENT);
    await upload(agent, action.id, await cameraPhoto(20, 20));

    const day = todayInAppZone();
    const list = await therapist.get(`/therapist/patients/${patientId}/actions?from=${day}&to=${day}`);
    expect(list.body.actions[0].readStatus).toBe('ATUALIZADO');
  });
});
