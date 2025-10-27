-- Add versioning to rule_sets
ALTER TABLE rule_sets ADD COLUMN version_number INTEGER DEFAULT 1;
ALTER TABLE rule_sets ADD COLUMN status TEXT DEFAULT 'active';

-- Add versioning to workflows
ALTER TABLE workflows ADD COLUMN version_number INTEGER DEFAULT 1;
ALTER TABLE workflows ADD COLUMN status TEXT DEFAULT 'active';

-- Update executions table to reference exact version
ALTER TABLE executions ADD COLUMN rule_set_version INTEGER DEFAULT 1;
ALTER TABLE executions ADD COLUMN workflow_version INTEGER DEFAULT 1;
