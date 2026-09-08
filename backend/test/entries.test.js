const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { request, app, resetDb, registerClinica, createChildWithInvite, registerResponsavel } = require("./helpers");

describe("registros (água e banheiro)", () => {
  let clinica, child, marina, rafael;

  beforeEach(async () => {
    await resetDb();
    clinica = await registerClinica();
    const created = await createChildWithInvite(clinica.token, "Lucas");
    child = created.child;
    marina = await registerResponsavel({ email: "marina@x.com", code: created.code, parentesco: "MAE" });
    rafael = await registerResponsavel({ email: "rafael@x.com", code: created.code, parentesco: "PAI" });
  });

  test("marina registra água e o registro aparece no histórico", async () => {
    const create = await request(app).post(`/children/${child.id}/entries`)
      .set("Authorization", `Bearer ${marina.token}`)
      .send({ type: "AGUA", subtype: "copo_cheio" });
    assert.equal(create.status, 201);

    const list = await request(app).get(`/children/${child.id}/entries`).set("Authorization", `Bearer ${marina.token}`);
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].createdByName, "Responsável Teste");
  });

  test("rafael consegue editar um registro que a marina criou (mesmo filho, contas diferentes)", async () => {
    const create = await request(app).post(`/children/${child.id}/entries`)
      .set("Authorization", `Bearer ${marina.token}`)
      .send({ type: "AGUA", subtype: "copo_cheio" });

    const edit = await request(app).put(`/entries/${create.body.id}`)
      .set("Authorization", `Bearer ${rafael.token}`)
      .send({ subtype: "meio_copo" });
    assert.equal(edit.status, 200);
    assert.equal(edit.body.subtype, "meio_copo");
  });

  test("um responsável de OUTRO filho não consegue ver nem registrar nessa criança", async () => {
    const outraFamilia = await createChildWithInvite(clinica.token, "Sofia");
    const carlos = await registerResponsavel({ email: "carlos@x.com", code: outraFamilia.code, parentesco: "PAI" });

    const tentativa = await request(app).post(`/children/${child.id}/entries`)
      .set("Authorization", `Bearer ${carlos.token}`)
      .send({ type: "AGUA", subtype: "copo_cheio" });
    assert.equal(tentativa.status, 403);
  });

  test("apagar um registro é soft-delete: some da listagem mas fica registrado", async () => {
    const create = await request(app).post(`/children/${child.id}/entries`)
      .set("Authorization", `Bearer ${marina.token}`)
      .send({ type: "BANHEIRO", subtype: "urina" });

    const del = await request(app).delete(`/entries/${create.body.id}`).set("Authorization", `Bearer ${marina.token}`);
    assert.equal(del.status, 204);

    const list = await request(app).get(`/children/${child.id}/entries`).set("Authorization", `Bearer ${marina.token}`);
    assert.equal(list.body.length, 0);
  });

  test("subtype inválido pro tipo é rejeitado", async () => {
    const res = await request(app).post(`/children/${child.id}/entries`)
      .set("Authorization", `Bearer ${marina.token}`)
      .send({ type: "AGUA", subtype: "urina" }); // "urina" é de BANHEIRO, não de AGUA
    assert.equal(res.status, 400);
  });

  test("a clínica consegue ver os registros, mas não consegue criar (só visualiza)", async () => {
    const res = await request(app).post(`/children/${child.id}/entries`)
      .set("Authorization", `Bearer ${clinica.token}`)
      .send({ type: "AGUA", subtype: "copo_cheio" });
    assert.equal(res.status, 403);
  });
});
