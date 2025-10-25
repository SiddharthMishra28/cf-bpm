import { executeWorkflow } from "./workflowExecutor";
import { listRuleSets, listExecutions, insertWorkflow, getWorkflow, listWorkflows, createApiKey } from "./db";
import { evaluateWithCache } from "./evaluatorService";
import { createOrUpdateRuleSet } from "./rulesController";
import { requireApiKey } from "./auth";
import { checkRateLimit } from "./rateLimiter";
import { createKeyHash } from "./securityUtils";
import type { ExportedHandler } from '@cloudflare/workers-types';

export default {
  async fetch(req: Request, env: any) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // Public endpoints (or protected with a less restrictive key)
      if (path === "/api/evaluate" && method === "POST") {
        const auth = await requireApiKey(req, env, ["developer", "admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const rl = await checkRateLimit(env, `apiKey:${auth.key.id}`, 60, 120);
        if (!rl.allowed) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 });

        const body = await req.json();
        const result = await evaluateWithCache(env, body.ruleSetId, body.input);
        return Response.json(result);
      }

      if (path === "/api/workflow/execute" && method === "POST") {
        const auth = await requireApiKey(req, env, ["developer", "admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const rl = await checkRateLimit(env, `apiKey:${auth.key.id}`, 60, 60);
        if (!rl.allowed) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 });

        const body = await req.json();
        const workflowDef = body.workflow; // JSON structure or retrieved from DB
        const result = await executeWorkflow(env, workflowDef, body.input);
        return Response.json(result);
      }

      // Management endpoints (protected with "admin" or "developer" roles)
      if (path === "/api/rules" && method === "GET") {
        const auth = await requireApiKey(req, env, ["readonly", "developer", "admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const list = await listRuleSets(env);
        return Response.json(list);
      }

      if (path.startsWith("/api/rules") && (method === "POST" || method === "PUT")) {
        const auth = await requireApiKey(req, env, ["developer", "admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const rl = await checkRateLimit(env, `apiKey:${auth.key.id}`, 60, 60);
        if (!rl.allowed) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 });

        const body = await req.json();
        const id = path.split("/").pop();
        const result = await createOrUpdateRuleSet(env, id ? Number(id) : null, body.name, body.description || "", body.rule_json);
        return Response.json(result);
      }

      if (path === "/api/workflows" && method === "POST") {
        const auth = await requireApiKey(req, env, ["developer", "admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const rl = await checkRateLimit(env, `apiKey:${auth.key.id}`, 60, 30);
        if (!rl.allowed) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 });

        const body = await req.json();
        await insertWorkflow(env, body.name, body.description || "", body.steps);
        return Response.json({ ok: true, message: "Workflow saved" });
      }

      if (path === "/api/workflows" && method === "GET") {
        const auth = await requireApiKey(req, env, ["readonly", "developer", "admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const list = await listWorkflows(env);
        return Response.json(list);
      }

      if (path.startsWith("/api/workflow/") && method === "GET" && path.split("/").length > 3) {
        const auth = await requireApiKey(req, env, ["readonly", "developer", "admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const id = Number(path.split("/").pop());
        const wf = await getWorkflow(env, id);
        return Response.json(wf || {});
      }

      if (path === "/api/executions" && method === "GET") {
        const auth = await requireApiKey(req, env, ["admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const list = await listExecutions(env);
        return Response.json(list);
      }

      // API Key management (highly protected)
      if (path === "/api/keys" && method === "POST") {
        const auth = await requireApiKey(req, env, ["admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const body = await req.json();
        const { salt, hash } = await createKeyHash(body.key);
        await createApiKey(env, body.name, body.role, salt, hash, auth.key.name);
        return Response.json({ ok: true, message: "API key created" });
      }

      return new Response("BPM API Active ✅", { status: 200 });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  },
} satisfies ExportedHandler;
