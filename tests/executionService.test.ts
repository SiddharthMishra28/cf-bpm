import { createExecution, getExecution, updateExecutionCheckpoint, finalizeExecution } from "../src/executionService";
import { test, expect } from 'vitest';

const fakeDb = {
  store: new Map<string, any>(),
  prepare: (sql: string) => ({
    bind: (...args: any[]) => ({
      run: async () => {
        if (sql.includes("INSERT INTO executions")) {
          const id = fakeDb.store.size + 1;
          const newExec = {
            id,
            workflow_id: args[0],
            workflow_version: args[1],
            rule_set_id: args[2],
            rule_set_version: args[3],
            input_json: JSON.stringify(args[4]),
            status: 'PENDING',
            current_step_id: null,
            checkpoint: null,
            result_json: null,
          }
          fakeDb.store.set(id.toString(), newExec);
          return { success: true, lastRowId: id };
        }
        if (sql.includes("UPDATE executions")) {
          const id = args[2].toString();
          const exec = fakeDb.store.get(id);
          if (exec) {
            if (sql.includes("SET current_step_id")) {
              exec.current_step_id = args[0];
              exec.checkpoint = JSON.stringify(args[1]);
            } else if (sql.includes("SET result_json")) {
              exec.result_json = JSON.stringify(args[0]);
              exec.status = args[1];
              exec.checkpoint = null;
            }
          }
        }
        return { success: true };
      },
      first: async () => {
        const id = args[0].toString();
        return fakeDb.store.get(id);
      }
    })
  })
};

const fakeEnv = {
  DB: fakeDb
};

test("create and manage executions", async () => {
  const executionId = await createExecution(fakeEnv as any, {
    workflow_id: 1,
    workflow_version: 1,
    payload: { a: 1 }
  });
  expect(executionId).toBe(1);

  await updateExecutionCheckpoint(fakeEnv as any, executionId, "step1", { b: 2 });
  const exec = await getExecution(fakeEnv as any, executionId);
  expect(exec.checkpoint).toEqual({ b: 2 });

  await finalizeExecution(fakeEnv as any, executionId, { c: 3 });
  const finalExec = await getExecution(fakeEnv as any, executionId);
  expect(finalExec.result_json).toEqual({ c: 3 });
  expect(finalExec.status).toBe("COMPLETED");
});
