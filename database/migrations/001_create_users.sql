CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username VARCHAR(30) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(50) NOT NULL,
  avatar_url TEXT,
  status VARCHAR(10) NOT NULL DEFAULT 'offline'
    CHECK (status IN ('online', 'idle', 'offline')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_ci_unique
  ON users (LOWER(username));

CREATE UNIQUE INDEX IF NOT EXISTS users_email_ci_unique
  ON users (LOWER(email));
