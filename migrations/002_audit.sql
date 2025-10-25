CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruleset_id INTEGER,
  execution_id INTEGER,
  short_hash TEXT,
  payload_snippet TEXT,
  result_snippet TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_ruleset ON audit_logs(ruleset_id);
