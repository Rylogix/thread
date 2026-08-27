import { z } from "zod";
import {
  activityEventSchema,
  decisionPolicySchema,
  humanDecisionSchema,
  planProposalSchema,
  planSnapshotSchema,
  proposalApplicationSchema,
  simulationResultSchema,
  workspaceStateSchema,
} from "../src/domain/schemas";
import type {
  ActivityEvent,
  Constraint,
  Dependency,
  HumanDecision,
  PlanProposal,
  Resource,
  Risk,
  Scenario,
  Task,
  WorkspaceState,
} from "../src/domain/types";
import { validatePlanInvariants } from "../src/engine/invariants";

const MAX_BODY_BYTES = 1_048_576;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PUBLIC_REPOSITORY_URL = "https://github.com/rylogix/thread";

const workspaceRowSchema = z.object({
  id: z.string(), name: z.string(), objective: z.string(), description: z.string(), deadline: z.string(),
  available_hours: z.number(), budget: z.number(), created_at: z.string(), updated_at: z.string(), last_simulation_json: z.string().nullable(),
  decision_policy_json: z.string().nullable(), last_proposal_application_json: z.string().nullable(), plan_revision: z.number().int().positive(),
});
const taskRowSchema = z.object({
  id: z.string(), workspace_id: z.string(), title: z.string(), description: z.string(), kind: z.string(), status: z.string(), priority: z.string(),
  estimated_hours: z.number(), minimum_hours: z.number(), maximum_hours: z.number(), confidence: z.number(), cost: z.number(), x: z.number(), y: z.number(), created_at: z.string(), updated_at: z.string(),
});
const dependencyRowSchema = z.object({ id: z.string(), workspace_id: z.string(), from_task_id: z.string(), to_task_id: z.string() });
const constraintRowSchema = z.object({ id: z.string(), workspace_id: z.string(), type: z.string(), title: z.string(), value_json: z.string(), hard: z.number(), description: z.string() });
const resourceRowSchema = z.object({ id: z.string(), workspace_id: z.string(), name: z.string(), type: z.string(), capacity: z.number(), cost: z.number() });
const riskRowSchema = z.object({ id: z.string(), workspace_id: z.string(), task_id: z.string().nullable(), title: z.string(), probability: z.number(), impact: z.number(), mitigation: z.string(), resolved: z.number() });
const scenarioRowSchema = z.object({ id: z.string(), workspace_id: z.string(), name: z.string(), description: z.string(), snapshot_json: z.string(), created_at: z.string() });
const proposalRowSchema = z.object({ id: z.string(), workspace_id: z.string(), proposal_json: z.string(), status: z.string(), mode: z.string(), idempotency_key: z.string().nullable(), created_at: z.string(), updated_at: z.string() });
const decisionRowSchema = z.object({ id: z.string(), workspace_id: z.string(), decision_json: z.string(), status: z.string(), idempotency_key: z.string().nullable(), requested_at: z.string(), answered_at: z.string().nullable() });
const activityRowSchema = z.object({ id: z.string(), workspace_id: z.string(), actor: z.string(), type: z.string(), message: z.string(), payload_json: z.string(), evidence_json: z.string().nullable(), created_at: z.string() });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const startedAt = Date.now();
    const url = new URL(request.url);
    const path = pathForLogs(url.pathname);
    let response: Response;
    try {
      if (url.pathname === "/repo" && (request.method === "GET" || request.method === "HEAD")) {
        response = Response.redirect(PUBLIC_REPOSITORY_URL, 302);
      } else {
        response = url.pathname.startsWith("/api/") ? await handleApi(request, env, url) : await env.ASSETS.fetch(request);
      }
    } catch (error) {
      if (error instanceof RequestError) {
        response = jsonError(error.code, error.message, error.status);
        return withSecurityHeaders(response);
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(JSON.stringify({ message: "request failed", method: request.method, path, error: message }));
      response = jsonError("internal_error", "The request could not be completed", 500);
    }
    response = withSecurityHeaders(response);
    console.log(JSON.stringify({ message: "request complete", method: request.method, path, status: response.status, durationMs: Date.now() - startedAt }));
    return response;
  },
} satisfies ExportedHandler<Env>;

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: "GET, PUT, OPTIONS" } });
  if (url.pathname === "/api/health" && request.method === "GET") {
    const database = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return Response.json({ ok: database?.ok === 1, service: "thread-webmcp", environment: env.APP_ENV });
  }
  const match = url.pathname.match(/^\/api\/workspaces\/([^/]+)$/);
  if (!match) return jsonError("not_found", "API route not found", 404);
  let workspaceId: string;
  try { workspaceId = decodeURIComponent(match[1] ?? ""); }
  catch { return jsonError("invalid_workspace_id", "Workspace ID must be a UUID", 400); }
  if (!UUID_PATTERN.test(workspaceId)) return jsonError("invalid_workspace_id", "Workspace ID must be a UUID", 400);
  const rateLimitKey = `${request.headers.get("CF-Connecting-IP") ?? "local"}:${request.method}`;
  const rateLimit = await env.API_RATE_LIMITER.limit({ key: rateLimitKey });
  if (!rateLimit.success) {
    const response = jsonError("rate_limit_exceeded", "Too many workspace requests", 429);
    response.headers.set("Retry-After", "60");
    return response;
  }
  if (request.method === "GET") {
    const state = await loadWorkspace(env.DB, workspaceId);
    return state ? Response.json(state) : jsonError("workspace_not_found", "Workspace not found", 404);
  }
  if (request.method === "PUT") {
    if (isCrossSiteMutation(request, url)) return jsonError("cross_site_request", "Cross-site workspace mutations are not allowed", 403);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return jsonError("unsupported_media_type", "Content-Type must be application/json", 415);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_BODY_BYTES) return jsonError("body_too_large", "Request body exceeds 1 MiB", 413);
    const body = await readBoundedJson(request);
    const parsed = workspaceStateSchema.safeParse(body);
    if (!parsed.success) return jsonError("validation_error", "Workspace payload is invalid", 400, parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
    if (parsed.data.workspace.id !== workspaceId) return jsonError("workspace_id_mismatch", "Path and payload workspace IDs do not match", 409);
    const invariantErrors = validateWorkspaceIntegrity(parsed.data);
    if (invariantErrors.length > 0) return jsonError("workspace_invariant_error", "Workspace graph or decision references are invalid", 409, invariantErrors);
    await saveWorkspace(env.DB, parsed.data);
    return Response.json({ ok: true, workspaceId, updatedAt: parsed.data.workspace.updatedAt, planRevision: parsed.data.planRevision });
  }
  const response = jsonError("method_not_allowed", "Method not allowed", 405);
  response.headers.set("Allow", "GET, PUT, OPTIONS");
  return response;
}

