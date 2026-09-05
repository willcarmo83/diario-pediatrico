const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../../db");
const { hashPassword, checkPassword, signToken } = require("../utils/authUtils");

const router = express.Router();

// POST /auth/register  { name, email, password, role }
router.post("/register", (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "name, email, password e role são obrigatórios." });
  }
  if (!["RESPONSAVEL", "CLINICA"].includes(role)) {
    return res.status(400).json({ error: "role deve ser RESPONSAVEL ou CLINICA." });
  }
  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (exists) return res.status(409).json({ error: "Já existe uma conta com esse email." });

  const id = uuid();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)"
  ).run(id, name, email, hashPassword(password), role);

  const user = { id, name, role };
  res.status(201).json({ user, token: signToken(user) });
});

// POST /auth/login  { email, password }
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!row || !checkPassword(password, row.password_hash)) {
    return res.status(401).json({ error: "Email ou senha inválidos." });
  }
  const user = { id: row.id, name: row.name, role: row.role };
  res.json({ user, token: signToken(user) });
});

module.exports = router;
