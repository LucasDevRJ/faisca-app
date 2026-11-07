import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/require-auth.js';
import {
  deletePushSubscriptionSchema,
  pauseRemindersSchema,
  pushSubscriptionSchema,
  updateRemindersSchema,
} from './reminders.schema.js';
import type { RemindersService } from './reminders.service.js';

export function createRemindersController(service: RemindersService) {
  const get: RequestHandler = async (req, res) => {
    const status = await service.get(getAuthUser(req).id);
    res.status(200).json(status);
  };

  const update: RequestHandler = async (req, res) => {
    const input = updateRemindersSchema.parse(req.body);
    const status = await service.update(getAuthUser(req).id, input);
    res.status(200).json(status);
  };

  const pause: RequestHandler = async (req, res) => {
    const { until } = pauseRemindersSchema.parse(req.body);
    const status = await service.pause(getAuthUser(req).id, until);
    res.status(200).json(status);
  };

  const resume: RequestHandler = async (req, res) => {
    const status = await service.resume(getAuthUser(req).id);
    res.status(200).json(status);
  };

  const savePushSubscription: RequestHandler = async (req, res) => {
    const input = pushSubscriptionSchema.parse(req.body);
    const status = await service.savePushSubscription(getAuthUser(req).id, req.sessionId, input);
    res.status(200).json(status);
  };

  const deletePushSubscription: RequestHandler = async (req, res) => {
    const { endpoint } = deletePushSubscriptionSchema.parse(req.body);
    await service.deletePushSubscription(getAuthUser(req).id, endpoint);
    res.status(204).end();
  };

  return {
    get,
    update,
    pause,
    resume,
    savePushSubscription,
    deletePushSubscription,
  };
}
