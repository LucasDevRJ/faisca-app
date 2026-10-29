import sharp from 'sharp';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { Palette } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { PALETTES } from './profile.schema.js';

// Perfil básico (DEC-061). Dados e imagens fictícios (regra 5).
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const OTHER_PATIENT = 'outra-paciente@faisca.test';
const THERAPIST = 'terapeuta@faisca.test';
const OTHER_THERAPIST = 'outra-terapeuta@faisca.test';

let app: ReturnType<typeof createApp>;
let patientId: string;
let therapistId: string;

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  patientId = (await createConfirmedUser({ name: 'Paula Fictícia', email: PATIENT })).id;
  await createConfirmedUser({ email: OTHER_PATIENT });
  therapistId = (await createConfirmedUser({ email: THERAPIST, patient: false, therapist: true })).id;
  await createConfirmedUser({ email: OTHER_THERAPIST, patient: false, therapist: true });
  await prisma.therapistLink.create({ data: { patientId, therapistId, method: 'CODE' } });
});

async function loginAgent(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

// Uma "foto de celular" fictícia: 800×600, com metadados de câmera no EXIF.
function cameraPhoto() {
  return sharp({ create: { width: 800, height: 600, channels: 3, background: '#4f6f58' } })
    .withExif({ IFD0: { Make: 'Camera Ficticia', Copyright: 'Pessoa Ficticia' } })
    // Localização fictícia no XMP, onde alguns celulares também guardam o GPS.
    .withXmp("<x:xmpmeta xmlns:x='adobe:ns:meta/'><rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'><rdf:Description xmlns:exif='http://ns.adobe.com/exif/1.0/' exif:GPSLatitude='22,54.0S'/></rdf:RDF></x:xmpmeta>")
    .jpeg()
    .toBuffer();
}

async function uploadAvatar(email: string) {
  const agent = await loginAgent(email);
  const res = await agent.put('/profile/avatar').set('Content-Type', 'image/jpeg').send(await cameraPhoto());
  expect(res.status).toBe(200);
  return agent;
}

describe('nome completo', () => {
  it('começa vazio, salva sem espaços nas pontas e apaga com texto vazio', async () => {
    const agent = await loginAgent(PATIENT);
    expect((await agent.get('/profile')).body).toEqual({
      profile: { fullName: null, palette: 'SALVIA', avatarVersion: null },
    });

    const saved = await agent.patch('/profile').send({ fullName: '  Paula Fictícia da Silva  ' });
    expect(saved.status).toBe(200);
    expect(saved.body.profile.fullName).toBe('Paula Fictícia da Silva');

    expect((await agent.patch('/profile').send({ fullName: '   ' })).body.profile.fullName).toBeNull();
  });

  it('vale para a terapeuta também', async () => {
    const agent = await loginAgent(THERAPIST);
    expect((await agent.patch('/profile').send({ fullName: 'Tereza Fictícia' })).status).toBe(200);
  });

  it('até 120 caracteres; campo a mais ou sem sessão é recusado', async () => {
    const agent = await loginAgent(PATIENT);

    expect((await agent.patch('/profile').send({ fullName: 'a'.repeat(120) })).status).toBe(200);
    expect((await agent.patch('/profile').send({ fullName: 'a'.repeat(121) })).status).toBe(400);
    expect((await agent.patch('/profile').send({ fullName: 'Paula', userId: therapistId })).status).toBe(400);
    expect((await request(app).patch('/profile').send({ fullName: 'Paula' })).status).toBe(401);
    expect((await request(app).get('/profile')).status).toBe(401);
  });
});

describe('paleta de cores (DEC-063)', () => {
  it('começa na Sálvia, muda só a paleta e vem no /auth/me', async () => {
    const agent = await loginAgent(PATIENT);
    await agent.patch('/profile').send({ fullName: 'Paula Fictícia da Silva' });
    expect((await agent.get('/auth/me')).body.user.palette).toBe('SALVIA');

    const saved = await agent.patch('/profile').send({ palette: 'LAVANDA' });
    expect(saved.status).toBe(200);
    expect(saved.body.profile).toMatchObject({ palette: 'LAVANDA', fullName: 'Paula Fictícia da Silva' });
    expect((await agent.get('/auth/me')).body.user.palette).toBe('LAVANDA');
  });

  it('a lista do Zod é a mesma do enum do banco', () => {
    expect([...PALETTES]).toEqual(Object.values(Palette));
  });

  it('corpo vazio não muda nada: 400', async () => {
    const agent = await loginAgent(PATIENT);
    expect((await agent.patch('/profile').send({})).status).toBe(400);
  });

  it('só as paletas do Faísca', async () => {
    const agent = await loginAgent(THERAPIST);

    expect((await agent.patch('/profile').send({ palette: 'VERMELHO' })).status).toBe(400);
    expect((await agent.patch('/profile').send({ palette: null })).status).toBe(400);
    expect((await agent.patch('/profile').send({ palette: 'ALTO_CONTRASTE' })).body.profile.palette).toBe(
      'ALTO_CONTRASTE',
    );
  });
});

describe('foto de perfil', () => {
  it('fica 256×256 em WebP, sem os metadados da câmera', async () => {
    const original = await cameraPhoto();
    expect((await sharp(original).metadata()).exif).toBeDefined();

    const agent = await uploadAvatar(PATIENT);
    expect((await agent.get('/profile')).body.profile.avatarVersion).toEqual(expect.any(String));

    const res = await agent.get('/profile/avatar').buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['cache-control']).toBe('private, no-cache');
    const meta = await sharp(res.body as Buffer).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 256, 256]);
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
  });

  it('o tipo é conferido pelo conteúdo, e não pelo Content-Type', async () => {
    const agent = await loginAgent(PATIENT);
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).gif().toBuffer();

    const notImage = await agent.put('/profile/avatar').set('Content-Type', 'image/png').send(Buffer.from('não é imagem'));
    expect(notImage.status).toBe(400);
    expect(notImage.body.error.code).toBe('INVALID_IMAGE');
    expect((await agent.put('/profile/avatar').set('Content-Type', 'image/png').send(gif)).body.error.code).toBe(
      'INVALID_IMAGE',
    );
    expect(await prisma.userAvatar.count()).toBe(0);
  });

  it('SVG com Content-Type de imagem aceita é recusado antes de ser lido', async () => {
    const agent = await loginAgent(PATIENT);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');

    const res = await agent.put('/profile/avatar').set('Content-Type', 'image/png').send(svg);
    expect(res.body.error.code).toBe('INVALID_IMAGE');
  });

  it('no máximo 20 envios por hora por conta', async () => {
    const agent = await loginAgent(PATIENT);
    const tiny = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } }).png().toBuffer();
    for (let i = 0; i < 20; i++) {
      expect((await agent.put('/profile/avatar').set('Content-Type', 'image/png').send(tiny)).status).toBe(200);
    }
    expect((await agent.put('/profile/avatar').set('Content-Type', 'image/png').send(tiny)).status).toBe(429);
  });

  it('outro tipo de corpo: 415; acima de 5 MB: 413; sem sessão: 401', async () => {
    const agent = await loginAgent(PATIENT);

    expect((await agent.put('/profile/avatar').send({ image: 'x' })).status).toBe(415);
    const big = await agent
      .put('/profile/avatar')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(
      (await request(app).put('/profile/avatar').set('Content-Type', 'image/jpeg').send(await cameraPhoto())).status,
    ).toBe(401);
  });

  it('remover apaga de verdade; sem foto, 404', async () => {
    const agent = await uploadAvatar(PATIENT);

    expect((await agent.delete('/profile/avatar')).status).toBe(204);
    expect(await prisma.userAvatar.count()).toBe(0);
    expect((await agent.get('/profile/avatar')).status).toBe(404);
    expect((await agent.delete('/profile/avatar')).status).toBe(404);
  });

  it('sai junto com a conta', async () => {
    await uploadAvatar(PATIENT);
    await prisma.therapistLink.deleteMany();
    await prisma.user.delete({ where: { id: patientId } });

    expect(await prisma.userAvatar.count()).toBe(0);
  });
});