export function isCrossSiteMutation(request: Request, url: URL): boolean {
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return true;
  return request.headers.get("Sec-Fetch-Site")?.toLowerCase() === "cross-site";
}

async function readBoundedJson(request: Request): Promise<unknown> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BODY_BYTES) {
      await reader.cancel("body too large");
      throw new RequestError("body_too_large", "Request body exceeds 1 MiB", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new RequestError("invalid_json", "Request body must be valid JSON", 400); }
}

async function loadWorkspace(database: D1Database, workspaceId: string): Promise<WorkspaceState | null> {
  const results = await database.batch([
    database.prepare("SELECT id, name, objective, description, deadline, available_hours, budget, created_at, updated_at, last_simulation_json, decision_policy_json, last_proposal_application_json, plan_revision FROM workspaces WHERE id = ?").bind(workspaceId),
    database.prepare("SELECT * FROM tasks WHERE workspace_id = ? ORDER BY created_at, id").bind(workspaceId),
    database.prepare("SELECT * FROM dependencies WHERE workspace_id = ? ORDER BY id").bind(workspaceId),
    database.prepare("SELECT * FROM constraints WHERE workspace_id = ? ORDER BY id").bind(workspaceId),
    database.prepare("SELECT * FROM resources WHERE workspace_id = ? ORDER BY id").bind(workspaceId),
    database.prepare("SELECT * FROM risks WHERE workspace_id = ? ORDER BY id").bind(workspaceId),
    database.prepare("SELECT * FROM scenarios WHERE workspace_id = ? ORDER BY created_at, id").bind(workspaceId),
    database.prepare("SELECT * FROM plan_proposals WHERE workspace_id = ? ORDER BY updated_at, id").bind(workspaceId),
    database.prepare("SELECT * FROM human_decisions WHERE workspace_id = ? ORDER BY requested_at, id").bind(workspaceId),
    database.prepare("SELECT * FROM activity_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 500").bind(workspaceId),
  ]);
  const rows = results.map((result) => result.results);
  const workspaceValue = rows[0]?.[0];
  if (!workspaceValue) return null;
  const workspaceRow = workspaceRowSchema.parse(workspaceValue);
  const tasks: Task[] = (rows[1] ?? []).map((value) => { const item = taskRowSchema.parse(value); return { id: item.id, workspaceId: item.workspace_id, title: item.title, description: item.description, kind: z.enum(["task", "milestone"]).parse(item.kind), status: z.enum(["todo", "in-progress", "blocked", "done"]).parse(item.status), priority: z.enum(["low", "medium", "high", "critical"]).parse(item.priority), estimatedHours: item.estimated_hours, minimumHours: item.minimum_hours, maximumHours: item.maximum_hours, confidence: item.confidence, cost: item.cost, x: item.x, y: item.y, createdAt: item.created_at, updatedAt: item.updated_at }; });
  const dependencies: Dependency[] = (rows[2] ?? []).map((value) => { const item = dependencyRowSchema.parse(value); return { id: item.id, workspaceId: item.workspace_id, fromTaskId: item.from_task_id, toTaskId: item.to_task_id }; });
  const constraints: Constraint[] = (rows[3] ?? []).map((value) => { const item = constraintRowSchema.parse(value); return { id: item.id, workspaceId: item.workspace_id, type: item.type, title: item.title, value: z.union([z.string(), z.number(), z.boolean()]).parse(JSON.parse(item.value_json)), hard: item.hard === 1, description: item.description }; });
  const resources: Resource[] = (rows[4] ?? []).map((value) => { const item = resourceRowSchema.parse(value); return { id: item.id, workspaceId: item.workspace_id, name: item.name, type: item.type, capacity: item.capacity, cost: item.cost }; });
  const risks: Risk[] = (rows[5] ?? []).map((value) => { const item = riskRowSchema.parse(value); return { id: item.id, workspaceId: item.workspace_id, taskId: item.task_id, title: item.title, probability: item.probability, impact: item.impact, mitigation: item.mitigation, resolved: item.resolved === 1 }; });
  const scenarios: Scenario[] = (rows[6] ?? []).map((value) => { const item = scenarioRowSchema.parse(value); return { id: item.id, workspaceId: item.workspace_id, name: item.name, description: item.description, snapshot: planSnapshotSchema.parse(JSON.parse(item.snapshot_json)), createdAt: item.created_at }; });
  const planProposals: PlanProposal[] = (rows[7] ?? []).map((value) => {
    const item = proposalRowSchema.parse(value);
    const proposal = planProposalSchema.parse(JSON.parse(item.proposal_json));
    if (proposal.id !== item.id || proposal.workspaceId !== item.workspace_id || proposal.status !== item.status || proposal.mode !== item.mode) throw new Error(`Proposal row ${item.id} is inconsistent`);
    return proposal;
  });
  const humanDecisions: HumanDecision[] = (rows[8] ?? []).map((value) => {
    const item = decisionRowSchema.parse(value);
    const decision = humanDecisionSchema.parse(JSON.parse(item.decision_json));
    if (decision.id !== item.id || decision.workspaceId !== item.workspace_id || decision.status !== item.status) throw new Error(`Decision row ${item.id} is inconsistent`);
    return decision;
  });
  const activity: ActivityEvent[] = (rows[9] ?? []).map((value) => {
    const item = activityRowSchema.parse(value);
    return activityEventSchema.parse({
      id: item.id,
      workspaceId: item.workspace_id,
      actor: item.actor,
      type: item.type,
      message: item.message,
      payload: JSON.parse(item.payload_json),
      ...(item.evidence_json ? { evidence: JSON.parse(item.evidence_json) } : {}),
      createdAt: item.created_at,
    });
  }).reverse();
  return workspaceStateSchema.parse({
    workspace: { id: workspaceRow.id, name: workspaceRow.name, objective: workspaceRow.objective, description: workspaceRow.description, deadline: workspaceRow.deadline, availableHours: workspaceRow.available_hours, budget: workspaceRow.budget, createdAt: workspaceRow.created_at, updatedAt: workspaceRow.updated_at },
    tasks, dependencies, constraints, resources, risks, scenarios, planProposals, humanDecisions, activity,
    ...(workspaceRow.decision_policy_json ? { decisionPolicy: decisionPolicySchema.parse(JSON.parse(workspaceRow.decision_policy_json)) } : {}),
    ...(workspaceRow.last_proposal_application_json ? { lastProposalApplication: proposalApplicationSchema.parse(JSON.parse(workspaceRow.last_proposal_application_json)) } : {}),
    planRevision: workspaceRow.plan_revision,
    lastSimulation: workspaceRow.last_simulation_json ? simulationResultSchema.parse(JSON.parse(workspaceRow.last_simulation_json)) : null,
    storageMode: "remote",
  });
}

