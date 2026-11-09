-- Aviso de login novo por e-mail e push (DEC-091, issue #135): ligado por padrão.
ALTER TABLE "User" ADD COLUMN     "loginAlertEnabled" BOOLEAN NOT NULL DEFAULT true;
