const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

function isGuardianOf(userId, childId) {
  return !!db.prepare("SELECT 1 FROM guardian_child WHERE user_id = ? AND child_id = ?").get(userId, childId);
}

// GET /children — crianças do responsável logado (ou todas, se for a clínica)
router.get("/", (req, res) => {
  if (req.user.role === "CLINICA") {
    const rows = db.prepare(`
      SELECT c.id, c.name, c.birthdate,
        json_group_array(json_object('name', u.name, 'phone', u.email, 'parentesco', gc.parentesco)) AS guardians
      FROM children c
      LEFT JOIN guardian_child gc ON gc.child_id = c.id
      LEFT JOIN users u ON u.id = gc.user_id
      GROUP BY c.id
      ORDER BY c.name
    `).all();
    return res.json(rows.map(r => ({ ...r, guardians: JSON.parse(r.guardians) })));
  }
  const rows = db.prepare(`
    SELECT c.id, c.name, c.birthdate, gc.parentesco AS meuParentesco
    FROM children c
    JOIN guardian_child gc ON gc.child_id = c.id
    WHERE gc.user_id = ?
    ORDER BY c.name
  `).all(req.user.id);
  res.json(rows);
});

// POST /children  { name, birthdate, parentesco }
// Cria a criança e já vincula quem criou como o primeiro responsável.
router.post("/", requireRole("RESPONSAVEL"), (req, res) => {
  const { name, birthdate, parentesco } = req.body;
  if (!name || !birthdate || !parentesco) {
    return res.status(400).json({ error: "name, birthdate e parentesco são obrigatórios." });
  }
  const childId = uuid();
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO children (id, name, birthdate) VALUES (?, ?, ?)").run(childId, name, birthdate);
    db.prepare(
      "INSERT INTO guardian_child (id, user_id, child_id, parentesco) VALUES (?, ?, ?, ?)"
    ).run(uuid(), req.user.id, childId, parentesco);
  });
  tx();
  res.status(201).json({ id: childId, name, birthdate });
});

// POST /children/:id/guardians  { email, parentesco }
// Vincula um SEGUNDO responsável (ex: o outro pai/mãe) à mesma criança.
// Só quem já é responsável da criança pode convidar outro.
router.post("/:id/guardians", requireRole("RESPONSAVEL"), (req, res) => {
  const childId = req.params.id;
  const { email, parentesco } = req.body;
  if (!isGuardianOf(req.user.id, childId)) {
    return res.status(403).json({ error: "Você não é responsável por essa criança." });
  }
  const other = db.prepare("SELECT id, name FROM users WHERE email = ?").get(email);
  if (!other) return res.status(404).json({ error: "Não existe conta cadastrada com esse email. Peça para a pessoa criar uma conta primeiro." });

  const already = db.prepare("SELECT 1 FROM guardian_child WHERE user_id = ? AND child_id = ?").get(other.id, childId);
  if (already) return res.status(409).json({ error: "Essa pessoa já é responsável por essa criança." });

  db.prepare(
    "INSERT INTO guardian_child (id, user_id, child_id, parentesco) VALUES (?, ?, ?, ?)"
  ).run(uuid(), other.id, childId, parentesco || "OUTRO");

  res.status(201).json({ message: `${other.name} agora também registra por essa criança.` });
});

module.exports = router;
module.exports.isGuardianOf = isGuardianOf;
