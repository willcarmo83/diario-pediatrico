-- ---------------------------------------------------------------
-- Diário Pediátrico — schema SQLite (dev). Em produção, a mesma
-- estrutura roda em Postgres quase sem mudanças (ver README).
-- ---------------------------------------------------------------

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('RESPONSAVEL', 'CLINICA')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS children (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  birthdate  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tabela N:N que resolve os dois requisitos centrais:
-- "responsável com mais de um filho" e "pai e mãe registrando
-- para o mesmo filho" (cada um com login próprio).
CREATE TABLE IF NOT EXISTS guardian_child (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_id   TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  parentesco TEXT NOT NULL CHECK (parentesco IN ('MAE', 'PAI', 'OUTRO')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, child_id)
);
CREATE INDEX IF NOT EXISTS idx_guardian_child_child ON guardian_child(child_id);
CREATE INDEX IF NOT EXISTS idx_guardian_child_user ON guardian_child(user_id);

CREATE TABLE IF NOT EXISTS entries (
  id                TEXT PRIMARY KEY,
  child_id          TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  type              TEXT NOT NULL CHECK (type IN ('AGUA', 'BANHEIRO')),
  subtype           TEXT NOT NULL,  -- copo_cheio/meio_copo/gole | urina/fezes/ambos
  timestamp         TEXT NOT NULL,  -- horário do evento em si (editável)
  note              TEXT,
  created_by_id     TEXT NOT NULL REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')), -- quando ENTROU no sistema
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at        TEXT          -- soft delete: dado clínico nunca é apagado de fato
);
CREATE INDEX IF NOT EXISTS idx_entries_child_ts ON entries(child_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_entries_child_type_ts ON entries(child_id, type, timestamp);

-- Toda edição de um registro gera uma linha aqui — auditoria exigida
-- para dado de saúde (quem mudou o quê e quando).
CREATE TABLE IF NOT EXISTS entry_audit (
  id            TEXT PRIMARY KEY,
  entry_id      TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  edited_by_id  TEXT NOT NULL REFERENCES users(id),
  before_json   TEXT NOT NULL,
  after_json    TEXT NOT NULL,
  edited_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_entry_audit_entry ON entry_audit(entry_id);
