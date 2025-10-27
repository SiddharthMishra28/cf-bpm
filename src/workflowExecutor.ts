import { evaluateRuleset } from "./ruleEngine";
import { getLatestRuleSet, getLatestWorkflow, insertExecution, getWorkflowByVersion, getRuleSetByVersion } from "./db";
import type { Env } from "./db";

export async function executeWorkflow(env: Env, workflowName: string, input: any) {
  const workflow = await getLatestWorkflow(env, workflowName);
  if (!workflow) throw new Error("workflow_not_found");

  let currentStep = workflow.steps_json[0];
  let status = "PENDING";
  let executionLog: any[] = [];

  while (currentStep) {
    const stepId = currentStep.id;
    const stepType = currentStep.type;

    try {
      if (stepType === "RULE_EVAL") {
        const ruleSet = await getRuleSetByVersion(env, currentStep.ruleSetName, currentStep.ruleSetVersion);
        if (!ruleSet) throw new Error("ruleset_not_found");

        const evalResult = evaluateRuleset(JSON.parse(ruleSet.rule_json), input);
        executionLog.push({ stepId, type: "RULE_EVAL", result: evalResult });
        if (evalResult.ok) {
          currentStep = findStepById(workflow, currentStep.onSuccess);
        } else {
          currentStep = findStepById(workflow, currentStep.onFail);
        }
      } else if (stepType === "CALL_API") {
        const res = await fetch(currentStep.url, {
          method: currentStep.method || "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(currentStep.bodyTemplate || {})
        });
        executionLog.push({ stepId, type: "CALL_API", status: res.status });
        if (res.ok) {
          currentStep = findStepById(workflow, currentStep.onSuccess);
        } else {
          status = "FAILED";
          break;
        }
      } else if (stepType === "NEXT_WORKFLOW") {
        const nextWf = await getWorkflowByVersion(env, currentStep.nextWorkflowName, currentStep.nextWorkflowVersion);
        if (!nextWf) throw new Error("next_workflow_not_found");

        executionLog.push({ stepId, type: "NEXT_WORKFLOW", triggered: nextWf.name });

        // recursively execute next workflow
        const result = await executeWorkflow(env, nextWf.name, input);
        executionLog.push({ stepId, chainedResult: result.status });
        currentStep = findStepById(workflow, currentStep.onSuccess);
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
    workflow_id: workflow.id,
    workflow_version: workflow.version_number,
    input_json: input,
    result_json: executionLog,
    status
  });

  return { status, executionLog };
}

function findStepById(workflow: any, id: string) {
  if (!id) return null;
  return workflow.steps_json.find((s: any) => s.id === id);
}
