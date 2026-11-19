import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { patientParamsSchema } from '../therapist/therapist.schema.js';
import {
  changeParamsSchema,
  checkParamsSchema,
  checkSchema,
  createChangeSchema,
  createMedicationSchema,
  createSymptomSchema,
  idParamsSchema,
  settingsSchema,
  updateChangeSchema,
  updateMedicationSchema,
  updateSymptomSchema,
} from './medications.schema.js';
import { createMedicationsService } from './medications.service.js';

// Remédios e o que sinto (DEC-114). No paciente, sempre o próprio id, da sessão; na profissional, o
// patientId da URL, que já passou pelo vínculo ativo, pela caixa liberada e pelo aceite dela.
export function createMedicationsController() {
  const service = createMedicationsService();
  const me = (req: Parameters<RequestHandler>[0]) => getAuthUser(req).id;

  const list: RequestHandler = async (req, res) => {
    const [data, settings] = await Promise.all([service.list(me(req)), service.settings(me(req))]);
    res.json({ ...data, ...settings });
  };

  const updateSettings: RequestHandler = async (req, res) => {
    const { listsMedications } = settingsSchema.parse(req.body);
    res.json(await service.updateSettings(me(req), listsMedications));
  };

  const createMedication: RequestHandler = async (req, res) => {
    const input = createMedicationSchema.parse(req.body);
    res.status(201).json({ medication: await service.createMedication(me(req), input) });
  };

  const updateMedication: RequestHandler = async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = updateMedicationSchema.parse(req.body);
    res.json({ medication: await service.updateMedication(me(req), id, input) });
  };

  const removeMedication: RequestHandler = async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    await service.removeMedication(me(req), id);
    res.status(204).end();
  };

  const addChange: RequestHandler = async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = createChangeSchema.parse(req.body);
    res.status(201).json({ medication: await service.addChange(me(req), id, input) });
  };

  const updateChange: RequestHandler = async (req, res) => {
    const { id, changeId } = changeParamsSchema.parse(req.params);
    const input = updateChangeSchema.parse(req.body);
    res.json({ medication: await service.updateChange(me(req), id, changeId, input) });
  };

  const removeChange: RequestHandler = async (req, res) => {
    const { id, changeId } = changeParamsSchema.parse(req.params);
    res.json({ medication: await service.removeChange(me(req), id, changeId) });
  };

  const createSymptom: RequestHandler = async (req, res) => {
    const input = createSymptomSchema.parse(req.body);
    res.status(201).json({ symptom: await service.createSymptom(me(req), input) });
  };

  const updateSymptom: RequestHandler = async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const input = updateSymptomSchema.parse(req.body);
    res.json({ symptom: await service.updateSymptom(me(req), id, input) });
  };

  const removeSymptom: RequestHandler = async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    await service.removeSymptom(me(req), id);
    res.status(204).end();
  };

  const saveCheck: RequestHandler = async (req, res) => {
    const { id, date } = checkParamsSchema.parse(req.params);
    const { intensity } = checkSchema.parse(req.body);
    res.json({ symptom: await service.saveCheck(me(req), id, date, intensity) });
  };

  const removeCheck: RequestHandler = async (req, res) => {
    const { id, date } = checkParamsSchema.parse(req.params);
    res.json({ symptom: await service.removeCheck(me(req), id, date) });
  };

  // Profissional: só leitura, o mesmo conteúdo do paciente, sem a opção de Conta.
  const patient: RequestHandler = async (req, res) => {
    const { patientId } = patientParamsSchema.parse(req.params);
    res.json(await service.list(patientId));
  };

  return {
    list,
    updateSettings,
    createMedication,
    updateMedication,
    removeMedication,
    addChange,
    updateChange,
    removeChange,
    createSymptom,
    updateSymptom,
    removeSymptom,
    saveCheck,
    removeCheck,
    patient,
  };
}
