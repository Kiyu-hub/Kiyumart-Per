ALTER TABLE support_messages
  ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_at timestamp;

ALTER TABLE support_conversations
  ADD COLUMN IF NOT EXISTS first_response_at timestamp,
  ADD COLUMN IF NOT EXISTS resolved_at timestamp;

CREATE INDEX IF NOT EXISTS support_messages_conversation_read_idx
  ON support_messages (conversation_id, is_read, created_at);

CREATE INDEX IF NOT EXISTS support_conversations_status_updated_idx
  ON support_conversations (status, updated_at);
