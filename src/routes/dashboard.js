const express = require("express");
const db = require("../../db");
const { requireAuth } = require("../middleware/auth");
const { isGuardianOf } = require("./children");

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

const AGUA_VALUE = { copo_cheio: 1, meio_copo: 0.5, gole: 0.25 };

function canAccessChild(req, childId) {
  return req.user.role === "CLINICA" || isGuardianOf(req.user.id, childId);
}
function fetchEntries(childId, start, end) {
  return db.prepare(`
    SELECT type, subtype, timestamp FROM entries
    WHERE child_id = ? AND deleted_at IS NULL AND timestamp >= ? AND timestamp <= ?
  `).all(childId, start, end);
}
function aguaTotal(rows) { return rows.filter(r => r.type === "AGUA").reduce((s, r) => s + (AGUA_VALUE[r.subtype] || 0), 0); }
function banheiroTotal(rows) { return rows.filter(r => r.type === "BANHEIRO").length; }

// GET /children/:childId/dashboard?period=diario|mensal|anual
router.get("/dashboard", (req, res) => {
  const { childId } = req.params;
  if (!canAccessChild(req, childId)) return res.status(403).json({ error: "Sem acesso a essa criança." });
  const period = req.query.period || "diario";
  const now = new Date();

  if (period === "diario") {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const rows = fetchEntries(childId, start.toISOString(), now.toISOString());
    return res.json({
      period,
      agua: aguaTotal(rows),
      urina: rows.filter(r => r.type === "BANHEIRO" && ["urina", "ambos"].includes(r.subtype)).length,
      fezes: rows.filter(r => r.type === "BANHEIRO" && ["fezes", "ambos"].includes(r.subtype)).length,
    });
  }

  if (period === "mensal") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const rows = fetchEntries(childId, start.toISOString(), now.toISOString());
    const byDay = Array.from({ length: daysInMonth }, (_, i) => ({ dia: i + 1, agua: 0, banheiro: 0 }));
    rows.forEach(r => {
      const d = new Date(r.timestamp).getDate() - 1;
      if (r.type === "AGUA") byDay[d].agua += AGUA_VALUE[r.subtype] || 0; else byDay[d].banheiro += 1;
    });
    return res.json({ period, series: byDay });
  }

  if (period === "anual") {
    const start = new Date(now.getFullYear(), 0, 1);
    const rows = fetchEntries(childId, start.toISOString(), now.toISOString());
    const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const byMonth = meses.map(m => ({ mes: m, agua: 0, banheiro: 0 }));
    rows.forEach(r => {
      const m = new Date(r.timestamp).getMonth();
      if (r.type === "AGUA") byMonth[m].agua += AGUA_VALUE[r.subtype] || 0; else byMonth[m].banheiro += 1;
    });
    return res.json({ period, series: byMonth });
  }

  res.status(400).json({ error: "period deve ser diario, mensal ou anual." });
});

// GET /children/:childId/diagnostico — compara últimos 7 dias com os 7 anteriores
router.get("/diagnostico", (req, res) => {
  const { childId } = req.params;
  if (!canAccessChild(req, childId)) return res.status(403).json({ error: "Sem acesso a essa criança." });

  const now = new Date();
  const d7 = new Date(now); d7.setDate(d7.getDate() - 7);
  const d14 = new Date(now); d14.setDate(d14.getDate() - 14);

  const recent = fetchEntries(childId, d7.toISOString(), now.toISOString());
  const previous = fetchEntries(childId, d14.toISOString(), d7.toISOString());

  function pct(cur, prev) {
    if (prev === 0) return cur === 0 ? 0 : 100;
    return Math.round(((cur - prev) / prev) * 100);
  }

  res.json({
    janela: "últimos 7 dias vs. 7 dias anteriores",
    agua: { atual: aguaTotal(recent), anterior: aguaTotal(previous), variacaoPct: pct(aguaTotal(recent), aguaTotal(previous)) },
    banheiro: { atual: banheiroTotal(recent), anterior: banheiroTotal(previous), variacaoPct: pct(banheiroTotal(recent), banheiroTotal(previous)) },
  });
});

module.exports = router;
