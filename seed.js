require("dotenv").config();
const { v4: uuid } = require("uuid");
const db = require("./db");
const { hashPassword } = require("./src/utils/authUtils");

function upsertUser(name, email, role) {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return existing.id;
  const id = uuid();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)")
    .run(id, name, email, hashPassword("123456"), role);
  return id;
}

const marina = upsertUser("Marina Ferreira", "marina@exemplo.com", "RESPONSAVEL");
const rafael = upsertUser("Rafael Ferreira", "rafael@exemplo.com", "RESPONSAVEL"); // pai do mesmo filho que a Marina
const carlos = upsertUser("Carlos Ramos", "carlos@exemplo.com", "RESPONSAVEL");
const drAna = upsertUser("Dra. Ana Souza", "ana@clinica.com", "CLINICA");

function upsertChild(name, birthdate) {
  const existing = db.prepare("SELECT id FROM children WHERE name = ?").get(name);
  if (existing) return existing.id;
  const id = uuid();
  db.prepare("INSERT INTO children (id, name, birthdate) VALUES (?, ?, ?)").run(id, name, birthdate);
  return id;
}
function linkGuardian(userId, childId, parentesco) {
  const exists = db.prepare("SELECT 1 FROM guardian_child WHERE user_id = ? AND child_id = ?").get(userId, childId);
  if (exists) return;
  db.prepare("INSERT INTO guardian_child (id, user_id, child_id, parentesco) VALUES (?, ?, ?, ?)")
    .run(uuid(), userId, childId, parentesco);
}

const lucas = upsertChild("Lucas Ferreira", "2019-04-12");
linkGuardian(marina, lucas, "MAE");
linkGuardian(rafael, lucas, "PAI"); // <- os dois registram pelo mesmo filho

const sofia = upsertChild("Sofia Ramos", "2021-11-03");
linkGuardian(carlos, sofia, "PAI");

// entradas de exemplo, metade feitas pela mãe, metade pelo pai
const AGUA = ["copo_cheio", "meio_copo", "gole"];
const BANHEIRO = ["urina", "fezes", "ambos"];
const start = new Date(new Date().getFullYear(), 0, 1);
const today = new Date();
const insertEntry = db.prepare(`
  INSERT INTO entries (id, child_id, type, subtype, timestamp, created_by_id) VALUES (?, ?, ?, ?, ?, ?)
`);
const tx = db.transaction(() => {
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const dayIndex = Math.floor((d - start) / 86400000);
    const trend = dayIndex / 260;
    const aguaCount = Math.max(1, Math.round(4 + trend + (Math.random() * 2 - 1)));
    const banheiroCount = Math.max(1, Math.round(4 - trend + (Math.random() * 2 - 1)));
    for (let i = 0; i < aguaCount; i++) {
      const t = new Date(d); t.setHours(7 + Math.floor(Math.random() * 13), Math.floor(Math.random() * 60));
      const who = Math.random() < 0.5 ? marina : rafael;
      insertEntry.run(uuid(), lucas, "AGUA", AGUA[Math.floor(Math.random() * 3)], t.toISOString(), who);
    }
    for (let i = 0; i < banheiroCount; i++) {
      const t = new Date(d); t.setHours(7 + Math.floor(Math.random() * 13), Math.floor(Math.random() * 60));
      const who = Math.random() < 0.5 ? marina : rafael;
      insertEntry.run(uuid(), lucas, "BANHEIRO", BANHEIRO[Math.floor(Math.random() * 3)], t.toISOString(), who);
    }
  }
});
tx();

console.log("Seed concluído.");
console.log("Contas de teste (senha para todas: 123456):");
console.log("  marina@exemplo.com   (mãe do Lucas)");
console.log("  rafael@exemplo.com   (pai do Lucas)   <- mesmo filho que a Marina");
console.log("  carlos@exemplo.com   (pai da Sofia)");
console.log("  ana@clinica.com      (equipe da clínica)");
