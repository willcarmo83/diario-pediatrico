const express = require("express");
const { v4: uuid } = require("uuid");
const { pool } = require("../../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { isGuardianOf } = require("./children");
const { publish, subscribe } = require("../eventBus");

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

const AGUA_SUBTIPOS = ["copo_cheio", "meio_copo", "gole"];
const BANHEIRO_SUBTIPOS = ["urina", "fezes", "ambos"];

async function canAccessChild(req, childId) {
  return req.user.role === "CLINICA" || (await isGuardianOf(req.user.id, childId));
}
function toApi(row) {
  return {
    id: row.id, childId: row.child_id, type: row.type, subtype: row.subtype,
    timestamp: row.timestamp, note: row.note, createdById: row.created_by_id,
    createdByName: row.created_by_name, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

router.post("/", requireRole("RESPONSAVEL"), async (req, res) => {
  const { childId } = req.params;
  const { type, subtype, timestamp, note } = req.body;
  if (!(await canAccessChild(req, childId))) return res.status(403).json({ error: "Você não é responsável por essa criança." });

  const validSubtypes = type === "AGUA" ? AGUA_SUBTIPOS : type === "BANHEIRO" ? BANHEIRO_SUBTIPOS : null;
  if (!validSubtypes) return res.status(400).json({ error: "type deve ser AGUA ou BANHEIRO." });
  if (!validSubtypes.includes(subtype)) return res.status(400).json({ error: `subtype inválido para ${type}.` });

  const id = uuid();
  const ts = timestamp || new Date().toISOString();
  await pool.query(`
    INSERT INTO entries (id, child_id, type, subtype, timestamp, note, created_by_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [id, childId, type, subtype, ts, note || null, req.user.id]);

  const entry = { id, childId, type, subtype, timestamp: ts, note: note || null, createdById: req.user.id, createdByName: req.user.name };
  publish(childId, { kind: "created", entry });
  res.status(201).json(entry);
});

router.get("/", async (req, res) => {
  const { childId } = req.params;
  if (!(await canAccessChild(req, childId))) return res.status(403).json({ error: "Sem acesso a essa criança." });
  const { desde, ate } = req.query;
  const { rows } = await pool.query(`
    SELECT e.*, u.name AS created_by_name FROM entries e
    JOIN users u ON u.id = e.created_by_id
    WHERE e.child_id = $1 AND e.deleted_at IS NULL
      AND ($2::timestamptz IS NULL OR e.timestamp >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR e.timestamp <= $3::timestamptz)
    ORDER BY e.timestamp DESC
  `, [childId, desde || null, ate || null]);
  res.json(rows.map(toApi));
});

router.put("/entry/:entryId", requireRole("RESPONSAVEL"), async (req, res) => {
  const { entryId } = req.params;
  const { rows } = await pool.query("SELECT * FROM entries WHERE id = $1 AND deleted_at IS NULL", [entryId]);
  const current = rows[0];
  if (!current) return res.status(404).json({ error: "Registro não encontrado." });
  if (!(await isGuardianOf(req.user.id, current.child_id))) return res.status(403).json({ error: "Você não é responsável por essa criança." });

  const next = {
    subtype: req.body.subtype ?? current.subtype,
    timestamp: req.body.timestamp ?? current.timestamp,
    note: req.body.note ?? current.note,
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE entries SET subtype = $1, timestamp = $2, note = $3, updated_at = now() WHERE id = $4",
      [next.subtype, next.timestamp, next.note, entryId]
    );
    await client.query(
      "INSERT INTO entry_audit (id, entry_id, edited_by_id, before_json, after_json) VALUES ($1, $2, $3, $4, $5)",
      [uuid(), entryId, req.user.id, JSON.stringify(current), JSON.stringify(next)]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK"); throw e;
  } finally { client.release(); }

  publish(current.child_id, { kind: "updated", entryId, changes: next });
  res.json({ id: entryId, ...next });
});

router.delete("/entry/:entryId", requireRole("RESPONSAVEL"), async (req, res) => {
  const { entryId } = req.params;
  const { rows } = await pool.query("SELECT * FROM entries WHERE id = $1 AND deleted_at IS NULL", [entryId]);
  const current = rows[0];
  if (!current) return res.status(404).json({ error: "Registro não encontrado." });
  if (!(await isGuardianOf(req.user.id, current.child_id))) return res.status(403).json({ error: "Você não é responsável por essa criança." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE entries SET deleted_at = now() WHERE id = $1", [entryId]);
    await client.query(
      "INSERT INTO entry_audit (id, entry_id, edited_by_id, before_json, after_json) VALUES ($1, $2, $3, $4, $5)",
      [uuid(), entryId, req.user.id, JSON.stringify(current), JSON.stringify({ deleted: true })]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK"); throw e;
  } finally { client.release(); }

  publish(current.child_id, { kind: "deleted", entryId });
  res.status(204).send();
});

router.get("/stream", async (req, res) => {
  const { childId } = req.params;
  if (!(await canAccessChild(req, childId))) return res.status(403).end();

  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  res.write(`event: ping\ndata: "conectado"\n\n`);

  const unsubscribe = subscribe(childId, (event) => {
    res.write(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
  });
  req.on("close", unsubscribe);
});

module.exports = router;
