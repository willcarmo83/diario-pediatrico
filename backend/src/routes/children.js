const express = require("express");
const { v4: uuid } = require("uuid");
const crypto = require("crypto");
const { pool } = require("../../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

async function isGuardianOf(userId, childId) {
  const { rows } = await pool.query(
    "SELECT 1 FROM guardian_child WHERE user_id = $1 AND child_id = $2", [userId, childId]
  );
  return rows.length > 0;
}
function generateCode() {
  // código curto, fácil de digitar/ditar por telefone (sem caracteres ambíguos tipo 0/O, 1/I)
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[crypto.randomInt(alphabet.length)];
  return code;
}

// GET /children
router.get("/", async (req, res) => {
  if (req.user.role === "CLINICA") {
    const { rows: kids } = await pool.query("SELECT id, name, birthdate FROM children ORDER BY name");
    const { rows: guardianRows } = await pool.query(`
      SELECT gc.child_id, u.name, u.email, gc.parentesco
      FROM guardian_child gc JOIN users u ON u.id = gc.user_id
    `);
    const guardiansByChild = {};
    guardianRows.forEach(g => {
      (guardiansByChild[g.child_id] = guardiansByChild[g.child_id] || []).push(
        { name: g.name, email: g.email, parentesco: g.parentesco }
      );
    });
    return res.json(kids.map(c => ({ ...c, guardians: guardiansByChild[c.id] || [] })));
  }
  const { rows } = await pool.query(`
    SELECT c.id, c.name, c.birthdate, gc.parentesco AS "meuParentesco"
    FROM children c
    JOIN guardian_child gc ON gc.child_id = c.id
    WHERE gc.user_id = $1
    ORDER BY c.name
  `, [req.user.id]);
  res.json(rows);
});

// POST /children  { name, birthdate } — só a clínica cadastra crianças.
// Os responsáveis entram depois, usando o código de convite gerado logo abaixo.
router.post("/", requireRole("CLINICA"), async (req, res) => {
  const { name, birthdate } = req.body;
  if (!name || !birthdate) return res.status(400).json({ error: "name e birthdate são obrigatórios." });
  if (name.length > 200) return res.status(400).json({ error: "name muito longo." });

  const childId = uuid();
  await pool.query("INSERT INTO children (id, name, birthdate) VALUES ($1, $2, $3)", [childId, name, birthdate]);
  res.status(201).json({ id: childId, name, birthdate });
});

// POST /children/:id/invites — gera um novo código de convite pra essa criança.
// A clínica compartilha esse código com a família (WhatsApp, no consultório, etc.);
// os dois responsáveis podem usar o MESMO código, cada um escolhendo seu parentesco.
router.post("/:id/invites", requireRole("CLINICA"), async (req, res) => {
  const childId = req.params.id;
  const { rows } = await pool.query("SELECT id FROM children WHERE id = $1", [childId]);
  if (!rows.length) return res.status(404).json({ error: "Criança não encontrada." });

  let code;
  for (let attempt = 0; attempt < 5; attempt++) {
    code = generateCode();
    const { rows: clash } = await pool.query("SELECT 1 FROM invites WHERE code = $1", [code]);
    if (!clash.length) break;
  }
  const id = uuid();
  await pool.query(
    "INSERT INTO invites (id, code, child_id, created_by_id) VALUES ($1, $2, $3, $4)",
    [id, code, childId, req.user.id]
  );
  res.status(201).json({ id, code });
});

// GET /children/:id/invites — lista convites ativos (pra clínica reenviar/conferir)
router.get("/:id/invites", requireRole("CLINICA"), async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, code, created_at FROM invites WHERE child_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC",
    [req.params.id]
  );
  res.json(rows);
});

module.exports = router;
module.exports.isGuardianOf = isGuardianOf;
module.exports.generateCode = generateCode;
