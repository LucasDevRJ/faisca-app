-- Prazo da explicação alternativa congelado na criação do registro (DEC-054): a hora da próxima
-- consulta naquele momento. Vale o que vier primeiro, ele ou a agenda atual, para desmarcar ou
-- apagar uma consulta que já passou não reabrir o prazo. Os registros de antes ficam sem ele e
-- usam só a agenda.
ALTER TABLE "ThoughtRecord" ADD COLUMN "alternativeDeadlineAt" TIMESTAMP(3);
