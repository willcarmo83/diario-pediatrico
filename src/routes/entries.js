const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { isGuardianOf } = require("./children");
const { publish, subscribe } = require("../eventBus");

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

const AGUA_SUBTIPOS = ["copo_cheio", "meio_copo", "gole"];
const BANHEIRO_SUBTIPOS = ["urina", "fezes", "ambos"];

function canAccessChild(req, childId) {
  return req.user.role === "CLINICA" || isGuardianOf(req.user.id, childId);
}
function toApi(row) {
  return {
    id: row.id, childId: row.child_id, type: row.type, subtype: row.subtype,
    timestamp: row.timestamp, note: row.note, createdById: row.created_by_id,
    createdByName: row.created_by_name, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

// POST /children/:childId/entries  { type, subtype, timestamp?, note? }
// Cada registro é um evento independente — dois pais podem inserir ao
// mesmo tempo sem conflito nenhum, cada um vira sua própria linha.
router.post("/", requireRole("RESPONSAVEL"), (req, res) => {
  const { childId } = req.params;
  const { type, subtype, timestamp, note } = req.body;
  if (!canAccessChild(req, childId)) return res.status(403).json({ error: "Você não é responsável por essa criança." });

  const validSubtypes = type === "AGUA" ? AGUA_SUBTIPOS : type === "BANHEIRO" ? BANHEIRO_SUBTIPOS : null;
  if (!validSubtypes) return res.status(400).json({ error: "type deve ser AGUA ou BANHEIRO." });
  if (!validSubtypes.includes(subtype)) return res.status(400).json({ error: `subtype inválido para ${type}.` });

  const id = uuid();
  const ts = timestamp || new Date().toISOString();
  db.prepare(`
    INSERT INTO entries (id, child_id, type, subtype, timestamp, note, created_by_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, childId, type, subtype, ts, note || null, req.user.id);

  const entry = { id, childId, type, subtype, timestamp: ts, note: note || null, createdById: req.user.id, createdByName: req.user.name };
  publish(childId, { kind: "created", entry }); // avisa em tempo real quem mais estiver olhando
  res.status(201).json(entry);
});

// GET /children/:childId/entries?desde=&ate=
router.get("/", (req, res) => {
  const { childId } = req.params;
  if (!canAccessChild(req, childId)) return res.status(403).json({ error: "Sem acesso a essa criança." });
  const { desde, ate } = req.query;
  const rows = db.prepare(`
    SELECT e.*, u.name AS created_by_name FROM entries e
    JOIN users u ON u.id = e.created_by_id
    WHERE e.child_id = ? AND e.deleted_at IS NULL
      AND (? IS NULL OR e.timestamp >= ?)
      AND (? IS NULL OR e.timestamp <= ?)
    ORDER BY e.timestamp DESC
  `).all(childId, desde || null, desde || null, ate || null, ate || null);
  res.json(rows.map(toApi));
});

// PUT /entries/:id  { subtype?, timestamp?, note? } — qualquer responsável
// da criança pode corrigir (ex: o pai corrige um registro que a mãe fez errado).
router.put("/entry/:entryId", requireRole("RESPONSAVEL"), (req, res) => {
  const { entryId } = req.params;
  const current = db.prepare("SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL").get(entryId);
  if (!current) return res.status(404).json({ error: "Registro não encontrado." });
  if (!isGuardianOf(req.user.id, current.child_id)) return res.status(403).json({ error: "Você não é responsável por essa criança." });

  const next = {
    subtype: req.body.subtype ?? current.subtype,
    timestamp: req.body.timestamp ?? current.timestamp,
    note: req.body.note ?? current.note,
  };

  const tx = db.transaction(() => {
    db.prepare("UPDATE entries SET subtype = ?, timestamp = ?, note = ?, updated_at = datetime('now') WHERE id = ?")
      .run(next.subtype, next.timestamp, next.note, entryId);
    db.prepare("INSERT INTO entry_audit (id, entry_id, edited_by_id, before_json, after_json) VALUES (?, ?, ?, ?, ?)")
      .run(uuid(), entryId, req.user.id, JSON.stringify(current), JSON.stringify(next));
  });
  tx();

  publish(current.child_id, { kind: "updated", entryId, changes: next });
  res.json({ id: entryId, ...next });
});

// DELETE /entries/:id — soft delete (fica registrado na auditoria, nunca some de vez)
router.delete("/entry/:entryId", requireRole("RESPONSAVEL"), (req, res) => {
  const { entryId } = req.params;
  const current = db.prepare("SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL").get(entryId);
  if (!current) return res.status(404).json({ error: "Registro não encontrado." });
  if (!isGuardianOf(req.user.id, current.child_id)) return res.status(403).json({ error: "Você não é responsável por essa criança." });

  const tx = db.transaction(() => {
    db.prepare("UPDATE entries SET deleted_at = datetime('now') WHERE id = ?").run(entryId);
    db.prepare("INSERT INTO entry_audit (id, entry_id, edited_by_id, before_json, after_json) VALUES (?, ?, ?, ?, ?)")
      .run(uuid(), entryId, req.user.id, JSON.stringify(current), JSON.stringify({ deleted: true }));
  });
  tx();

  publish(current.child_id, { kind: "deleted", entryId });
  res.status(204).send();
});

// GET /children/:childId/stream — Server-Sent Events: tempo real.
// O outro responsável (ou a clínica) recebe o registro assim que ele é criado,
// sem precisar dar refresh na tela.
router.get("/stream", (req, res) => {
  const { childId } = req.params;
  if (!canAccessChild(req, childId)) return res.status(403).end();

  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  res.write(`event: ping\ndata: "conectado"\n\n`);

  const unsubscribe = subscribe(childId, (event) => {
    res.write(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
  });
  req.on("close", unsubscribe);
});

module.exports = router;
