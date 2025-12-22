import {
  createOrUpdateRuleSet,
  getLatestRuleSet,
  getRuleSetByVersion,
  createOrUpdateWorkflow,
  getLatestWorkflow,
  getWorkflowByVersion,
  getRuleSet as getRuleSetById,
  getWorkflow as getWorkflowById,
} from './db'
import { requireApiKey } from './auth'
import {
  createExecution,
  getExecution,
  updateExecutionCheckpoint,
  finalizeExecution,
} from './executionService'
import { evaluateRuleset } from './ruleEngine'
import {
  OpenAPIRoute,
  OpenAPIRouteSchema,
  Query,
  Str,
  Num,
} from '@cloudflare/itty-router-openapi'
import { z } from 'zod'
import { router } from './router'

const RuleSetSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  rule_json: z.any(),
  version_number: z.number(),
  created_at: z.string(),
})

const WorkflowSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  steps_json: z.any(),
  version_number: z.number(),
  created_at: z.string(),
})

const VersionSchema = z.object({
  version_number: z.number(),
  status: z.string(),
  created_at: z.string(),
})

// Internal Endpoints
class GetExecution extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Get an execution by ID',
    tags: ['Internal'],
    parameters: {
      id: Num,
    },
    responses: {
      '200': {
        description: 'The execution',
        schema: z.any(),
      },
    },
  }

  async handle(request: Request, env: any, context: any, data: any) {
    const exec = await getExecution(env, data.params.id)
    return new Response(JSON.stringify(exec))
  }
}

class UpdateExecutionCheckpointInternal extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Update an execution checkpoint',
    tags: ['Internal'],
    parameters: {
      id: Num,
    },
    requestBody: {
      stepId: z.string().optional(),
      checkpoint: z.any(),
    },
    responses: {
      '200': {
        description: 'Checkpoint updated',
        schema: {
          ok: z.boolean(),
        },
      },
    },
  }

  async handle(request: Request, env: any, context: any, data: any) {
    const { stepId, checkpoint } = data.body
    await updateExecutionCheckpoint(
      env,
      data.params.id,
      stepId || null,
      checkpoint || {},
    )
    return new Response(JSON.stringify({ ok: true }))
  }
}

class FinalizeExecutionInternal extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Finalize an execution',
    tags: ['Internal'],
    parameters: {
      id: Num,
    },
    requestBody: {
      result: z.any(),
      status: z.string().optional(),
    },
    responses: {
      '200': {
        description: 'Execution finalized',
        schema: {
          ok: z.boolean(),
        },
      },
    },
  }

  async handle(request: Request, env: any, context: any, data: any) {
    const { result, status } = data.body
    await finalizeExecution(
      env,
      data.params.id,
      result || {},
      status || 'COMPLETED',
    )
    return new Response(JSON.stringify({ ok: true }))
  }
}

class EvaluateRuleSetInternal extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Evaluate a rule set',
    tags: ['Internal'],
    requestBody: {
      ruleSetName: z.string(),
      ruleSetVersion: z.number(),
      input: z.any(),
    },
    responses: {
      '200': {
        description: 'Evaluation result',
        schema: z.any(),
      },
      '404': {
        description: 'Rule set not found',
      },
    },
  }

  async handle(request: Request, env: any, context: any, data: any) {
    const { ruleSetName, ruleSetVersion, input } = data.body
    const rs = await getRuleSetByVersion(env, ruleSetName, ruleSetVersion)
    if (!rs)
      return new Response(
        JSON.stringify({ ok: false, error: 'ruleset_not_found' }),
        { status: 404 },
      )
    const res = evaluateRuleset(JSON.parse(rs.rule_json), input)
    return new Response(JSON.stringify(res))
  }
}

class GetWorkflowInternal extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Get a workflow by ID and version',
    tags: ['Internal'],
    parameters: {
      id: Num,
      version: Query(Num),
    },
    responses: {
      '200': {
        description: 'The workflow',
        schema: z.any(),
      },
    },
  }

  async handle(request: Request, env: any, context: any, data: any) {
    const wf = await getWorkflowByVersion(
      env,
      data.params.id,
      Number(data.query.version),
    )
    return Response.json(wf || {})
  }
}

