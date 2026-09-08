const { pool, init } = require("../db");
const app = require("../src/app");
const request = require("supertest");

let initialized = false;

// Garante que o schema existe (roda uma vez, é seguro chamar de novo — CREATE TABLE IF NOT EXISTS).
async function ensureInit() {
  if (!initialized) {
    await init();
    initialized = true;
  }
}

// Limpa todos os dados entre testes, respeitando dependências de chave estrangeira.
// Não recria as tabelas (mais rápido) — só esvazia.
async function resetDb() {
  await ensureInit();
  await pool.query("DELETE FROM entry_audit");
  await pool.query("DELETE FROM entries");
  await pool.query("DELETE FROM invites");
  await pool.query("DELETE FROM guardian_child");
  await pool.query("DELETE FROM children");
  await pool.query("DELETE FROM users");
}

// Atalhos usados em quase todo teste, pra não repetir o mesmo boilerplate de
// "cria clínica, cria criança, gera convite, cria responsável" em todo arquivo.
async function registerClinica(email = "clinica@teste.com") {
  const res = await request(app).post("/auth/register").send({
    name: "Clínica Teste", email, password: "123456", role: "CLINICA",
    inviteCode: process.env.CLINIC_INVITE_CODE,
  });
  return res.body; // { user, token }
}

async function createChildWithInvite(clinicaToken, name = "Criança Teste") {
  const childRes = await request(app).post("/children")
    .set("Authorization", `Bearer ${clinicaToken}`)
    .send({ name, birthdate: "2020-01-01" });
  const inviteRes = await request(app).post(`/children/${childRes.body.id}/invites`)
    .set("Authorization", `Bearer ${clinicaToken}`);
  return { child: childRes.body, code: inviteRes.body.code };
}

async function registerResponsavel({ email, code, parentesco = "MAE", name = "Responsável Teste" }) {
  const res = await request(app).post("/auth/register").send({
    name, email, password: "123456", role: "RESPONSAVEL", inviteCode: code, parentesco,
  });
  return res.body; // { user, token, child }
}

module.exports = { app, request, resetDb, registerClinica, createChildWithInvite, registerResponsavel };
