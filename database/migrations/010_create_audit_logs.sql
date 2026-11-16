-- Audit trail for security-relevant moderation events (FR-MOD-03).
-- Created with US-16 because message moderation must be audited atomically; US-18 builds on it.
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY,
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(30) NOT NULL,
  target_id UUID NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_community_created
  ON audit_logs (community_id, created_at);
