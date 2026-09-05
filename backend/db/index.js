const fs = require("fs");
const path = require("path");

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

let pool;

if (process.env.DATABASE_URL) {
  // Uso real: Neon, Supabase, RDS, etc.
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Neon/Supabase exigem SSL; em Postgres local isso nem entra em jogo.
    ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
  });
} else {
  // Sem DATABASE_URL definido: sobe um Postgres em memória (pg-mem) só para
  // rodar localmente sem precisar instalar nada. NÃO usar isso em produção —
  // os dados somem quando o processo reinicia. Defina DATABASE_URL para usar de verdade.
  console.warn("[db] DATABASE_URL não definido — usando Postgres em memória (pg-mem), dados não persistem.");
  const { newDb } = require("pg-mem");
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const adapter = db.adapters.createPg();
  pool = new adapter.Pool();
}

async function init() {
  await pool.query(schema);
}

module.exports = { pool, init };
