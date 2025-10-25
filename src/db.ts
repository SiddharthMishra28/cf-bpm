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
