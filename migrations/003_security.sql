-- API keys table: store hashed key, role, and metadata
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL, -- e.g., 'admin' | 'developer' | 'readonly'
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Roles table (optional / informational)
CREATE TABLE IF NOT EXISTS roles (
  role TEXT PRIMARY KEY,
  description TEXT
);

-- Rate limiter table: window granularity + atomic increments via UPSERT
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL, -- epoch seconds of window start
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
