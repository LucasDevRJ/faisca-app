import { prepareTestDatabase } from './test-db.js';

// Roda uma vez antes de todos os testes do Vitest.
export default async function setup() {
  await prepareTestDatabase();
}
