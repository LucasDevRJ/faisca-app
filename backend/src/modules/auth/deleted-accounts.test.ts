import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { resetDatabase } from '../../test/db.js';
import { DELETED_ACCOUNT_RETENTION_DAYS, pruneDeletedAccounts } from './deleted-accounts.js';

// Lista de contas excluídas (DEC-077): fica o mesmo tempo que as cópias de segurança (DEC-075).
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-30T12:00:00Z');

beforeEach(async () => {
  await resetDatabase();
});

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * DAY_MS);
}

describe('pruneDeletedAccounts', () => {
  it(`apaga só o que passou de ${DELETED_ACCOUNT_RETENTION_DAYS} dias`, async () => {
    const old = randomUUID();
    const atLimit = randomUUID();
    const recent = randomUUID();
    await prisma.deletedAccount.createMany({
      data: [
        { userId: old, deletedAt: daysAgo(DELETED_ACCOUNT_RETENTION_DAYS + 1) },
        { userId: atLimit, deletedAt: daysAgo(DELETED_ACCOUNT_RETENTION_DAYS) },
        { userId: recent, deletedAt: daysAgo(1) },
      ],
    });

    expect(await pruneDeletedAccounts(NOW)).toBe(1);

    const left = await prisma.deletedAccount.findMany({ orderBy: { deletedAt: 'asc' } });
    expect(left.map((row) => row.userId)).toEqual([atLimit, recent]);
  });

  it('rodar de novo não apaga mais nada', async () => {
    await prisma.deletedAccount.create({ data: { userId: randomUUID(), deletedAt: daysAgo(2) } });

    expect(await pruneDeletedAccounts(NOW)).toBe(0);
    expect(await pruneDeletedAccounts(NOW)).toBe(0);
    expect(await prisma.deletedAccount.count()).toBe(1);
  });
});
