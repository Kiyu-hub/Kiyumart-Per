ALTER TABLE support_conversations
  ADD COLUMN IF NOT EXISTS routing_mode varchar(32) NOT NULL DEFAULT 'all_support',
  ADD COLUMN IF NOT EXISTS routing_user_ids jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_support_responder_id varchar REFERENCES users(id);

CREATE INDEX IF NOT EXISTS support_conversations_routing_mode_idx
  ON support_conversations (routing_mode);

CREATE INDEX IF NOT EXISTS support_conversations_last_support_responder_idx
  ON support_conversations (last_support_responder_id);