// Public Endpoints
export class StartWorkflow extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Start a new workflow execution',
    tags: ['Workflow'],
    requestBody: {
      workflowId: z.number().optional(),
      workflowName: z.string().optional(),
      input: z.any(),
    },
    responses: {
      '202': {
        description: 'Workflow execution started',
        schema: {
          executionId: z.number(),
        },
      },
      '404': {
        description: 'Workflow not found',
      },
    },
  }

  async handle(request: Request, env: any, context: any, data: any) {
    const auth = await requireApiKey(request, env, ['developer', 'admin'])
    if (!auth.ok)
      return new Response(JSON.stringify(auth.body), { status: auth.status })

    const { workflowId, workflowName, input } = data.body

    const workflow = workflowId
      ? await getWorkflowById(env, workflowId)
      : await getLatestWorkflow(env, workflowName)

    if (!workflow)
      return new Response(JSON.stringify({ error: 'workflow_not_found' }), {
        status: 404,
      })

    const wfVersion = workflow.version_number
    const ruleSetRef = (workflow as any).rule_set_reference
    let ruleSetId = null,
      ruleSetVersion = null
    if (ruleSetRef) {
      const rs = await getRuleSetById(env, ruleSetRef)
      ruleSetId = (rs as any).id
      ruleSetVersion = (rs as any).version_number
    }

    const execId = await createExecution(env, {
      workflow_id: (workflow as any).id,
      workflow_version: wfVersion,
      rule_set_id: ruleSetId,
      rule_set_version: ruleSetVersion,
      payload: input,
    })

    await env.BPM_ORCHESTRATOR.fetch(
      new Request('https://workflow-engine/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionId: execId }),
      }),
    )

    return new Response(JSON.stringify({ executionId: execId }), {
      status: 202,
    })
  }
}

export class TriggerWorkflowEvent extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Send an event to a running workflow',
    tags: ['Workflow'],
    requestBody: {
      executionId: z.number(),
      eventName: z.string(),
      payload: z.any(),
    },
    responses: {
      '200': {
        description: 'Event sent',
        schema: {
          ok: z.boolean(),
        },
      },
    },
  }

  async handle(request: Request, env: any, context: any, data: any) {
    const auth = await requireApiKey(request, env, ['developer', 'admin'])
    if (!auth.ok)
      return new Response(JSON.stringify(auth.body), { status: auth.status })

    const { executionId, eventName, payload } = data.body
    await updateExecutionCheckpoint(env, executionId, eventName, {
      approved: true,
      actor: (auth as any).key.name,
      payload,
    })

    await env.BPM_ORCHESTRATOR.fetch(
      new Request('https://workflow-engine/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionId }),
      }),
    )

    return new Response(JSON.stringify({ ok: true }))
  }
}

export class CreateOrUpdateRuleSet extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Create or update a rule set',
    tags: ['Rule Set'],
    requestBody: {
      name: z.string(),
      description: z.string(),
      ruleJson: z.any(),
    },
    responses: {
      '200': {
        description: 'Rule set updated',
        schema: {
          message: z.string(),
          version: z.number(),
        },
      },
    },
  }

  async handle(request: Request, env: any, context: any, data: any) {
    const auth = await requireApiKey(request, env, ['developer', 'admin'])
    if (!auth.ok)
      return new Response(JSON.stringify(auth.body), { status: auth.status })

    const { name, description, ruleJson } = data.body
    const version = await createOrUpdateRuleSet(
      env,
      name,
      description,
      ruleJson,
    )
    return Response.json({ message: 'Rule set updated', version })
  }
}

export class GetLatestRuleSet extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Get the latest version of a rule set',
    tags: ['Rule Set'],
    parameters: {
      name: Query(Str, {
        description: 'The name of the rule set',
        required: true,
      }),
    },
    responses: {
      '200': {
        description: 'The latest rule set',
        schema: RuleSetSchema,
      },
      '404': {
        description: 'Rule set not found',
      },
    },
  }

  async handle(request: Request, env: any, context: any, data: any) {
    const auth = await requireApiKey(request, env, [
      'readonly',
      'developer',
      'admin',
    ])
    if (!auth.ok)
      return new Response(JSON.stringify(auth.body), { status: auth.status })

    const { name } = data.query
    const rs = await getLatestRuleSet(env, name)
    return Response.json(rs || { error: 'Not found' })
  }
}

export class GetRuleSetByVersion extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Get a specific version of a rule set',
    tags: ['Rule Set'],
    parameters: {
      name: Query(Str, {
        description: 'The name of the rule set',
        required: true,
      }),
      version: Query(Num, {
        description: 'The version of the rule set',
        required: true,
      }),
    },
    responses: {
      '200': {
        description: 'The rule set',
        schema: RuleSetSchema,
      },
      '404': {
        description: 'Rule set not found',
      },
    },
  }

  async handle(request: Request, env: any, context: any, data: any) {
    const auth = await requireApiKey(request, env, [
      'readonly',
      'developer',
      'admin',
    ])
    if (!auth.ok)
      return new Response(JSON.stringify(auth.body), { status: auth.status })

    const { name, version } = data.query
    const rs = await getRuleSetByVersion(env, name, version)
    return Response.json(rs || { error: 'Not found' })
  }
}

export class GetRuleSetVersions extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Get all versions of a rule set',
    tags: ['Rule Set'],
    parameters: {
      name: Query(Str, {
        description: 'The name of the rule set',
        required: true,
      }),
    },
    responses: {
      '200': {
        description: 'A list of versions',
        schema: z.array(VersionSchema),
      },
    },
  }

  async handle(request: Request, env: any, context: any, data: any) {
    const auth = await requireApiKey(request, env, [
      'readonly',
      'developer',
      'admin',
    ])
    if (!auth.ok)
      return new Response(JSON.stringify(auth.body), { status: auth.status })

    const { name } = data.query
    const res = await env.DB.prepare(
      'SELECT version_number, status, created_at FROM rule_sets WHERE name=?1 ORDER BY version_number DESC',
    )
      .bind(name)
      .all()
    return Response.json((res as any).results || [])
  }
}

