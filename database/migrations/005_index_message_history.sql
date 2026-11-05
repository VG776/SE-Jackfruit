CREATE INDEX IF NOT EXISTS idx_messages_channel_created_id
  ON messages (channel_id, created_at DESC, id DESC);
