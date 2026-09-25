-- Permissões do faisca_app (DEC-003). Roda como faisca_migrator, que é o dono do banco.
-- As default privileges fazem toda tabela e sequence criada pelo faisca_migrator
-- nas próximas migrations já nascer com DML para o faisca_app, sem GRANT manual.

GRANT USAGE ON SCHEMA public TO faisca_app;

ALTER DEFAULT PRIVILEGES FOR ROLE faisca_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO faisca_app;

ALTER DEFAULT PRIVILEGES FOR ROLE faisca_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO faisca_app;
