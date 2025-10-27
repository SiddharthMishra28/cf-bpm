// src/executionService.ts
export interface Env {
  DB: D1Database;
}

export async function createExecution(env: Env, data: {
  workflow_id: number;
  workflow_version: number;
  rule_set_id?: number | null;
  rule_set_version?: number | null;
  payload: any;
}) {
  const stmt = env.DB.prepare(
    `INSERT INTO executions (workflow_id, workflow_version, rule_set_id, rule_set_version, input_json, status, current_step_id, checkpoint)
     VALUES (?1, ?2, ?3, ?4, ?5, 'PENDING', NULL, NULL)`
  );
  const res = await stmt.bind(
    data.workflow_id,
    data.workflow_version,
    data.rule_set_id ?? null,
    data.rule_set_version ?? null,
    JSON.stringify(data.payload)
  ).run();

  const id = res?.lastRowId ?? null;
  return id;
}

export async function updateExecutionCheckpoint(env: Env, executionId: number, stepId: string | null, checkpointObj: any) {
  const stmt = env.DB.prepare(
    `UPDATE executions
     SET current_step_id = ?1, checkpoint = ?2, updated_at = datetime('now')
     WHERE id = ?3`
  );
  await stmt.bind(stepId, JSON.stringify(checkpointObj || {}), executionId).run();
}

export async function finalizeExecution(env: Env, executionId: number, resultObj: any, status: string = 'COMPLETED') {
  const stmt = env.DB.prepare(
    `UPDATE executions SET result_json = ?1, status = ?2, updated_at = datetime('now'), checkpoint = NULL WHERE id = ?3`
  );
  await stmt.bind(JSON.stringify(resultObj), status, executionId).run();
}

export async function getExecution(env: Env, executionId: number) {
  const stmt = env.DB.prepare(`SELECT * FROM executions WHERE id = ?1`);
  const row = await stmt.bind(executionId).first();
  if (!row) return null;
  if (row.input_json) row.input_json = JSON.parse(row.input_json);
  if (row.checkpoint) {
    try { row.checkpoint = JSON.parse(row.checkpoint); } catch { row.checkpoint = null; }
  }
  if (row.result_json) {
    try { row.result_json = JSON.parse(row.result_json); } catch { row.result_json = null; }
  }
  return row;
}