export class CreateOrUpdateWorkflow extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Create or update a workflow',
    tags: ['Workflow'],
    requestBody: {
      name: z.string(),
      description: z.string(),
      stepsJson: z.any(),
    },
    responses: {
      '200': {
        description: 'Workflow updated',
        schema: {
          message: z.string(),
          version: z.number(),
        },
      },
    },
  }

  async handle(request: Request, env: any, context: any, data: any) {
    const auth = await requireApiKey(request, env, ['developer', 'admin'])
    if (!auth.ok)
      return new Response(JSON.stringify(auth.body), { status: auth.status })

    const { name, description, stepsJson } = data.body
    const version = await createOrUpdateWorkflow(
      env,
      name,
      description,
      stepsJson,
    )
    return Response.json({ message: 'Workflow updated', version })
  }
}

export class GetLatestWorkflow extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Get the latest version of a workflow',
    tags: ['Workflow'],
    parameters: {
      name: Query(Str, {
        description: 'The name of the workflow',
        required: true,
      }),
    },
    responses: {
      '200': {
        description: 'The latest workflow',
        schema: WorkflowSchema,
      },
      '404': {
        description: 'Workflow not found',
      },
    },
  }

  async handle(request: Request, env: any, context: any, data: any) {
    const auth = await requireApiKey(request, env, [
      'readonly',
      'developer',
      'admin',
    ])
    if (!auth.ok)
      return new Response(JSON.stringify(auth.body), { status: auth.status })

    const { name } = data.query
    const wf = await getLatestWorkflow(env, name)
    return Response.json(wf || { error: 'Not found' })
  }
}

export class GetWorkflowByVersionRoute extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Get a specific version of a workflow',
    tags: ['Workflow'],
    parameters: {
      name: Query(Str, {
        description: 'The name of the workflow',
        required: true,
      }),
      version: Query(Num, {
        description: 'The version of the workflow',
        required: true,
      }),
    },
    responses: {
      '200': {
        description: 'The workflow',
        schema: WorkflowSchema,
      },
      '404': {
        description: 'Workflow not found',
      },
    },
  }

  async handle(request: Request, env: any, context: any, data: any) {
    const auth = await requireApiKey(request, env, [
      'readonly',
      'developer',
      'admin',
    ])
    if (!auth.ok)
      return new Response(JSON.stringify(auth.body), { status: auth.status })

    const { name, version } = data.query
    const wf = await getWorkflowByVersion(env, name, version)
    return Response.json(wf || { error: 'Not found' })
  }
}

export class GetWorkflowVersions extends OpenAPIRoute {
  static schema: OpenAPIRouteSchema = {
    summary: 'Get all versions of a workflow',
    tags: ['Workflow'],
    parameters: {
      name: Query(Str, {
        description: 'The name of the workflow',
        required: true,
      }),
    },
    responses: {
      '200': {
        description: 'A list of versions',
        schema: z.array(VersionSchema),
      },
    },
  }

  async handle(request: Request, env: any, context: any, data: any) {
    const auth = await requireApiKey(request, env, [
      'readonly',
      'developer',
      'admin',
    ])
    if (!auth.ok)
      return new Response(JSON.stringify(auth.body), { status: auth.status })

    const { name } = data.query
    const res = await env.DB.prepare(
      'SELECT version_number, status, created_at FROM workflows WHERE name=?1 ORDER BY version_number DESC',
    )
      .bind(name)
      .all()
    return Response.json((res as any).results || [])
  }
}

// Internal Routes
router.get('/internal/execution/:id', GetExecution)
router.post('/internal/execution/:id/checkpoint', UpdateExecutionCheckpointInternal)
router.post('/internal/execution/:id/finalize', FinalizeExecutionInternal)
router.post('/internal/eval', EvaluateRuleSetInternal)
router.get('/internal/workflow/:id', GetWorkflowInternal)

// Public Routes
router.post('/api/workflow/start', StartWorkflow)
router.post('/api/workflow/event', TriggerWorkflowEvent)
router.post('/api/rule-set', CreateOrUpdateRuleSet)
router.get('/api/rule-set/latest', GetLatestRuleSet)
router.get('/api/rule-set/version', GetRuleSetByVersion)
router.get('/api/rule-set/versions', GetRuleSetVersions)
router.post('/api/workflow', CreateOrUpdateWorkflow)
router.get('/api/workflow/latest', GetLatestWorkflow)
router.get('/api/workflow/version', GetWorkflowByVersionRoute)
router.get('/api/workflow/versions', GetWorkflowVersions)

// Fallback for anything that doesn't match
router.all('*', () => new Response('Not Found.', { status: 404 }))

export default {
  fetch: router.handle,
}
