import { z } from "zod";
import { planSnapshotSchema, simulationResultSchema, workspaceStateSchema } from "../src/domain/schemas";
import type { ActivityEvent, Constraint, Dependency, Resource, Risk, Scenario, Task, WorkspaceState } from "../src/domain/types";

const MAX_BODY_BYTES = 1_048_576;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const workspaceRowSchema = z.object({
  id: z.string(), name: z.string(), objective: z.string(), description: z.string(), deadline: z.string(),
  available_hours: z.number(), budget: z.number(), created_at: z.string(), updated_at: z.string(), last_simulation_json: z.string().nullable(),
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
const activityRowSchema = z.object({ id: z.string(), workspace_id: z.string(), actor: z.string(), type: z.string(), message: z.string(), payload_json: z.string(), created_at: z.string() });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const startedAt = Date.now();
    const url = new URL(request.url);
    let response: Response;
    try {
      response = url.pathname.startsWith("/api/") ? await handleApi(request, env, url) : await env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof RequestError) {
        response = jsonError(error.code, error.message, error.status);
        return withSecurityHeaders(response);
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(JSON.stringify({ message: "request failed", method: request.method, path: url.pathname, error: message }));
      response = jsonError("internal_error", "The request could not be completed", 500);
    }
    response = withSecurityHeaders(response);
    console.log(JSON.stringify({ message: "request complete", method: request.method, path: url.pathname, status: response.status, durationMs: Date.now() - startedAt }));
    return response;
  },
} satisfies ExportedHandler<Env>;

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: "GET, PUT, DELETE, OPTIONS" } });
  if (url.pathname === "/api/health" && request.method === "GET") {
    const database = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return Response.json({ ok: database?.ok === 1, service: "thread-webmcp", environment: env.APP_ENV });
  }
  const match = url.pathname.match(/^\/api\/workspaces\/([^/]+)$/);
  if (!match) return jsonError("not_found", "API route not found", 404);
  const workspaceId = decodeURIComponent(match[1] ?? "");
  if (!UUID_PATTERN.test(workspaceId)) return jsonError("invalid_workspace_id", "Workspace ID must be a UUID", 400);
  if (request.method === "GET") {
    const state = await loadWorkspace(env.DB, workspaceId);
    return state ? Response.json(state) : jsonError("workspace_not_found", "Workspace not found", 404);
  }
  if (request.method === "PUT") {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_BODY_BYTES) return jsonError("body_too_large", "Request body exceeds 1 MiB", 413);
    const body = await readBoundedJson(request);
    const parsed = workspaceStateSchema.safeParse(body);
    if (!parsed.success) return jsonError("validation_error", "Workspace payload is invalid", 400, parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
    if (parsed.data.workspace.id !== workspaceId) return jsonError("workspace_id_mismatch", "Path and payload workspace IDs do not match", 409);
    await saveWorkspace(env.DB, parsed.data);
    return Response.json({ ok: true, workspaceId, updatedAt: parsed.data.workspace.updatedAt });
  }
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM workspaces WHERE id = ?").bind(workspaceId).run();
    return new Response(null, { status: 204 });
  }
  return jsonError("method_not_allowed", "Method not allowed", 405);
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
  const row = await database.prepare("SELECT id, name, objective, description, deadline, available_hours, budget, created_at, updated_at, last_simulation_json FROM workspaces WHERE id = ?").bind(workspaceId).first();
  if (!row) return null;
  const workspaceRow = workspaceRowSchema.parse(row);
  const results = await database.batch([
    database.prepare("SELECT * FROM tasks WHERE workspace_id = ? ORDER BY created_at, id").bind(workspaceId),
    database.prepare("SELECT * FROM dependencies WHERE workspace_id = ? ORDER BY id").bind(workspaceId),
    database.prepare("SELECT * FROM constraints WHERE workspace_id = ? ORDER BY id").bind(workspaceId),
    database.prepare("SELECT * FROM resources WHERE workspace_id = ? ORDER BY id").bind(workspaceId),
    database.prepare("SELECT * FROM risks WHERE workspace_id = ? ORDER BY id").bind(workspaceId),
    database.prepare("SELECT * FROM scenarios WHERE workspace_id = ? ORDER BY created_at, id").bind(workspaceId),
    database.prepare("SELECT * FROM activity_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 500").bind(workspaceId),
  ]);
  const rows = results.map((result) => result.results);
  const tasks: Task[] = (rows[0] ?? []).map((value) => { const item = taskRowSchema.parse(value); return { id: item.id, workspaceId: item.workspace_id, title: item.title, description: item.description, kind: z.enum(["task", "milestone"]).parse(item.kind), status: z.enum(["todo", "in-progress", "blocked", "done"]).parse(item.status), priority: z.enum(["low", "medium", "high", "critical"]).parse(item.priority), estimatedHours: item.estimated_hours, minimumHours: item.minimum_hours, maximumHours: item.maximum_hours, confidence: item.confidence, cost: item.cost, x: item.x, y: item.y, createdAt: item.created_at, updatedAt: item.updated_at }; });
  const dependencies: Dependency[] = (rows[1] ?? []).map((value) => { const item = dependencyRowSchema.parse(value); return { id: item.id, workspaceId: item.workspace_id, fromTaskId: item.from_task_id, toTaskId: item.to_task_id }; });
  const constraints: Constraint[] = (rows[2] ?? []).map((value) => { const item = constraintRowSchema.parse(value); return { id: item.id, workspaceId: item.workspace_id, type: item.type, title: item.title, value: z.union([z.string(), z.number(), z.boolean()]).parse(JSON.parse(item.value_json)), hard: item.hard === 1, description: item.description }; });
  const resources: Resource[] = (rows[3] ?? []).map((value) => { const item = resourceRowSchema.parse(value); return { id: item.id, workspaceId: item.workspace_id, name: item.name, type: item.type, capacity: item.capacity, cost: item.cost }; });
  const risks: Risk[] = (rows[4] ?? []).map((value) => { const item = riskRowSchema.parse(value); return { id: item.id, workspaceId: item.workspace_id, taskId: item.task_id, title: item.title, probability: item.probability, impact: item.impact, mitigation: item.mitigation, resolved: item.resolved === 1 }; });
  const scenarios: Scenario[] = (rows[5] ?? []).map((value) => { const item = scenarioRowSchema.parse(value); return { id: item.id, workspaceId: item.workspace_id, name: item.name, description: item.description, snapshot: planSnapshotSchema.parse(JSON.parse(item.snapshot_json)), createdAt: item.created_at }; });
  const activity: ActivityEvent[] = (rows[6] ?? []).map((value) => { const item = activityRowSchema.parse(value); return { id: item.id, workspaceId: item.workspace_id, actor: z.enum(["human", "agent", "system"]).parse(item.actor), type: item.type, message: item.message, payload: z.record(z.string(), z.unknown()).parse(JSON.parse(item.payload_json)), createdAt: item.created_at }; }).reverse();
  return workspaceStateSchema.parse({
    workspace: { id: workspaceRow.id, name: workspaceRow.name, objective: workspaceRow.objective, description: workspaceRow.description, deadline: workspaceRow.deadline, availableHours: workspaceRow.available_hours, budget: workspaceRow.budget, createdAt: workspaceRow.created_at, updatedAt: workspaceRow.updated_at },
    tasks, dependencies, constraints, resources, risks, scenarios, activity,
    lastSimulation: workspaceRow.last_simulation_json ? simulationResultSchema.parse(JSON.parse(workspaceRow.last_simulation_json)) : null,
    storageMode: "remote",
  });
}

