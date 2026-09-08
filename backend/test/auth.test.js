const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { request, app, resetDb, registerClinica, createChildWithInvite, registerResponsavel } = require("./helpers");

describe("cadastro e login", () => {
  beforeEach(resetDb);

  test("responsável não consegue se cadastrar sem código de convite", async () => {
    const res = await request(app).post("/auth/register").send({
      name: "Invasor", email: "invasor@x.com", password: "123456", role: "RESPONSAVEL",
    });
    assert.equal(res.status, 400);
  });

  test("clínica não consegue se cadastrar com código errado", async () => {
    const res = await request(app).post("/auth/register").send({
      name: "Falsa Clínica", email: "falsa@x.com", password: "123456", role: "CLINICA", inviteCode: "chute-aleatorio",
    });
    assert.equal(res.status, 403);
  });

  test("clínica se cadastra com o código certo", async () => {
    const { user, token } = await registerClinica();
    assert.equal(user.role, "CLINICA");
    assert.ok(token);
  });

  test("email é tratado sem diferenciar maiúscula/minúscula e sem espaço nas pontas", async () => {
    await registerClinica("Ana.Clinica@X.COM");
    const login = await request(app).post("/auth/login").send({ email: " ana.clinica@x.com ", password: "123456" });
    assert.equal(login.status, 200);
  });

  test("não deixa cadastrar dois usuários com o mesmo email", async () => {
    await registerClinica("dup@x.com");
    const res = await request(app).post("/auth/register").send({
      name: "Outra Pessoa", email: "dup@x.com", password: "123456", role: "CLINICA", inviteCode: process.env.CLINIC_INVITE_CODE,
    });
    assert.equal(res.status, 409);
  });

  test("login com senha errada retorna 401", async () => {
    await registerClinica("teste@x.com");
    const res = await request(app).post("/auth/login").send({ email: "teste@x.com", password: "senha-errada" });
    assert.equal(res.status, 401);
  });
});

describe("sistema de convites", () => {
  beforeEach(resetDb);

  test("responsável só cadastra com código válido, e fica vinculado à criança certa", async () => {
    const clinica = await registerClinica();
    const { child, code } = await createChildWithInvite(clinica.token, "Lucas");
    const marina = await registerResponsavel({ email: "marina@x.com", code, parentesco: "MAE" });
    assert.equal(marina.user.role, "RESPONSAVEL");
    assert.equal(marina.child.id, child.id);
  });

  test("mãe e pai usam o MESMO código e ficam os dois vinculados ao mesmo filho", async () => {
    const clinica = await registerClinica();
    const { code } = await createChildWithInvite(clinica.token, "Lucas");
    await registerResponsavel({ email: "marina@x.com", code, parentesco: "MAE" });
    await registerResponsavel({ email: "rafael@x.com", code, parentesco: "PAI" });

    const list = await request(app).get("/children").set("Authorization", `Bearer ${clinica.token}`);
    assert.equal(list.body[0].guardians.length, 2);
    const parentescos = list.body[0].guardians.map(g => g.parentesco).sort();
    assert.deepEqual(parentescos, ["MAE", "PAI"]);
  });

  test("código revogado não pode mais ser usado", async () => {
    const clinica = await registerClinica();
    const { child, code } = await createChildWithInvite(clinica.token, "Lucas");
    const invitesList = await request(app).get(`/children/${child.id}/invites`).set("Authorization", `Bearer ${clinica.token}`);
    const inviteId = invitesList.body[0].id;

    await request(app).delete(`/invites/${inviteId}`).set("Authorization", `Bearer ${clinica.token}`);

    const res = await request(app).post("/auth/register").send({
      name: "Tarde Demais", email: "tarde@x.com", password: "123456", role: "RESPONSAVEL", inviteCode: code, parentesco: "OUTRO",
    });
    assert.equal(res.status, 403);
  });

  test("só a clínica pode cadastrar criança", async () => {
    const clinica = await registerClinica();
    const { code } = await createChildWithInvite(clinica.token, "Lucas");
    const marina = await registerResponsavel({ email: "marina@x.com", code });

    const res = await request(app).post("/children")
      .set("Authorization", `Bearer ${marina.token}`)
      .send({ name: "Outro Filho", birthdate: "2022-01-01" });
    assert.equal(res.status, 403);
  });
});
