const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { request, app, resetDb, registerClinica, createChildWithInvite, registerResponsavel } = require("./helpers");

async function logMeal(token, childId, type, subtype, daysAgo = 0) {
  const timestamp = new Date(Date.now() - daysAgo * 86400000).toISOString();
  return request(app).post(`/children/${childId}/entries`)
    .set("Authorization", `Bearer ${token}`)
    .send({ type, subtype, timestamp });
}

describe("check-in de alimentação", () => {
  let clinica, child, marina;

  beforeEach(async () => {
    await resetDb();
    clinica = await registerClinica();
    const created = await createChildWithInvite(clinica.token, "Lucas");
    child = created.child;
    marina = await registerResponsavel({ email: "marina@x.com", code: created.code, parentesco: "MAE" });
  });

  test("registra as 5 refeições com as 4 opções de quantidade", async () => {
    const combos = [
      ["CAFE_MANHA", "normal"], ["LANCHE_MANHA", "pouco"], ["ALMOCO", "muito"],
      ["LANCHE_TARDE", "recusou"], ["JANTAR", "normal"],
    ];
    for (const [type, subtype] of combos) {
      const res = await logMeal(marina.token, child.id, type, subtype);
      assert.equal(res.status, 201, `${type}/${subtype} deveria ser aceito`);
    }
  });

  test("rejeita subtype de banheiro/água usado numa refeição", async () => {
    const res = await logMeal(marina.token, child.id, "ALMOCO", "urina");
    assert.equal(res.status, 400);
  });

  test("rejeita tipo de refeição inexistente", async () => {
    const res = await logMeal(marina.token, child.id, "CEIA_DA_MEIA_NOITE", "normal");
    assert.equal(res.status, 400);
  });

  test("dashboard diário mostra o status de cada refeição, e null pra quem não foi registrada", async () => {
    await logMeal(marina.token, child.id, "CAFE_MANHA", "muito");
    const res = await request(app).get(`/children/${child.id}/dashboard?period=diario`).set("Authorization", `Bearer ${marina.token}`);
    assert.equal(res.body.refeicoes.CAFE_MANHA, "muito");
    assert.equal(res.body.refeicoes.ALMOCO, null);
  });

  test("registrar a mesma refeição duas vezes no dia: o dashboard mostra a mais recente", async () => {
    await logMeal(marina.token, child.id, "ALMOCO", "pouco");
    await new Promise(r => setTimeout(r, 5)); // garante timestamp diferente
    await logMeal(marina.token, child.id, "ALMOCO", "muito");
    const res = await request(app).get(`/children/${child.id}/dashboard?period=diario`).set("Authorization", `Bearer ${marina.token}`);
    assert.equal(res.body.refeicoes.ALMOCO, "muito");
  });

  test("editar um registro de refeição não aceita subtype fora da lista de refeição", async () => {
    const create = await logMeal(marina.token, child.id, "JANTAR", "normal");
    const edit = await request(app).put(`/entries/${create.body.id}`)
      .set("Authorization", `Bearer ${marina.token}`)
      .send({ subtype: "copo_cheio" });
    assert.equal(edit.status, 400);
  });

  test("dashboard mensal soma refeições no dia certo", async () => {
    await logMeal(marina.token, child.id, "ALMOCO", "normal", 0);
    await logMeal(marina.token, child.id, "JANTAR", "pouco", 0);
    const res = await request(app).get(`/children/${child.id}/dashboard?period=mensal`).set("Authorization", `Bearer ${marina.token}`);
    const hoje = new Date().getDate();
    assert.equal(res.body.series[hoje - 1].refeicao, 2);
  });

  test("diagnóstico detecta aumento de baixo apetite (pouco + recusou) na última semana", async () => {
    await logMeal(marina.token, child.id, "ALMOCO", "normal", 10); // semana anterior: nenhum baixo apetite
    await logMeal(marina.token, child.id, "ALMOCO", "pouco", 1);
    await logMeal(marina.token, child.id, "JANTAR", "recusou", 2);

    const res = await request(app).get(`/children/${child.id}/diagnostico`).set("Authorization", `Bearer ${marina.token}`);
    assert.equal(res.body.baixoApetite.atual, 2);
    assert.equal(res.body.baixoApetite.anterior, 0);
    assert.equal(res.body.baixoApetite.variacaoPct, 100);
  });
});
