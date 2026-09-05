const express = require("express");
const { v4: uuid } = require("uuid");
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

// POST /children  { name, birthdate, parentesco }
router.post("/", requireRole("RESPONSAVEL"), async (req, res) => {
  const { name, birthdate, parentesco } = req.body;
  if (!name || !birthdate || !parentesco) {
    return res.status(400).json({ error: "name, birthdate e parentesco são obrigatórios." });
  }
  const childId = uuid();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO children (id, name, birthdate) VALUES ($1, $2, $3)", [childId, name, birthdate]);
    await client.query(
      "INSERT INTO guardian_child (id, user_id, child_id, parentesco) VALUES ($1, $2, $3, $4)",
      [uuid(), req.user.id, childId, parentesco]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  res.status(201).json({ id: childId, name, birthdate });
});

// POST /children/:id/guardians  { email, parentesco }
router.post("/:id/guardians", requireRole("RESPONSAVEL"), async (req, res) => {
  const childId = req.params.id;
  const { email, parentesco } = req.body;
  if (!(await isGuardianOf(req.user.id, childId))) {
    return res.status(403).json({ error: "Você não é responsável por essa criança." });
  }
  const { rows: others } = await pool.query("SELECT id, name FROM users WHERE email = $1", [email]);
  const other = others[0];
  if (!other) return res.status(404).json({ error: "Não existe conta cadastrada com esse email. Peça para a pessoa criar uma conta primeiro." });

  const { rows: already } = await pool.query(
    "SELECT 1 FROM guardian_child WHERE user_id = $1 AND child_id = $2", [other.id, childId]
  );
  if (already.length) return res.status(409).json({ error: "Essa pessoa já é responsável por essa criança." });

  await pool.query(
    "INSERT INTO guardian_child (id, user_id, child_id, parentesco) VALUES ($1, $2, $3, $4)",
    [uuid(), other.id, childId, parentesco || "OUTRO"]
  );

  res.status(201).json({ message: `${other.name} agora também registra por essa criança.` });
});

module.exports = router;
module.exports.isGuardianOf = isGuardianOf;
