export interface Env {
  DB: D1Database;
}

export async function insertRuleSet(env: Env, name: string, description: string, ruleJson: object) {
  const stmt = env.DB.prepare(
    `INSERT INTO rule_sets (name, description, rule_json) VALUES (?1, ?2, ?3)`
  );
  await stmt.bind(name, description, JSON.stringify(ruleJson)).run();
}

export async function getRuleSet(env: Env, id: number) {
  const stmt = env.DB.prepare(`SELECT * FROM rule_sets WHERE id = ?1`);
  const res = await stmt.bind(id).first();
  if (res && res.rule_json) {
    res.rule_json = JSON.parse(res.rule_json);
  }
  return res;
}

export async function listRuleSets(env: Env) {
  const stmt = env.DB.prepare(`SELECT id, name, description, created_at FROM rule_sets`);
  const res = await stmt.all();
  return res.results || [];
}

export async function insertExecution(env: Env, data: {
  workflow_id?: number;
  rule_set_id?: number;
  input_json: any;
  result_json: any;
  status: string;
}) {
  const stmt = env.DB.prepare(`
    INSERT INTO executions (workflow_id, rule_set_id, input_json, result_json, status)
    VALUES (?1, ?2, ?3, ?4, ?5)
  `);
  await stmt.bind(
    data.workflow_id || null,
    data.rule_set_id || null,
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

export async function insertWorkflow(env: Env, name: string, description: string, stepsJson: any) {
  const stmt = env.DB.prepare(
    `INSERT INTO workflows (name, description, steps_json) VALUES (?1, ?2, ?3)`
  );
  await stmt.bind(name, description, JSON.stringify(stepsJson)).run();
}

export async function getWorkflow(env: Env, id: number) {
  const stmt = env.DB.prepare(`SELECT * FROM workflows WHERE id = ?1`);
  const wf = await stmt.bind(id).first();
  if (wf && wf.steps_json) wf.steps_json = JSON.parse(wf.steps_json);
  return wf;
}

export async function listWorkflows(env: Env) {
  const stmt = env.DB.prepare(`SELECT id, name, description, created_at FROM workflows`);
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
