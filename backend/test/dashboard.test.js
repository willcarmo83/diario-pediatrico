const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { request, app, resetDb, registerClinica, createChildWithInvite, registerResponsavel } = require("./helpers");

async function logEntry(token, childId, type, subtype, daysAgo = 0) {
  const timestamp = new Date(Date.now() - daysAgo * 86400000).toISOString();
  return request(app).post(`/children/${childId}/entries`)
    .set("Authorization", `Bearer ${token}`)
    .send({ type, subtype, timestamp });
}

describe("dashboard e diagnóstico", () => {
  let clinica, child, marina;

  beforeEach(async () => {
    await resetDb();
    clinica = await registerClinica();
    const created = await createChildWithInvite(clinica.token, "Lucas");
    child = created.child;
    marina = await registerResponsavel({ email: "marina@x.com", code: created.code, parentesco: "MAE" });
  });

  test("dashboard diário soma corretamente copo cheio (1) e meio copo (0.5)", async () => {
    await logEntry(marina.token, child.id, "AGUA", "copo_cheio");
    await logEntry(marina.token, child.id, "AGUA", "meio_copo");
    const res = await request(app).get(`/children/${child.id}/dashboard?period=diario`).set("Authorization", `Bearer ${marina.token}`);
    assert.equal(res.body.agua, 1.5);
  });

  test("dashboard diário separa xixi e cocô corretamente, e 'ambos' conta nos dois", async () => {
    await logEntry(marina.token, child.id, "BANHEIRO", "urina");
    await logEntry(marina.token, child.id, "BANHEIRO", "fezes");
    await logEntry(marina.token, child.id, "BANHEIRO", "ambos");
    const res = await request(app).get(`/children/${child.id}/dashboard?period=diario`).set("Authorization", `Bearer ${marina.token}`);
    assert.equal(res.body.urina, 2); // urina + ambos
    assert.equal(res.body.fezes, 2); // fezes + ambos
  });

  test("diagnóstico detecta aumento na ingestão de água (últimos 7 dias vs 7 anteriores)", async () => {
    // semana anterior: 1 copo cheio
    await logEntry(marina.token, child.id, "AGUA", "copo_cheio", 10);
    // últimos 7 dias: 3 copos cheios (aumento)
    await logEntry(marina.token, child.id, "AGUA", "copo_cheio", 1);
    await logEntry(marina.token, child.id, "AGUA", "copo_cheio", 2);
    await logEntry(marina.token, child.id, "AGUA", "copo_cheio", 3);

    const res = await request(app).get(`/children/${child.id}/diagnostico`).set("Authorization", `Bearer ${marina.token}`);
    assert.equal(res.body.agua.atual, 3);
    assert.equal(res.body.agua.anterior, 1);
    assert.ok(res.body.agua.variacaoPct > 0, "esperava variação positiva (aumento)");
  });

  test("pessoa de fora não acessa dashboard de criança que não é sua", async () => {
    const outraFamilia = await createChildWithInvite(clinica.token, "Sofia");
    const carlos = await registerResponsavel({ email: "carlos@x.com", code: outraFamilia.code });
    const res = await request(app).get(`/children/${child.id}/dashboard?period=diario`).set("Authorization", `Bearer ${carlos.token}`);
    assert.equal(res.status, 403);
  });
});
