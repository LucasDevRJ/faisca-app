-- #143: cada tentativa guarda a saída em uma chave própria.
ALTER TABLE "ActionVideo" ADD COLUMN "outputVersion" UUID;
