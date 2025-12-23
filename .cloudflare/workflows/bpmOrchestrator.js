import { Workflow } from 'cloudflare:workflows';

// .cloudflare/workflows/bpmOrchestrator.js
export class BpmOrchestrator extends Workflow {
  async run(event, env, ctx) {
    const executionId = event.executionId;

    // Step 1: fetch execution metadata from your Worker (which reads D1)
    const execRes = await env.BPM_API.fetch(new Request(`/internal/execution/${executionId}`));
    const exec = await execRes.json();

    // Step 2: fetch the workflow snapshot (versioned) from D1 via the Worker
    const wfRes = await env.BPM_API.fetch(new Request(`/internal/workflow/${exec.workflow_id}?version=${exec.workflow_version}`));
    const workflow = await wfRes.json();

    // Step 3: iterate steps in workflow.steps_json starting from exec.current_step_id or from first
    let nextIndex = 0;
    if (exec.current_step_id) {
      nextIndex = workflow.steps_json.findIndex(s => s.id === exec.current_step_id) + 1;
    }

    for (let i = nextIndex; i < workflow.steps_json.length; i++) {
      const step = workflow.steps_json[i];

      // persist checkpoint: before executing step, set current_step_id
      await env.BPM_API.fetch(new Request(`/internal/execution/${executionId}/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId: step.id, checkpoint: { stepIndex: i } })
      }));

      if (step.type === 'RULE_EVAL') {
        // call worker to evaluate rules by frozen version
        const evRes = await env.BPM_API.fetch(new Request(`/internal/eval`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ruleSetName: step.ruleSetName,
            ruleSetVersion: exec.rule_set_version,
            input: exec.input_json
          })
        }));
        const ev = await evRes.json();
        if (!ev.ok) {
          // route to onFail or finish as needed
          if (step.onFail) {
            // jump to the step id in onFail (resolve index)
            i = workflow.steps_json.findIndex(s => s.id === step.onFail) - 1;
            continue;
          } else {
            // finalize failed
            await env.BPM_API.fetch(new Request(`/internal/execution/${executionId}/finalize`, {
              method: 'POST',
              body: JSON.stringify({ result: ev, status: 'FAILED' })
            }));
            return { status: 'FAILED' };
          }
        }
        // if ok, continue; optionally persist per-step result
      } else if (step.type === 'CALL_API') {
        // perform call, handle retries, backoff
        const callRes = await fetch(step.url, {
          method: step.method || 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(step.bodyTemplate || {})
        });
        if (!callRes.ok) {
          // decide retry or fail; here we fail
          await env.BPM_API.fetch(new Request(`/internal/execution/${executionId}/finalize`, {
            method: 'POST',
            body: JSON.stringify({ result: { error: 'downstream_failed' }, status: 'FAILED' })
          }));
          return { status: 'FAILED' };
        }
      } else if (step.type === 'WAIT_FOR_EVENT') {
        // this is the human-in-the-loop step
        // persist checkpoint (already done), then wait for external event
        // Cloudflare Workflows allows wait/sleep; better to exit here and let external event trigger resume
        await env.BPM_API.fetch(new Request(`/internal/execution/${executionId}/checkpoint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stepId: step.id, checkpoint: { waitingFor: step.eventName } })
        }));
        // instruct to stop orchestration and let external event resume (or wait using built-in workflow 'wait for event')
        return { status: 'WAITING', step: step.id };
      } else if (step.type === 'END') {
        await env.BPM_API.fetch(new Request(`/internal/execution/${executionId}/finalize`, {
          method: 'POST',
          body: JSON.stringify({ result: { message: 'completed' }, status: 'COMPLETED' })
        }));
        return { status: 'COMPLETED' };
      }
    }

    // If loop finishes
    await env.BPM_API.fetch(new Request(`/internal/execution/${executionId}/finalize`, {
      method: 'POST',
      body: JSON.stringify({ result: { message: 'completed' }, status: 'COMPLETED' })
    }));

    return { status: 'COMPLETED' };
  }
}
