CREATE TABLE IF NOT EXISTS direct_conversations (
  id UUID PRIMARY KEY,
  user_a_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT direct_conversations_user_order_check CHECK (user_a_id < user_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS direct_conversations_pair_unique
  ON direct_conversations (user_a_id, user_b_id);

CREATE TABLE IF NOT EXISTS direct_messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content VARCHAR(2000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation_created_at
  ON direct_messages (conversation_id, created_at);
