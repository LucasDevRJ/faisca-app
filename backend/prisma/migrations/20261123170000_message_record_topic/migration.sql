-- Mensagens (DEC-128): assunto "Sobre um registro". Em migration própria, porque o Postgres não deixa
-- usar um valor novo de enum na mesma transação em que ele foi criado (o CHECK da próxima usa).
ALTER TYPE "MessageTopic" ADD VALUE 'REGISTRO';
