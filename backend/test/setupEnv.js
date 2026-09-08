process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "segredo-de-teste-nao-usar-em-producao";
process.env.CLINIC_INVITE_CODE = "codigo-clinica-teste";
// DATABASE_URL propositalmente não definido — cai no Postgres em memória (pg-mem).
