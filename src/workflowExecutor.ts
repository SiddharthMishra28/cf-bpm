import { evaluateRuleset } from "./ruleEngine";
import { getRuleSet, getWorkflow, insertExecution } from "./db";
import type { Env } from "./db";

export async function executeWorkflow(env: Env, workflowDef: any, input: any) {
  let currentStep = workflowDef.steps[0];
  let status = "PENDING";
  let executionLog: any[] = [];

  while (currentStep) {
    const stepId = currentStep.id;
    const stepType = currentStep.type;

    try {
      if (stepType === "RULE_EVAL") {
        const ruleSet = await getRuleSet(env, currentStep.ruleSetId);
        const evalResult = evaluateRuleset(input, ruleSet.rule_json);
        executionLog.push({ stepId, type: "RULE_EVAL", result: evalResult });
        if (evalResult.ok) {
          currentStep = findStepById(workflowDef, currentStep.onSuccess);
        } else {
          currentStep = findStepById(workflowDef, currentStep.onFail);
        }
      } else if (stepType === "CALL_API") {
        const res = await fetch(currentStep.url, {
          method: currentStep.method || "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(currentStep.bodyTemplate || {})
        });
        executionLog.push({ stepId, type: "CALL_API", status: res.status });
        if (res.ok) {
          currentStep = findStepById(workflowDef, currentStep.onSuccess);
        } else {
          status = "FAILED";
          break;
        }
      } else if (stepType === "NEXT_WORKFLOW") {
        const nextWf = await getWorkflow(env, currentStep.nextWorkflowId);
        executionLog.push({ stepId, type: "NEXT_WORKFLOW", triggered: nextWf.name });

        // recursively execute next workflow
        const result = await executeWorkflow(env, nextWf, input);
        executionLog.push({ stepId, chainedResult: result.status });
        currentStep = findStepById(workflowDef, currentStep.onSuccess);
      } else if (stepType === "END") {
        status = "COMPLETED";
        break;
      } else {
        throw new Error(`Unsupported step type: ${stepType}`);
      }
    } catch (err: any) {
      executionLog.push({ stepId, error: err.message });
      status = "FAILED";
      break;
    }
  }

  // persist execution
  await insertExecution(env, {
    workflow_id: workflowDef.id,
    rule_set_id: null,
    input_json: input,
    result_json: executionLog,
    status
  });

  return { status, executionLog };
}

function findStepById(workflow: any, id: string) {
  if (!id) return null;
  return workflow.steps.find((s: any) => s.id === id);
}