async function saveWorkspace(database: D1Database, state: WorkspaceState): Promise<void> {
  const workspaceId = state.workspace.id;
  const statements: D1PreparedStatement[] = [
    database.prepare("INSERT INTO workspaces (id, name, objective, description, deadline, available_hours, budget, created_at, updated_at, last_simulation_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, objective=excluded.objective, description=excluded.description, deadline=excluded.deadline, available_hours=excluded.available_hours, budget=excluded.budget, updated_at=excluded.updated_at, last_simulation_json=excluded.last_simulation_json").bind(workspaceId, state.workspace.name, state.workspace.objective, state.workspace.description, state.workspace.deadline, state.workspace.availableHours, state.workspace.budget, state.workspace.createdAt, state.workspace.updatedAt, state.lastSimulation ? JSON.stringify(state.lastSimulation) : null),
    database.prepare("DELETE FROM dependencies WHERE workspace_id = ?").bind(workspaceId),
    database.prepare("DELETE FROM risks WHERE workspace_id = ?").bind(workspaceId),
    database.prepare("DELETE FROM tasks WHERE workspace_id = ?").bind(workspaceId),
    database.prepare("DELETE FROM constraints WHERE workspace_id = ?").bind(workspaceId),
    database.prepare("DELETE FROM resources WHERE workspace_id = ?").bind(workspaceId),
    database.prepare("DELETE FROM scenarios WHERE workspace_id = ?").bind(workspaceId),
    database.prepare("DELETE FROM activity_events WHERE workspace_id = ?").bind(workspaceId),
  ];
  for (const task of state.tasks) statements.push(database.prepare("INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(task.id, workspaceId, task.title, task.description, task.kind, task.status, task.priority, task.estimatedHours, task.minimumHours, task.maximumHours, task.confidence, task.cost, task.x, task.y, task.createdAt, task.updatedAt));
  for (const dependency of state.dependencies) statements.push(database.prepare("INSERT INTO dependencies VALUES (?, ?, ?, ?)").bind(dependency.id, workspaceId, dependency.fromTaskId, dependency.toTaskId));
  for (const constraint of state.constraints) statements.push(database.prepare("INSERT INTO constraints VALUES (?, ?, ?, ?, ?, ?, ?)").bind(constraint.id, workspaceId, constraint.type, constraint.title, JSON.stringify(constraint.value), constraint.hard ? 1 : 0, constraint.description));
  for (const resource of state.resources) statements.push(database.prepare("INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?)").bind(resource.id, workspaceId, resource.name, resource.type, resource.capacity, resource.cost));
  for (const risk of state.risks) statements.push(database.prepare("INSERT INTO risks VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(risk.id, workspaceId, risk.taskId, risk.title, risk.probability, risk.impact, risk.mitigation, risk.resolved ? 1 : 0));
  for (const scenario of state.scenarios) statements.push(database.prepare("INSERT INTO scenarios VALUES (?, ?, ?, ?, ?, ?)").bind(scenario.id, workspaceId, scenario.name, scenario.description, JSON.stringify(scenario.snapshot), scenario.createdAt));
  for (const event of state.activity.slice(-500)) statements.push(database.prepare("INSERT INTO activity_events VALUES (?, ?, ?, ?, ?, ?, ?)").bind(event.id, workspaceId, event.actor, event.type, event.message, JSON.stringify(event.payload), event.createdAt));
  await database.batch(statements);
}

function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  secured.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("X-Frame-Options", "DENY");
  secured.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  return secured;
}

function jsonError(code: string, message: string, status: number, details?: unknown): Response {
  return Response.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

class RequestError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}
