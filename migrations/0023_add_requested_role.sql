ALTER TABLE users
ADD COLUMN IF NOT EXISTS requested_role user_role;

CREATE INDEX IF NOT EXISTS users_requested_role_idx ON users(requested_role);
