import type { LinkedRecordType, Prisma } from '../../generated/prisma/client.js';

// Serializa mudanças nas ligações de um paciente com a exclusão dos registros polimórficos.
// O lock vive até o fim da transação que cria a ligação ou remove o registro.
export async function lockRecordLinksForPatient(tx: Prisma.TransactionClient, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
}

// Apaga relações manuais junto com o registro. Se ele for a raiz de repetições, transfere a raiz
// para a ocorrência sobrevivente mais antiga; apagar uma ocorrência filha só tira a própria aresta.
export async function removeRecordLinks(tx: Prisma.TransactionClient, userId: string, type: LinkedRecordType, id: string) {
  await lockRecordLinksForPatient(tx, userId);
  const family = await tx.recordLink.findMany({
    where: { userId, kind: 'REPETITION', sourceType: type, sourceId: id },
    orderBy: { createdAt: 'asc' },
  });
  if (family.length) {
    const promoted = family[0]!;
    await tx.recordLink.delete({ where: { id: promoted.id } });
    await tx.recordLink.updateMany({
      where: { userId, kind: 'REPETITION', sourceType: type, sourceId: id, id: { not: promoted.id } },
      data: { sourceId: promoted.targetId },
    });
  }
  await tx.recordLink.deleteMany({ where: { userId, OR: [
    { sourceType: type, sourceId: id }, { targetType: type, targetId: id },
  ] } });
}