async function saveWorkspace(database: D1Database, state: WorkspaceState): Promise<void> {
  const workspaceId = state.workspace.id;
  const statements: D1PreparedStatement[] = [
    database.prepare("INSERT INTO workspaces (id, name, objective, description, deadline, available_hours, budget, created_at, updated_at, last_simulation_json, decision_policy_json, last_proposal_application_json, plan_revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, objective=excluded.objective, description=excluded.description, deadline=excluded.deadline, available_hours=excluded.available_hours, budget=excluded.budget, updated_at=excluded.updated_at, last_simulation_json=excluded.last_simulation_json, decision_policy_json=excluded.decision_policy_json, last_proposal_application_json=excluded.last_proposal_application_json, plan_revision=excluded.plan_revision").bind(workspaceId, state.workspace.name, state.workspace.objective, state.workspace.description, state.workspace.deadline, state.workspace.availableHours, state.workspace.budget, state.workspace.createdAt, state.workspace.updatedAt, state.lastSimulation ? JSON.stringify(state.lastSimulation) : null, JSON.stringify(state.decisionPolicy), state.lastProposalApplication ? JSON.stringify(state.lastProposalApplication) : null, state.planRevision),
    database.prepare("DELETE FROM dependencies WHERE workspace_id = ?").bind(workspaceId),
    database.prepare("DELETE FROM risks WHERE workspace_id = ?").bind(workspaceId),
    database.prepare("DELETE FROM tasks WHERE workspace_id = ?").bind(workspaceId),
    database.prepare("DELETE FROM constraints WHERE workspace_id = ?").bind(workspaceId),
    database.prepare("DELETE FROM resources WHERE workspace_id = ?").bind(workspaceId),
    database.prepare("DELETE FROM scenarios WHERE workspace_id = ?").bind(workspaceId),
    database.prepare("DELETE FROM plan_proposals WHERE workspace_id = ?").bind(workspaceId),
    database.prepare("DELETE FROM human_decisions WHERE workspace_id = ?").bind(workspaceId),
    database.prepare("DELETE FROM activity_events WHERE workspace_id = ?").bind(workspaceId),
  ];
  for (const task of state.tasks) statements.push(database.prepare("INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(task.id, workspaceId, task.title, task.description, task.kind, task.status, task.priority, task.estimatedHours, task.minimumHours, task.maximumHours, task.confidence, task.cost, task.x, task.y, task.createdAt, task.updatedAt));
  for (const dependency of state.dependencies) statements.push(database.prepare("INSERT INTO dependencies VALUES (?, ?, ?, ?)").bind(dependency.id, workspaceId, dependency.fromTaskId, dependency.toTaskId));
  for (const constraint of state.constraints) statements.push(database.prepare("INSERT INTO constraints VALUES (?, ?, ?, ?, ?, ?, ?)").bind(constraint.id, workspaceId, constraint.type, constraint.title, JSON.stringify(constraint.value), constraint.hard ? 1 : 0, constraint.description));
  for (const resource of state.resources) statements.push(database.prepare("INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?)").bind(resource.id, workspaceId, resource.name, resource.type, resource.capacity, resource.cost));
  for (const risk of state.risks) statements.push(database.prepare("INSERT INTO risks VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(risk.id, workspaceId, risk.taskId, risk.title, risk.probability, risk.impact, risk.mitigation, risk.resolved ? 1 : 0));
  for (const scenario of state.scenarios) statements.push(database.prepare("INSERT INTO scenarios VALUES (?, ?, ?, ?, ?, ?)").bind(scenario.id, workspaceId, scenario.name, scenario.description, JSON.stringify(scenario.snapshot), scenario.createdAt));
  for (const proposal of state.planProposals) statements.push(database.prepare("INSERT INTO plan_proposals (id, workspace_id, proposal_json, status, mode, idempotency_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(proposal.id, workspaceId, JSON.stringify(proposal), proposal.status, proposal.mode, proposal.idempotencyKey ?? null, proposal.createdAt, proposal.updatedAt));
  for (const decision of state.humanDecisions) statements.push(database.prepare("INSERT INTO human_decisions (id, workspace_id, decision_json, status, idempotency_key, requested_at, answered_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(decision.id, workspaceId, JSON.stringify(decision), decision.status, decision.idempotencyKey ?? null, decision.requestedAt, decision.answeredAt));
  for (const event of state.activity.slice(-500)) statements.push(database.prepare("INSERT INTO activity_events (id, workspace_id, actor, type, message, payload_json, created_at, evidence_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(event.id, workspaceId, event.actor, event.type, event.message, JSON.stringify(event.payload), event.createdAt, event.evidence ? JSON.stringify(event.evidence) : null));
  await database.batch(statements);
}

export function validateWorkspaceIntegrity(state: WorkspaceState): Array<{ scope: string; message: string }> {
  const issues: Array<{ scope: string; message: string }> = [];
  const workspaceId = state.workspace.id;
  const addPlanIssues = (scope: string, plan: WorkspaceState | Scenario["snapshot"]): void => {
    if (plan.workspace.id !== workspaceId) issues.push({ scope, message: "Plan belongs to another workspace" });
    for (const message of validatePlanInvariants(plan)) issues.push({ scope, message });
  };
  const checkUnique = <T extends { id: string }>(scope: string, values: T[]): void => {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value.id)) issues.push({ scope, message: `Duplicate ID: ${value.id}` });
      seen.add(value.id);
    }
  };

  addPlanIssues("workspace", state);
  checkUnique("scenarios", state.scenarios);
  checkUnique("planProposals", state.planProposals);
  checkUnique("humanDecisions", state.humanDecisions);
  checkUnique("activity", state.activity);

  for (const taskId of state.decisionPolicy.preservedTaskIds) {
    if (!state.tasks.some((task) => task.id === taskId)) issues.push({ scope: "decisionPolicy", message: `Preserved task does not exist: ${taskId}` });
  }
  for (const scenario of state.scenarios) {
    if (scenario.workspaceId !== workspaceId) issues.push({ scope: `scenario:${scenario.id}`, message: "Scenario belongs to another workspace" });
    addPlanIssues(`scenario:${scenario.id}`, scenario.snapshot);
  }

  const proposalIds = new Set(state.planProposals.map((proposal) => proposal.id));
  const proposalIdempotencyKeys = new Set<string>();
  for (const proposal of state.planProposals) {
    const scope = `proposal:${proposal.id}`;
    if (proposal.workspaceId !== workspaceId) issues.push({ scope, message: "Proposal belongs to another workspace" });
    addPlanIssues(scope, proposal.proposedPlan);
    if (proposal.basePlanRevision > state.planRevision) issues.push({ scope, message: "Proposal base revision is newer than the live plan" });
    if (proposal.idempotencyKey) {
      if (proposalIdempotencyKeys.has(proposal.idempotencyKey)) issues.push({ scope, message: `Duplicate proposal idempotency key: ${proposal.idempotencyKey}` });
      proposalIdempotencyKeys.add(proposal.idempotencyKey);
    }
  }

  const decisionIdempotencyKeys = new Set<string>();
  for (const decision of state.humanDecisions) {
    const scope = `decision:${decision.id}`;
    if (decision.workspaceId !== workspaceId) issues.push({ scope, message: "Decision belongs to another workspace" });
    for (const proposalId of decision.proposalIds) {
      if (!proposalIds.has(proposalId)) issues.push({ scope, message: `Decision references an unknown proposal: ${proposalId}` });
    }
    const optionIds = new Set<string>();
    for (const option of decision.options) {
      if (optionIds.has(option.id)) issues.push({ scope, message: `Duplicate option ID: ${option.id}` });
      optionIds.add(option.id);
      if (!decision.proposalIds.includes(option.proposalId)) issues.push({ scope, message: `Option ${option.id} references a proposal outside this decision` });
    }
    if (decision.selectedOptionId && !decision.options.some((option) => option.id === decision.selectedOptionId)) issues.push({ scope, message: "Selected option does not exist" });
    if (decision.idempotencyKey) {
      if (decisionIdempotencyKeys.has(decision.idempotencyKey)) issues.push({ scope, message: `Duplicate decision idempotency key: ${decision.idempotencyKey}` });
      decisionIdempotencyKeys.add(decision.idempotencyKey);
    }
  }

  if (state.lastProposalApplication) {
    if (!proposalIds.has(state.lastProposalApplication.proposalId)) issues.push({ scope: "lastProposalApplication", message: "Applied proposal does not exist" });
    addPlanIssues("lastProposalApplication.previousPlan", state.lastProposalApplication.previousPlan);
  }
  for (const event of state.activity) {
    if (event.workspaceId !== workspaceId) issues.push({ scope: `activity:${event.id}`, message: "Activity event belongs to another workspace" });
  }
  return issues;
}

function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  secured.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("X-Frame-Options", "DENY");
  secured.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  secured.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  secured.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (secured.headers.get("Content-Type")?.includes("application/json")) secured.headers.set("Cache-Control", "no-store");
  return secured;
}

export function pathForLogs(pathname: string): string {
  return /^\/api\/workspaces\/[^/]+$/.test(pathname) ? "/api/workspaces/:id" : pathname;
}

function jsonError(code: string, message: string, status: number, details?: unknown): Response {
  return Response.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

class RequestError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}
