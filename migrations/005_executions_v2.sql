-- Add checkpoint and result storage to executions
ALTER TABLE executions ADD COLUMN current_step_id TEXT;
ALTER TABLE executions ADD COLUMN checkpoint TEXT;  -- JSON string of intermediate state
ALTER TABLE executions ADD COLUMN started_at DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE executions ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;
