import type { Request, Response } from 'express';
import { getHealth, getReadiness } from './health.service.js';

export function healthController(_req: Request, res: Response) {
  res.status(200).json(getHealth());
}

export async function readinessController(_req: Request, res: Response) {
  const readiness = await getReadiness();
  res.status(readiness.status === 'ok' ? 200 : 503).json(readiness);
}
