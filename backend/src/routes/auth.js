const express = require("express");
const { v4: uuid } = require("uuid");
const { pool } = require("../../db");
const { hashPassword, checkPassword, signToken } = require("../utils/authUtils");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/register", async (req, res) => {
  const { name, role, inviteCode, parentesco } = req.body;
  const email = (req.body.email || "").trim().toLowerCase();
  const password = req.body.password;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email e password são obrigatórios." });
  }
  if (name.length > 200 || email.length > 200) return res.status(400).json({ error: "Campo muito longo." });

  const { rows: existing } = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.length) return res.status(409).json({ error: "Já existe uma conta com esse email." });

  // Conta de equipe da clínica: exige o código global da clínica.
  if (role === "CLINICA") {
    if (!process.env.CLINIC_INVITE_CODE || inviteCode !== process.env.CLINIC_INVITE_CODE) {
      return res.status(403).json({ error: "Código de convite da clínica inválido." });
    }
    const id = uuid();
    await pool.query(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
      [id, name, email, hashPassword(password), "CLINICA"]
    );
    const user = { id, name, role: "CLINICA" };
    return res.status(201).json({ user, token: signToken(user) });
  }

  // Conta de responsável: exige um código de convite específico de uma criança,
  // gerado pela clínica. Sem código válido, ninguém cria conta de responsável —
  // isso impede qualquer visitante de se cadastrar e inventar crianças/pacientes.
  if (!inviteCode) {
    return res.status(400).json({ error: "É preciso um código de convite da clínica pra criar conta." });
  }
  const { rows: invites } = await pool.query(
    "SELECT * FROM invites WHERE code = $1 AND revoked_at IS NULL", [inviteCode]
  );
  const invite = invites[0];
  if (!invite) return res.status(403).json({ error: "Código de convite inválido, expirado ou revogado." });

  const { rows: childRows } = await pool.query("SELECT id, name FROM children WHERE id = $1", [invite.child_id]);
  const child = childRows[0];

  const id = uuid();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'RESPONSAVEL')",
      [id, name, email, hashPassword(password)]
    );
    await client.query(
      "INSERT INTO guardian_child (id, user_id, child_id, parentesco) VALUES ($1, $2, $3, $4)",
      [uuid(), id, invite.child_id, parentesco || "OUTRO"]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK"); throw e;
  } finally { client.release(); }

  const user = { id, name, role: "RESPONSAVEL" };
  res.status(201).json({ user, token: signToken(user), child: child ? { id: child.id, name: child.name } : null });
});

router.post("/login", async (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const { password } = req.body;
  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  const row = rows[0];
  if (!row || !checkPassword(password, row.password_hash)) {
    return res.status(401).json({ error: "Email ou senha inválidos." });
  }
  const user = { id: row.id, name: row.name, role: row.role };
  res.json({ user, token: signToken(user), mustChangePassword: row.must_change_password });
});

// POST /auth/change-password  { newPassword } — autenticado (o próprio usuário troca a senha).
// Usado tanto por quem quer trocar por vontade própria, quanto (obrigatoriamente) por quem
// recebeu uma senha temporária da clínica depois de um reset.
router.post("/change-password", requireAuth, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "A nova senha precisa ter pelo menos 6 caracteres." });
  }
  await pool.query(
    "UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2",
    [hashPassword(newPassword), req.user.id]
  );
  res.json({ ok: true });
});

module.exports = router;
