-- Contas excluídas nas últimas 5 semanas, só pelo id (DEC-076): para apagar de novo depois de
-- restaurar uma cópia de segurança (DEC-075). O faisca_app recebe DML pelos default privileges da
-- 0000_init_privileges, e o faisca_backup recebe SELECT pelos default privileges do docs/DEPLOY.md.

-- CreateTable
CREATE TABLE "DeletedAccount" (
    "userId" UUID NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletedAccount_pkey" PRIMARY KEY ("userId")
);
