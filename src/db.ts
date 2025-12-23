/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database;
  API_CACHE: KVNamespace;
}

// Create or update rule set
export async function createOrUpdateRuleSet(env: Env, name: string, description: string, ruleJson: object) {
  const existing = await env.DB.prepare(
    "SELECT * FROM rule_sets WHERE name = ?1 ORDER BY version_number DESC LIMIT 1"
  ).bind(name).first();

  const nextVersion = existing ? existing.version_number + 1 : 1;

  await env.DB.prepare(
    `INSERT INTO rule_sets (name, description, rule_json, version_number, status)
     VALUES (?1, ?2, ?3, ?4, 'active')`
  ).bind(name, description, JSON.stringify(ruleJson), nextVersion).run();

  if (existing) {
    await env.DB.prepare(
      "UPDATE rule_sets SET status='deprecated' WHERE name=?1 AND version_number<?2"
    ).bind(name, nextVersion).run();
  }

  // Cache the latest version to reduce D1 reads
  await env.API_CACHE.put(`rule-latest-${name}`, JSON.stringify({ version: nextVersion, ruleJson }));

  return nextVersion;
}

// Get latest active rule set
export async function getLatestRuleSet(env: Env, name: string) {
  const cached = await env.API_CACHE.get(`rule-latest-${name}`, "json");
  if (cached) return cached;

  const rs = await env.DB.prepare(
    "SELECT * FROM rule_sets WHERE name=?1 AND status='active' ORDER BY version_number DESC LIMIT 1"
  ).bind(name).first();

  if (rs) {
    await env.API_CACHE.put(`rule-latest-${name}`, JSON.stringify(rs));
  }

  return rs;
}

// Get specific version
export async function getRuleSetByVersion(env: Env, name: string, version: number) {
  return await env.DB.prepare(
    "SELECT * FROM rule_sets WHERE name=?1 AND version_number=?2"
  ).bind(name, version).first();
}

// Create or update workflow
export async function createOrUpdateWorkflow(env: Env, name: string, description: string, stepsJson: any) {
  const existing = await env.DB.prepare(
    "SELECT * FROM workflows WHERE name = ?1 ORDER BY version_number DESC LIMIT 1"
  ).bind(name).first();

  const nextVersion = existing ? existing.version_number + 1 : 1;

  await env.DB.prepare(
    `INSERT INTO workflows (name, description, steps_json, version_number, status)
     VALUES (?1, ?2, ?3, ?4, 'active')`
  ).bind(name, description, JSON.stringify(stepsJson), nextVersion).run();

  if (existing) {
    await env.DB.prepare(
      "UPDATE workflows SET status='deprecated' WHERE name=?1 AND version_number<?2"
    ).bind(name, nextVersion).run();
  }

  await env.API_CACHE.put(`workflow-latest-${name}`, JSON.stringify({ version: nextVersion, stepsJson }));

  return nextVersion;
}

// Get latest active workflow
export async function getLatestWorkflow(env: Env, name: string) {
  const cached = await env.API_CACHE.get(`workflow-latest-${name}`, "json");
  if (cached) return cached;

  const wf = await env.DB.prepare(
    "SELECT * FROM workflows WHERE name=?1 AND status='active' ORDER BY version_number DESC LIMIT 1"
  ).bind(name).first();

  if (wf) {
    await env.API_CACHE.put(`workflow-latest-${name}`, JSON.stringify(wf));
  }

  return wf;
}

// Get specific version of a workflow
export async function getWorkflowByVersion(env: Env, name: string, version: number) {
  return await env.DB.prepare(
    "SELECT * FROM workflows WHERE name=?1 AND version_number=?2"
  ).bind(name, version).first();
}

// Get workflow by ID
export async function getWorkflow(env: Env, id: number) {
  return await env.DB.prepare(
    "SELECT * FROM workflows WHERE id=?1"
  ).bind(id).first();
}

// Get rule set by ID
export async function getRuleSet(env: Env, id: number) {
  return await env.DB.prepare(
    "SELECT * FROM rule_sets WHERE id=?1"
  ).bind(id).first();
}


export async function insertExecution(env: Env, data: {
  workflow_id?: number;
  rule_set_id?: number;
  rule_set_version?: number;
  workflow_version?: number;
  input_json: any;
  result_json: any;
  status: string;
}) {
  const stmt = env.DB.prepare(`
    INSERT INTO executions (workflow_id, rule_set_id, rule_set_version, workflow_version, input_json, result_json, status)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
  `);
  await stmt.bind(
    data.workflow_id || null,
    data.rule_set_id || null,
    data.rule_set_version || null,
    data.workflow_version || null,
    JSON.stringify(data.input_json),
    JSON.stringify(data.result_json),
    data.status
  ).run();
}

export async function listExecutions(env: Env) {
  const stmt = env.DB.prepare(`SELECT * FROM executions ORDER BY created_at DESC LIMIT 50`);
  const res = await stmt.all();
  return res.results || [];
}

export async function insertAuditLog(env: Env, data: {
  ruleset_id?: number;
  execution_id?: number | null;
  short_hash?: string;
  payload_snippet?: string;
  result_snippet?: string;
}) {
  const stmt = env.DB.prepare(`
    INSERT INTO audit_logs (ruleset_id, execution_id, short_hash, payload_snippet, result_snippet)
    VALUES (?1, ?2, ?3, ?4, ?5)
  `);
  await stmt.bind(
    data.ruleset_id || null,
    data.execution_id || null,
    data.short_hash || null,
    data.payload_snippet || null,
    data.result_snippet || null
  ).run();
}

export async function createApiKey(env: Env, name: string, role: string, salt: string, hash: string, createdBy?: string) {
  const stmt = env.DB.prepare(`INSERT INTO api_keys (name, key_hash, salt, role, created_by) VALUES (?1, ?2, ?3, ?4, ?5)`);
  await stmt.bind(name, hash, salt, role, createdBy || null).run();
}

export async function findApiKeyByHash(env: Env, hash: string) {
  const stmt = env.DB.prepare(`SELECT * FROM api_keys WHERE key_hash = ?1`);
  const res = await stmt.bind(hash).first();
  return res || null;
}

export async function getApiKeyById(env: Env, id: number) {
  const stmt = env.DB.prepare(`SELECT id, name, role, created_at FROM api_keys WHERE id = ?1`);
  const res = await stmt.bind(id).first();
  return res || null;
}
