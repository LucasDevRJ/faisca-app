import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import { getPatientLink } from '../../middlewares/require-patient-access.js';
import { candidatesSchema, createLinkSchema, listLinksSchema, recordLinkIdSchema } from './record-links.schema.js';
import type { RecordLinksService } from './record-links.service.js';

export function createRecordLinksController(service: RecordLinksService) {
  const list: RequestHandler = async (req, res) => {
    const query = listLinksSchema.parse(req.query);
    res.status(200).json({ links: await service.list(getAuthUser(req).id, query) });
  };
  const therapistList: RequestHandler = async (req, res) => {
    const query = listLinksSchema.parse(req.query);
    const link = getPatientLink(res);
    const links = await service.listForTherapist(String(req.params.patientId), getAuthUser(req).id, link.sharedAreas, link.patientPrivacyVersion, query);
    res.status(200).json({ links });
  };
  const candidates: RequestHandler = async (req, res) => {
    const query = candidatesSchema.parse(req.query);
    res.status(200).json({ records: await service.candidates(getAuthUser(req).id, query) });
  };
  const create: RequestHandler = async (req, res) => {
    const input = createLinkSchema.parse(req.body);
    res.status(201).json({ link: await service.create(getAuthUser(req).id, input) });
  };
  const remove: RequestHandler = async (req, res) => {
    await service.remove(getAuthUser(req).id, recordLinkIdSchema.parse(req.params).id);
    res.status(204).end();
  };
  return { list, therapistList, candidates, create, remove };
}
