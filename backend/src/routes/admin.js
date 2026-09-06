const express = require("express");
const crypto = require("crypto");
const { pool } = require("../../db");
const { hashPassword } = require("../utils/authUtils");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

function generateTempPassword() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pass = "";
  for (let i = 0; i < 10; i++) pass += alphabet[crypto.randomInt(alphabet.length)];
  return pass;
}

// POST /admin/users/:userId/reset-password — só a clínica, e só afeta ESSE usuário
// específico (não os outros responsáveis da mesma criança). Marca must_change_password
// pra forçar a pessoa a escolher a própria senha no primeiro acesso.
router.post("/users/:userId/reset-password", requireRole("CLINICA"), async (req, res) => {
  const { userId } = req.params;
  const { rows } = await pool.query("SELECT id, name, role FROM users WHERE id = $1", [userId]);
  const target = rows[0];
  if (!target) return res.status(404).json({ error: "Usuário não encontrado." });
  if (target.role !== "RESPONSAVEL") {
    return res.status(400).json({ error: "Só é possível redefinir senha de contas de responsável." });
  }

  const tempPassword = generateTempPassword();
  await pool.query(
    "UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2",
    [hashPassword(tempPassword), userId]
  );
  res.json({ name: target.name, tempPassword });
});

module.exports = router;
