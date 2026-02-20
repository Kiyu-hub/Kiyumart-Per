-- Add interview-scheduled state to application status enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'interview_scheduled'
      AND enumtypid = 'application_status'::regtype
  ) THEN
    ALTER TYPE application_status ADD VALUE 'interview_scheduled';
  END IF;
END$$;

-- Track interview scheduling metadata on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS interview_scheduled_at timestamp;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS interview_scheduled_by text;

CREATE INDEX IF NOT EXISTS users_interview_scheduled_at_idx
  ON users (interview_scheduled_at);
