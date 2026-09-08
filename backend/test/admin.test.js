const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { request, app, resetDb, registerClinica, createChildWithInvite, registerResponsavel } = require("./helpers");

describe("reset de senha", () => {
  let clinica, child, marina, rafael;

  beforeEach(async () => {
    await resetDb();
    clinica = await registerClinica();
    const created = await createChildWithInvite(clinica.token, "Lucas");
    child = created.child;
    marina = await registerResponsavel({ email: "marina@x.com", code: created.code, parentesco: "MAE" });
    rafael = await registerResponsavel({ email: "rafael@x.com", code: created.code, parentesco: "PAI" });
  });

  test("depois do reset, a senha antiga para de funcionar", async () => {
    await request(app).post(`/admin/users/${marina.user.id}/reset-password`).set("Authorization", `Bearer ${clinica.token}`);
    const login = await request(app).post("/auth/login").send({ email: "marina@x.com", password: "123456" });
    assert.equal(login.status, 401);
  });

  test("a senha temporária loga e sinaliza mustChangePassword", async () => {
    const reset = await request(app).post(`/admin/users/${marina.user.id}/reset-password`).set("Authorization", `Bearer ${clinica.token}`);
    const login = await request(app).post("/auth/login").send({ email: "marina@x.com", password: reset.body.tempPassword });
    assert.equal(login.status, 200);
    assert.equal(login.body.mustChangePassword, true);
  });

  test("resetar a senha da marina NÃO afeta a senha do rafael (mesmo filho, contas diferentes)", async () => {
    await request(app).post(`/admin/users/${marina.user.id}/reset-password`).set("Authorization", `Bearer ${clinica.token}`);
    const loginRafael = await request(app).post("/auth/login").send({ email: "rafael@x.com", password: "123456" });
    assert.equal(loginRafael.status, 200);
  });

  test("depois de trocar a senha, mustChangePassword volta a false", async () => {
    const reset = await request(app).post(`/admin/users/${marina.user.id}/reset-password`).set("Authorization", `Bearer ${clinica.token}`);
    const login = await request(app).post("/auth/login").send({ email: "marina@x.com", password: reset.body.tempPassword });

    await request(app).post("/auth/change-password")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ newPassword: "senhaNovaDaMarina123" });

    const loginFinal = await request(app).post("/auth/login").send({ email: "marina@x.com", password: "senhaNovaDaMarina123" });
    assert.equal(loginFinal.status, 200);
    assert.equal(loginFinal.body.mustChangePassword, false);
  });

  test("só a clínica pode resetar senha de responsável", async () => {
    const res = await request(app).post(`/admin/users/${rafael.user.id}/reset-password`).set("Authorization", `Bearer ${marina.token}`);
    assert.equal(res.status, 403);
  });
});
