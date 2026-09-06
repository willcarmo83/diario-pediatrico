-- ---------------------------------------------------------------
-- Diário Pediátrico — schema Postgres (Neon, Supabase, RDS, etc.)
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('RESPONSAVEL', 'CLINICA')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Adicionada depois da criação inicial da tabela — CREATE TABLE IF NOT EXISTS não
-- retroage em bancos que já existem, por isso o ALTER separado e idempotente.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS children (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  birthdate  DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela N:N que resolve os dois requisitos centrais:
-- "responsável com mais de um filho" e "pai e mãe registrando
-- para o mesmo filho" (cada um com login próprio).
CREATE TABLE IF NOT EXISTS guardian_child (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_id   TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  parentesco TEXT NOT NULL CHECK (parentesco IN ('MAE', 'PAI', 'OUTRO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, child_id)
);
CREATE INDEX IF NOT EXISTS idx_guardian_child_child ON guardian_child(child_id);
CREATE INDEX IF NOT EXISTS idx_guardian_child_user ON guardian_child(user_id);

CREATE TABLE IF NOT EXISTS entries (
  id            TEXT PRIMARY KEY,
  child_id      TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('AGUA', 'BANHEIRO')),
  subtype       TEXT NOT NULL,
  timestamp     TIMESTAMPTZ NOT NULL,
  note          TEXT,
  created_by_id TEXT NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_entries_child_ts ON entries(child_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_entries_child_type_ts ON entries(child_id, type, timestamp);

CREATE TABLE IF NOT EXISTS entry_audit (
  id            TEXT PRIMARY KEY,
  entry_id      TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  edited_by_id  TEXT NOT NULL REFERENCES users(id),
  before_json   TEXT NOT NULL,
  after_json    TEXT NOT NULL,
  edited_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entry_audit_entry ON entry_audit(entry_id);

-- Convites: só a clínica cadastra uma criança, e só quem tiver o código consegue
-- criar conta de responsável vinculada a ela. Fecha a porta de qualquer visitante
-- se auto-cadastrar como responsável de uma criança que não existe/não é paciente.
CREATE TABLE IF NOT EXISTS invites (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  child_id      TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  created_by_id TEXT NOT NULL REFERENCES users(id),
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code);
CREATE INDEX IF NOT EXISTS idx_invites_child ON invites(child_id);
