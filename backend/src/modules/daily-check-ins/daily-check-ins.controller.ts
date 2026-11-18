import type { RequestHandler } from 'express';
import { AppError } from '../../errors/app-error.js';
import { coversArea } from '../auth/privacy.js';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { getPatientLink } from '../../middlewares/require-patient-access.js';
import { patientParamsSchema } from '../therapist/therapist.schema.js';
import {
  checkInDateSchema,
  checkInSchema,
  checkInSettingsSchema,
  checkInsQuerySchema,
} from './daily-check-ins.schema.js';
import { checkInsForProfessional, createDailyCheckInsService } from './daily-check-ins.service.js';

function medicationConsent() {
  return new AppError(
    403,
    'PRIVACY_CONSENT_REQUIRED',
    'Para usar o Remédio, leia e aceite a versão atual do aviso de privacidade.',
  );
}

function consentRequired() {
  return new AppError(
    403,
    'PRIVACY_CONSENT_REQUIRED',
    'Para usar o Sono e humor e o Remédio, leia e aceite a versão atual do aviso de privacidade.',
  );
}

export function createDailyCheckInsController() {
  const service = createDailyCheckInsService();

  // Paciente: sempre o próprio id, da sessão. A rota já pede o aceite do Sono e humor; o remédio
  // confere o aceite da própria área (achado do revisor-regras), para continuar certo se um dia as
  // duas áreas forem para versões diferentes do aviso.
  const list: RequestHandler = async (req, res) => {
    const user = getAuthUser(req);
    const range = checkInsQuerySchema.parse(req.query);
    const [checkIns, settings] = await Promise.all([service.list(user.id, range), service.settings(user.id)]);
    const medication = coversArea(user.privacyVersion, 'medication');
    res.json({ checkIns: medication ? checkIns : checkIns.map((c) => ({ ...c, medication: null })), ...settings });
  };

  const save: RequestHandler = async (req, res) => {
    const user = getAuthUser(req);
    const { date } = checkInDateSchema.parse(req.params);
    const input = checkInSchema.parse(req.body);
    if (input.medication && !coversArea(user.privacyVersion, 'medication')) throw medicationConsent();
    res.json({ checkIn: await service.save(user.id, date, input) });
  };

  const remove: RequestHandler = async (req, res) => {
    const { date } = checkInDateSchema.parse(req.params);
    await service.remove(getAuthUser(req).id, date);
    res.status(204).end();
  };

  const updateSettings: RequestHandler = async (req, res) => {
    const { tracksMedication } = checkInSettingsSchema.parse(req.body);
    res.json(await service.updateSettings(getAuthUser(req).id, tracksMedication));
  };

  // Profissional: o patientId já passou pelo vínculo ativo. Cada caixa vale só se o paciente a
  // liberou e se o aceite dela cobre a área; sem nenhuma, 403 pedindo o aceite.
  const patient: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    const range = checkInsQuerySchema.parse(req.query);
    const version = getAuthUser(req).privacyVersion;
    const areas = getPatientLink(res).sharedAreas.filter(
      (area) =>
        (area === 'SLEEP_MOOD' && coversArea(version, 'sleepMood')) ||
        (area === 'MEDICATION' && coversArea(version, 'medication')),
    );
    if (areas.length === 0) throw consentRequired();
    const checkIns = await service.list(patientId, range);
    res.json({ checkIns: checkInsForProfessional(checkIns, areas) });
  };

  return { list, save, remove, updateSettings, patient };
}