describe('autorização (regra 1)', () => {
  it('terapeuta com vínculo ativo vê a foto do paciente, e a versão na lista e no resumo', async () => {
    await uploadAvatar(PATIENT);
    const therapist = await loginAgent(THERAPIST);

    const photo = await therapist.get(`/therapist/patients/${patientId}/avatar`);
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toBe('image/webp');
    const version = (await therapist.get('/links/patients')).body.patients[0].avatarVersion;
    expect(version).toEqual(expect.any(String));
    expect((await therapist.get(`/therapist/patients/${patientId}`)).body.patient.avatarVersion).toBe(version);
  });

  it('sem vínculo, com vínculo desfeito ou sem perfil de terapeuta: 403', async () => {
    await uploadAvatar(PATIENT);
    const other = await loginAgent(OTHER_THERAPIST);
    expect((await other.get(`/therapist/patients/${patientId}/avatar`)).status).toBe(403);

    const patientAsTherapist = await loginAgent(OTHER_PATIENT);
    expect((await patientAsTherapist.get(`/therapist/patients/${patientId}/avatar`)).status).toBe(403);

    await prisma.therapistLink.updateMany({ data: { revokedAt: new Date() } });
    const formerTherapist = await loginAgent(THERAPIST);
    expect((await formerTherapist.get(`/therapist/patients/${patientId}/avatar`)).status).toBe(403);
  });

  it('a terapeuta nunca escreve a foto do paciente: 403 mesmo com vínculo', async () => {
    const therapist = await loginAgent(THERAPIST);
    const path = `/therapist/patients/${patientId}/avatar`;

    expect((await therapist.put(path).set('Content-Type', 'image/jpeg').send(await cameraPhoto())).status).toBe(403);
    expect((await therapist.delete(path)).status).toBe(403);
    expect((await request(app).get(path)).status).toBe(401);
    expect(await prisma.userAvatar.count()).toBe(0);
  });

  it('o paciente vê a foto da terapeuta vinculada, e só dela', async () => {
    await uploadAvatar(THERAPIST);
    const patient = await loginAgent(PATIENT);

    expect((await patient.get('/link')).body.link.therapist.avatarVersion).toEqual(expect.any(String));
    const photo = await patient.get('/link/therapist/avatar');
    expect(photo.status).toBe(200);
    // /profile/avatar é sempre a própria foto: a paciente não tem.
    expect((await patient.get('/profile/avatar')).status).toBe(404);

    // Depois de desfazer o vínculo, a paciente não vê mais a foto da antiga terapeuta.
    expect((await patient.post('/link/revoke')).status).toBe(204);
    expect((await patient.get('/link/therapist/avatar')).body.error.code).toBe('NO_ACTIVE_LINK');

    const unlinked = await loginAgent(OTHER_PATIENT);
    expect((await unlinked.get('/link/therapist/avatar')).body.error.code).toBe('NO_ACTIVE_LINK');
    const therapistOnly = await loginAgent(OTHER_THERAPIST);
    expect((await therapistOnly.get('/link/therapist/avatar')).status).toBe(403);
    expect((await request(app).get('/link/therapist/avatar')).status).toBe(401);
  });
});
