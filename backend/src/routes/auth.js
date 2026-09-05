const express = require("express");
const { v4: uuid } = require("uuid");
const { pool } = require("../../db");
const { hashPassword, checkPassword, signToken } = require("../utils/authUtils");

const router = express.Router();

router.post("/register", async (req, res) => {
  const { name, email, password, role, inviteCode } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email e password são obrigatórios." });
  }
  // Cadastro público é sempre de RESPONSAVEL. Conta de equipe da clínica exige
  // o código de convite (só quem trabalha na clínica tem esse código) — sem isso,
  // qualquer visitante do site poderia se cadastrar como equipe e ver todos os pacientes.
  let finalRole = "RESPONSAVEL";
  if (role === "CLINICA") {
    if (!process.env.CLINIC_INVITE_CODE || inviteCode !== process.env.CLINIC_INVITE_CODE) {
      return res.status(403).json({ error: "Código de convite da clínica inválido." });
    }
    finalRole = "CLINICA";
  }

  const { rows: existing } = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.length) return res.status(409).json({ error: "Já existe uma conta com esse email." });

  const id = uuid();
  await pool.query(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
    [id, name, email, hashPassword(password), finalRole]
  );

  const user = { id, name, role: finalRole };
  res.status(201).json({ user, token: signToken(user) });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  const row = rows[0];
  if (!row || !checkPassword(password, row.password_hash)) {
    return res.status(401).json({ error: "Email ou senha inválidos." });
  }
  const user = { id: row.id, name: row.name, role: row.role };
  res.json({ user, token: signToken(user) });
});

module.exports = router;
