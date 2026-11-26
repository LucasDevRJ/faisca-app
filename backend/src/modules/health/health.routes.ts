import { Router } from 'express';
import { healthController, readinessController } from './health.controller.js';

export const healthRoutes = Router();

healthRoutes.get('/health', healthController);
healthRoutes.get('/health/ready', readinessController);
