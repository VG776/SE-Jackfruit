CREATE TABLE IF NOT EXISTS communities (
  id          UUID         PRIMARY KEY,
  owner_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A user cannot own two communities with the same name (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS communities_owner_name_ci_unique
  ON communities (owner_id, LOWER(name));
