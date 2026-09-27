// Portas próprias dos testes, para não brigar com a API (3333) e o front (5173) de dev.
export const API_PORT = process.env.E2E_API_PORT ?? '3334';
export const WEB_PORT = process.env.E2E_WEB_PORT ?? '5174';

export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
