import { startWorkflowExecution } from "./workflowExecutor";
import { createOrUpdateRuleSet, getLatestRuleSet, getRuleSetByVersion, createOrUpdateWorkflow, getLatestWorkflow, getWorkflowByVersion, listExecutions, createApiKey } from "./db";
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
      // Workflow Execution
      if (path === "/api/workflow/execute" && method === "POST") {
        const auth = await requireApiKey(req, env, ["developer", "admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const rl = await checkRateLimit(env, `apiKey:${auth.key.id}`, 60, 60);
        if (!rl.allowed) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 });

        const body = await req.json();
        const result = await startWorkflowExecution(env, body.workflowName, body.input);
        return Response.json(result);
      }

      // Rule Set Management
      if (path === "/api/rule-set" && method === "POST") {
        const auth = await requireApiKey(req, env, ["developer", "admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const { name, description, ruleJson } = await req.json();
        const version = await createOrUpdateRuleSet(env, name, description, ruleJson);
        return Response.json({ message: "Rule set updated", version });
      }

      if (path === "/api/rule-set/latest" && method === "GET") {
        const auth = await requireApiKey(req, env, ["readonly", "developer", "admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const name = url.searchParams.get("name");
        const rs = await getLatestRuleSet(env, name);
        return Response.json(rs || { error: "Not found" });
      }

      if (path === "/api/rule-set/version" && method === "GET") {
        const auth = await requireApiKey(req, env, ["readonly", "developer", "admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const name = url.searchParams.get("name");
        const version = parseInt(url.searchParams.get("version") || "1", 10);
        const rs = await getRuleSetByVersion(env, name, version);
        return Response.json(rs || { error: "Not found" });
      }

      if (path === "/api/rule-set/versions" && method === "GET") {
        const auth = await requireApiKey(req, env, ["readonly", "developer", "admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const name = url.searchParams.get("name");
        const res = await env.DB.prepare(
          "SELECT version_number, status, created_at FROM rule_sets WHERE name=?1 ORDER BY version_number DESC"
        ).bind(name).all();
        return Response.json(res.results || []);
      }

      // Workflow Management
      if (path === "/api/workflow" && method === "POST") {
        const auth = await requireApiKey(req, env, ["developer", "admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const { name, description, stepsJson } = await req.json();
        const version = await createOrUpdateWorkflow(env, name, description, stepsJson);
        return Response.json({ message: "Workflow updated", version });
      }

      if (path === "/api/workflow/latest" && method === "GET") {
        const auth = await requireApiKey(req, env, ["readonly", "developer", "admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const name = url.searchParams.get("name");
        const wf = await getLatestWorkflow(env, name);
        return Response.json(wf || { error: "Not found" });
      }

      if (path === "/api/workflow/version" && method === "GET") {
        const auth = await requireApiKey(req, env, ["readonly", "developer", "admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const name = url.searchParams.get("name");
        const version = parseInt(url.searchParams.get("version") || "1", 10);
        const wf = await getWorkflowByVersion(env, name, version);
        return Response.json(wf || { error: "Not found" });
      }

      if (path === "/api/workflow/versions" && method === "GET") {
        const auth = await requireApiKey(req, env, ["readonly", "developer", "admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const name = url.searchParams.get("name");
        const res = await env.DB.prepare(
          "SELECT version_number, status, created_at FROM workflows WHERE name=?1 ORDER BY version_number DESC"
        ).bind(name).all();
        return Response.json(res.results || []);
      }

      // Other existing endpoints...
      if (path === "/api/executions" && method === "GET") {
        const auth = await requireApiKey(req, env, ["admin"]);
        if (!auth.ok) return new Response(JSON.stringify(auth.body), { status: auth.status });

        const list = await listExecutions(env);
        return Response.json(list);
      }

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
