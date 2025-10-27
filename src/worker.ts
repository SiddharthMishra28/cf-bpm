import { startWorkflowExecution } from "./workflowExecutor";
import { createOrUpdateRuleSet, getLatestRuleSet, getRuleSetByVersion, createOrUpdateWorkflow, getLatestWorkflow, getWorkflowByVersion, listExecutions, createApiKey, getRuleSet as getRuleSetById, getWorkflow as getWorkflowById } from "./db";
import { requireApiKey } from "./auth";
import { checkRateLimit } from "./rateLimiter";
import { createKeyHash } from "./securityUtils";
import { createExecution, getExecution, updateExecutionCheckpoint, finalizeExecution } from "./executionService";
import { evaluateRuleset } from "./ruleEngine";
import type { ExportedHandler } from '@cloudflare/workers-types';

export default {
  async fetch(req: Request, env: any) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // Internal endpoints
      if (path.startsWith('/internal/execution/') && method === 'GET') {
        const id = Number(path.split('/').pop());
        const exec = await getExecution(env, id);
        return new Response(JSON.stringify(exec));
      }

      if (path.endsWith('/checkpoint') && method === 'POST') {
        const id = Number(path.split('/')[3]);
        const body = await req.json();
        await updateExecutionCheckpoint(env, id, body.stepId || null, body.checkpoint || {});
        return new Response(JSON.stringify({ ok: true }));
      }

      if (path.endsWith('/finalize') && method === 'POST') {
        const id = Number(path.split('/')[3]);
        const body = await req.json();
        await finalizeExecution(env, id, body.result || {}, body.status || 'COMPLETED');
        return new Response(JSON.stringify({ ok: true }));
      }

      if (path === '/internal/eval' && method === 'POST') {
        const body = await req.json(); // { ruleSetId, ruleSetVersion, input }
        const rs = await getRuleSetByVersion(env, body.ruleSetName, body.ruleSetVersion);
        if (!rs) return new Response(JSON.stringify({ ok: false, error: 'ruleset_not_found' }), { status: 404 });
        const res = evaluateRuleset(JSON.parse(rs.rule_json), body.input); // using your evaluator
        return new Response(JSON.stringify(res));
      }

      if (path.startsWith('/internal/workflow/')) {
        const id = Number(path.split('/')[3]);
        const version = url.searchParams.get("version");
        const wf = await getWorkflowByVersion(env, id, Number(version));
        return Response.json(wf || {});
      }

      // Public endpoints
      if (path === '/api/workflow/start' && method === 'POST') {
        const auth = await requireApiKey(req, env, ["developer", "admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const body = await req.json();
        const { workflowId, workflowName, input } = body;

        const workflow = workflowId
          ? await getWorkflowById(env, workflowId)
          : await getLatestWorkflow(env, workflowName);

        if (!workflow) return new Response(JSON.stringify({ error: 'workflow_not_found' }), { status: 404 });

        const wfVersion = workflow.version_number;
        const ruleSetRef = workflow.rule_set_reference;
        let ruleSetId = null, ruleSetVersion = null;
        if (ruleSetRef) {
          const rs = await getRuleSetById(env, ruleSetRef);
          ruleSetId = rs.id; ruleSetVersion = rs.version_number;
        }

        const execId = await createExecution(env, {
          workflow_id: workflow.id,
          workflow_version: wfVersion,
          rule_set_id: ruleSetId,
          rule_set_version: ruleSetVersion,
          payload: input
        });

        await fetch(`https://bpmOrchestrator.workflows.dev/api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ executionId: execId })
        });

        return new Response(JSON.stringify({ executionId: execId }), { status: 202 });
      }

      if (path === '/api/workflow/event' && method === 'POST') {
        const auth = await requireApiKey(req, env, ["developer", "admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const { executionId, eventName, payload } = await req.json();
        await updateExecutionCheckpoint(env, executionId, eventName, { approved: true, actor: auth.key.name, payload });

        await fetch(`https://bpmOrchestrator.workflows.dev/api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ executionId })
        });

        return new Response(JSON.stringify({ ok: true }));
      }

      if (path === "/api/workflow/execute" && method === "POST") {
        const body = await req.json();
        const result = await startWorkflowExecution(env, body.workflowName, body.input);
        return Response.json(result);
      }

      return new Response("BPM API Active ✅", { status: 200 });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  },
} satisfies ExportedHandler;
