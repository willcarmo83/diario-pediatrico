require("dotenv").config();
const { v4: uuid } = require("uuid");
const { pool, init } = require("./db");
const { hashPassword } = require("./src/utils/authUtils");

async function upsertUser(name, email, role) {
  const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (rows.length) return rows[0].id;
  const id = uuid();
  await pool.query(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
    [id, name, email, hashPassword("123456"), role]
  );
  return id;
}
async function upsertChild(name, birthdate) {
  const { rows } = await pool.query("SELECT id FROM children WHERE name = $1", [name]);
  if (rows.length) return rows[0].id;
  const id = uuid();
  await pool.query("INSERT INTO children (id, name, birthdate) VALUES ($1, $2, $3)", [id, name, birthdate]);
  return id;
}
async function linkGuardian(userId, childId, parentesco) {
  const { rows } = await pool.query(
    "SELECT 1 FROM guardian_child WHERE user_id = $1 AND child_id = $2", [userId, childId]
  );
  if (rows.length) return;
  await pool.query(
    "INSERT INTO guardian_child (id, user_id, child_id, parentesco) VALUES ($1, $2, $3, $4)",
    [uuid(), userId, childId, parentesco]
  );
}

async function main() {
  await init();

  const marina = await upsertUser("Marina Ferreira", "marina@exemplo.com", "RESPONSAVEL");
  const rafael = await upsertUser("Rafael Ferreira", "rafael@exemplo.com", "RESPONSAVEL");
  const carlos = await upsertUser("Carlos Ramos", "carlos@exemplo.com", "RESPONSAVEL");
  await upsertUser("Dra. Ana Souza", "ana@clinica.com", "CLINICA");

  const lucas = await upsertChild("Lucas Ferreira", "2019-04-12");
  await linkGuardian(marina, lucas, "MAE");
  await linkGuardian(rafael, lucas, "PAI");

  const sofia = await upsertChild("Sofia Ramos", "2021-11-03");
  await linkGuardian(carlos, sofia, "PAI");

  const AGUA = ["copo_cheio", "meio_copo", "gole"];
  const BANHEIRO = ["urina", "fezes", "ambos"];
  const start = new Date(new Date().getFullYear(), 0, 1);
  const today = new Date();

  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const dayIndex = Math.floor((d - start) / 86400000);
    const trend = dayIndex / 260;
    const aguaCount = Math.max(1, Math.round(4 + trend + (Math.random() * 2 - 1)));
    const banheiroCount = Math.max(1, Math.round(4 - trend + (Math.random() * 2 - 1)));
    for (let i = 0; i < aguaCount; i++) {
      const t = new Date(d); t.setHours(7 + Math.floor(Math.random() * 13), Math.floor(Math.random() * 60));
      const who = Math.random() < 0.5 ? marina : rafael;
      await pool.query(
        "INSERT INTO entries (id, child_id, type, subtype, timestamp, created_by_id) VALUES ($1,$2,$3,$4,$5,$6)",
        [uuid(), lucas, "AGUA", AGUA[Math.floor(Math.random() * 3)], t.toISOString(), who]
      );
    }
    for (let i = 0; i < banheiroCount; i++) {
      const t = new Date(d); t.setHours(7 + Math.floor(Math.random() * 13), Math.floor(Math.random() * 60));
      const who = Math.random() < 0.5 ? marina : rafael;
      await pool.query(
        "INSERT INTO entries (id, child_id, type, subtype, timestamp, created_by_id) VALUES ($1,$2,$3,$4,$5,$6)",
        [uuid(), lucas, "BANHEIRO", BANHEIRO[Math.floor(Math.random() * 3)], t.toISOString(), who]
      );
    }
  }

  console.log("Seed concluído.");
  console.log("Contas de teste (senha para todas: 123456):");
  console.log("  marina@exemplo.com   (mãe do Lucas)");
  console.log("  rafael@exemplo.com   (pai do Lucas)   <- mesmo filho que a Marina");
  console.log("  carlos@exemplo.com   (pai da Sofia)");
  console.log("  ana@clinica.com      (equipe da clínica)");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
