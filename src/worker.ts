import { executeWorkflow } from "./workflowExecutor";
import { getRuleSet, listRuleSets, listExecutions, insertWorkflow, getWorkflow, listWorkflows } from "./db";
import { evaluateRuleset } from "./ruleEngine";
import type { ExportedHandler } from '@cloudflare/workers-types';

export default {
  async fetch(req: Request, env: any) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/api/workflows" && req.method === "POST") {
      const body = await req.json();
      await insertWorkflow(env, body.name, body.description || "", body.steps);
      return Response.json({ ok: true, message: "Workflow saved" });
    }

    if (path === "/api/workflows" && req.method === "GET") {
      const list = await listWorkflows(env);
      return Response.json(list);
    }

    if (path.startsWith("/api/workflow/") && req.method === "GET") {
      const id = Number(path.split("/").pop());
      const wf = await getWorkflow(env, id);
      return Response.json(wf || {});
    }

    // 🧠 Evaluate Rule directly
    if (path === "/api/evaluate" && req.method === "POST") {
      const body = await req.json();
      const rule = await getRuleSet(env, body.ruleSetId);
      const result = evaluateRuleset(body.input, rule.rule_json);
      return Response.json(result);
    }

    // 🚀 Execute a workflow
    if (path === "/api/workflow/execute" && req.method === "POST") {
      const body = await req.json();
      const workflowDef = body.workflow; // JSON structure or retrieved from DB
      const result = await executeWorkflow(env, workflowDef, body.input);
      return Response.json(result);
    }

    // 📜 View execution history
    if (path === "/api/executions" && req.method === "GET") {
      const list = await listExecutions(env);
      return Response.json(list);
    }

    // 🧾 List rules
    if (path === "/api/rules" && req.method === "GET") {
      const list = await listRuleSets(env);
      return Response.json(list);
    }

    return new Response("BPM API Active ✅", { status: 200 });
  },
} satisfies ExportedHandler;
