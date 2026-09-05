const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "dev.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL"); // permite múltiplas leituras/escritas concorrentes
// (pais diferentes registrando ao mesmo tempo não travam uns aos outros)

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
db.exec(schema);

module.exports = db;
