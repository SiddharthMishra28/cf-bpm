import { executeWorkflow } from "./workflowExecutor";
import { listRuleSets, listExecutions, insertWorkflow, getWorkflow, listWorkflows } from "./db";
import { evaluateWithCache } from "./evaluatorService";
import { createOrUpdateRuleSet } from "./rulesController";
import type { ExportedHandler } from '@cloudflare/workers-types';

export default {
  async fetch(req: Request, env: any) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      if (path === "/api/rules" && method === "GET") {
        const list = await listRuleSets(env);
        return Response.json(list);
      }

      if (path.startsWith("/api/rules") && (method === "POST" || method === "PUT")) {
        const body = await req.json();
        const id = path.split("/").pop();
        const result = await createOrUpdateRuleSet(env, id ? Number(id) : null, body.name, body.description || "", body.rule_json);
        return Response.json(result);
      }

      if (path === "/api/evaluate" && method === "POST") {
        const body = await req.json();
        const result = await evaluateWithCache(env, body.ruleSetId, body.input);
        return Response.json(result);
      }

      if (path === "/api/workflows" && method === "POST") {
        const body = await req.json();
        await insertWorkflow(env, body.name, body.description || "", body.steps);
        return Response.json({ ok: true, message: "Workflow saved" });
      }

      if (path === "/api/workflows" && method === "GET") {
        const list = await listWorkflows(env);
        return Response.json(list);
      }

      if (path.startsWith("/api/workflow/") && method === "GET" && path.split("/").length > 3) {
        const id = Number(path.split("/").pop());
        const wf = await getWorkflow(env, id);
        return Response.json(wf || {});
      }

      if (path === "/api/workflow/execute" && method === "POST") {
        const body = await req.json();
        const workflowDef = body.workflow; // JSON structure or retrieved from DB
        const result = await executeWorkflow(env, workflowDef, body.input);
        return Response.json(result);
      }

      if (path === "/api/executions" && method === "GET") {
        const list = await listExecutions(env);
        return Response.json(list);
      }

      return new Response("BPM API Active ✅", { status: 200 });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  },
} satisfies ExportedHandler;
