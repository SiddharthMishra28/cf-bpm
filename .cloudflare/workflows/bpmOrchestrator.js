// Cloudflare Workflow - bpmOrchestrator
export async function onRequest(context) {
  const { env, request } = context;
  const data = await request.json();
  const workflowId = data.workflowId;
  const input = data.input || {};

  const getWorkflowRes = await env.BPM_API.fetch(new Request(`https://bpm-rule-api/api/workflow/${workflowId}`));
  const workflow = await getWorkflowRes.json();

  const workflowRes = await env.BPM_API.fetch(
    new Request(`https://bpm-rule-api/api/workflow/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflow,
        input
      })
    })
  );

  const result = await workflowRes.json();
  return new Response(JSON.stringify(result), { status: 200 });
}
