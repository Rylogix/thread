import { z } from "zod";
import type { WorkspaceService } from "../domain/workspaceService";
import type { PlanOperation } from "../domain/types";

export type ToolCategory = "read" | "create" | "modify" | "analysis" | "high-level" | "scenario";

export interface ThreadToolDefinition extends WebMCPToolDefinition {
  category: ToolCategory;
}

export interface RegistrationReport {
  supported: boolean;
  attempted: number;
  registered: string[];
  errors: Array<{ name: string; message: string }>;
  nativeTools: string[];
  dispose(): void;
}

const emptySchema = objectSchema({});
const id = { type: "string", format: "uuid" } as const;
const number = (minimum = 0, maximum = 10_000) => ({ type: "number", minimum, maximum });
const text = (maxLength = 1_000) => ({ type: "string", minLength: 1, maxLength });
const taskFields = {
  title: text(140),
  description: { type: "string", maxLength: 2_000 },
  status: { type: "string", enum: ["todo", "in-progress", "blocked", "done"] },
  priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
  estimatedHours: number(),
  minimumHours: number(),
  maximumHours: number(),
  confidence: number(0, 1),
  cost: number(0, 1_000_000),
  x: number(-100_000, 100_000),
  y: number(-100_000, 100_000),
};

export function buildThreadTools(service: WorkspaceService): ThreadToolDefinition[] {
  const readonly = (category: ToolCategory, name: string, title: string, description: string, inputSchema: Record<string, unknown>, execute: (input: Record<string, unknown>) => unknown | Promise<unknown>): ThreadToolDefinition => ({
    name, title, description, inputSchema, category, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: wrap(execute),
  });
  const read = (name: string, title: string, description: string, inputSchema: Record<string, unknown>, execute: (input: Record<string, unknown>) => unknown | Promise<unknown>) => readonly("read", name, title, description, inputSchema, execute);
  const analyze = (name: string, title: string, description: string, inputSchema: Record<string, unknown>, execute: (input: Record<string, unknown>) => unknown | Promise<unknown>) => readonly("analysis", name, title, description, inputSchema, execute);
  const action = (category: ToolCategory, name: string, title: string, description: string, inputSchema: Record<string, unknown>, execute: (input: Record<string, unknown>) => unknown | Promise<unknown>): ThreadToolDefinition => ({
    name, title, description, inputSchema, category, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: wrap(execute),
  });
  const agent = { actor: "agent" } as const;

  return [
    read("get_workspace", "Get workspace", "Return the active THREAD workspace, collection counts, storage mode, and current feasibility.", emptySchema, () => {
      const state = service.getState();
      if (!state) throw new Error("Workspace is not ready");
      return { workspace: state.workspace, counts: { tasks: state.tasks.length, dependencies: state.dependencies.length, constraints: state.constraints.length, resources: state.resources.length, risks: state.risks.length, scenarios: state.scenarios.length }, storageMode: state.storageMode, feasibility: service.calculateFeasibility() };
    }),
    read("get_goal", "Get goal", "Return the objective, deadline, available hours, and budget for the active plan.", emptySchema, () => service.getGoal()),
    read("get_tasks", "Get tasks", "List every task and milestone with schedule, uncertainty, cost, status, and graph position.", emptySchema, () => service.getTasks()),
    read("get_task", "Get task", "Return one task by stable UUID, including its incoming and outgoing dependencies.", objectSchema({ taskId: id }, ["taskId"]), (input) => {
      const taskId = parseId(input, "taskId");
      return { task: service.getTask(taskId), incoming: service.getDependencies().filter((item) => item.toTaskId === taskId), outgoing: service.getDependencies().filter((item) => item.fromTaskId === taskId) };
    }),
    read("get_constraints", "Get constraints", "List hard and soft workspace constraints.", emptySchema, () => service.getConstraints()),
    read("get_dependencies", "Get dependencies", "List directed task dependencies in the active graph.", emptySchema, () => service.getDependencies()),
    read("get_resources", "Get resources", "List named resources, capacities, and costs.", emptySchema, () => service.getResources()),
    read("get_risks", "Get risks", "List linked and workspace-wide risks with probability, impact, mitigation, and resolution state.", emptySchema, () => service.getRisks()),
    read("get_timeline", "Get timeline", "Return calculated earliest and latest timing, slack, and critical status for each task.", emptySchema, () => service.getTimeline()),
    read("get_critical_path", "Get critical path", "Return the currently calculated longest dependency path and all CPM timings.", emptySchema, () => service.getCriticalPath()),
    read("get_simulation_summary", "Get simulation summary", "Return the last visible simulation result, or null when the plan changed since it ran.", emptySchema, () => service.getSimulationSummary()),
    read("get_activity", "Get activity", "Return recent human, agent, system, and persistence activity in reverse chronological order.", objectSchema({ limit: { type: "integer", minimum: 1, maximum: 200 } }), (input) => service.getActivity(typeof input.limit === "number" ? input.limit : 50)),

    action("create", "create_task", "Create task", "Create a validated task in the live graph and persist it. Reuse id or idempotencyKey for safe retries.", objectSchema({ id, ...taskFields, idempotencyKey: { type: "string", maxLength: 120 } }, ["title"]), (input) => {
      const { idempotencyKey, ...task } = input;
      return service.createTask(task, { actor: "agent", idempotencyKey: typeof idempotencyKey === "string" ? idempotencyKey : undefined });
    }),
    action("create", "create_milestone", "Create milestone", "Create a zero-duration milestone in the live graph.", objectSchema({ title: taskFields.title, description: taskFields.description, priority: taskFields.priority, x: taskFields.x, y: taskFields.y }, ["title"]), (input) => service.createMilestone(input, agent)),
    action("create", "create_constraint", "Create constraint", "Add a hard or soft constraint to the current workspace.", objectSchema({ type: text(60), title: text(140), value: { oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] }, hard: { type: "boolean" }, description: { type: "string", maxLength: 1_000 } }, ["type", "title", "value", "hard", "description"]), (input) => service.createConstraint(input, agent)),
    action("create", "create_dependency", "Create dependency", "Connect two tasks with a directed dependency. Rejects duplicates, missing IDs, self-links, and cycles.", objectSchema({ id, fromTaskId: id, toTaskId: id }, ["fromTaskId", "toTaskId"]), (input) => service.createDependency(input, agent)),
    action("create", "create_resource", "Create resource", "Add a named person, budget, or capacity resource.", objectSchema({ name: text(100), type: text(60), capacity: number(0, 100_000), cost: number(0, 1_000_000) }, ["name", "type", "capacity", "cost"]), (input) => service.createResource(input, agent)),
    action("create", "create_risk", "Create risk", "Add a quantified risk, optionally linked to a task.", objectSchema({ taskId: { anyOf: [id, { type: "null" }] }, title: text(180), probability: number(0, 1), impact: number(0, 1), mitigation: { type: "string", maxLength: 1_000 } }, ["taskId", "title", "probability", "impact", "mitigation"]), (input) => service.createRisk(input, agent)),
    action("create", "create_scenario", "Create scenario", "Capture an immutable named snapshot of the current plan for isolated comparison.", objectSchema({ name: text(100), description: { type: "string", maxLength: 1_000 } }, ["name"]), (input) => service.createScenario({ description: "", ...input }, agent)),

    action("modify", "update_task", "Update task", "Update validated task properties in the shared live state.", objectSchema({ taskId: id, ...taskFields }, ["taskId"]), (input) => service.updateTask(input, agent)),
    action("modify", "move_task", "Move task", "Move a task node to exact graph coordinates.", objectSchema({ taskId: id, x: taskFields.x, y: taskFields.y }, ["taskId", "x", "y"]), (input) => service.moveTask(input, agent)),
    action("modify", "prioritize_task", "Prioritize task", "Set a task priority to low, medium, high, or critical.", objectSchema({ taskId: id, priority: taskFields.priority }, ["taskId", "priority"]), (input) => service.prioritizeTask(input, agent)),
    action("modify", "update_constraint", "Update constraint", "Modify a known workspace constraint without replacing it.", objectSchema({ constraintId: id, type: text(60), title: text(140), value: { oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] }, hard: { type: "boolean" }, description: { type: "string", maxLength: 1_000 } }, ["constraintId"]), (input) => service.updateConstraint(input, agent)),
    action("modify", "resolve_risk", "Resolve risk", "Mark a known risk resolved and optionally record its mitigation.", objectSchema({ riskId: id, mitigation: { type: "string", maxLength: 1_000 } }, ["riskId"]), (input) => service.resolveRisk(input, agent)),
    action("modify", "complete_task", "Complete task", "Mark a known task complete and persist the visible status change.", objectSchema({ taskId: id }, ["taskId"]), (input) => service.completeTask(input, agent)),

    analyze("calculate_critical_path", "Calculate critical path", "Run deterministic critical-path analysis over the current graph.", emptySchema, () => service.getCriticalPath()),
    analyze("detect_conflicts", "Detect conflicts", "Detect cycles, missing tasks, impossible deadlines, capacity, budget, resource, and milestone conflicts.", emptySchema, () => service.detectConflicts()),
    analyze("find_bottlenecks", "Find bottlenecks", "Rank remaining tasks by criticality, downstream impact, duration, uncertainty, and risk.", emptySchema, () => service.findBottlenecks()),
    action("analysis", "run_simulation", "Run simulation", "Run a bounded, reproducible Monte Carlo simulation and publish the current-plan result to the UI.", objectSchema({ iterations: { type: "integer", minimum: 50, maximum: 5_000 }, scenarioId: id, seed: { type: "integer", minimum: 1, maximum: 2_147_483_647 } }), (input) => service.runSimulation(input, agent)),
    analyze("compare_scenarios", "Compare scenarios", "Run the same deterministic simulation across selected immutable scenarios.", objectSchema({ scenarioIds: { type: "array", maxItems: 20, items: id } }), (input) => service.compareScenarios(Array.isArray(input.scenarioIds) ? input.scenarioIds.filter((value): value is string => typeof value === "string") : undefined)),
    analyze("calculate_feasibility", "Calculate feasibility", "Return a real 0-100 probability, explanation, positive factors, failure sources, and structured recommendations.", emptySchema, () => service.calculateFeasibility()),

    action("high-level", "apply_plan", "Apply plan", "Apply up to 25 explicit structured operations using the same validated application services as the UI.", objectSchema({ operations: { type: "array", minItems: 1, maxItems: 25, items: { type: "object", additionalProperties: false, properties: { type: { type: "string", enum: ["create_task", "update_task", "create_dependency", "complete_task", "resolve_risk", "update_workspace"] }, input: { type: "object" } }, required: ["type", "input"] } } }, ["operations"]), (input) => service.applyPlan(parseOperations(input.operations), agent)),
    action("high-level", "optimize_plan", "Optimize plan", "Apply transparent deterministic scope and uncertainty reductions toward a target probability; no AI reasoning is fabricated.", objectSchema({ targetProbability: number(50, 99), preserveTaskIds: { type: "array", maxItems: 100, items: id } }), (input) => service.optimizePlan(input, agent)),
    action("high-level", "replan_remaining_work", "Replan remaining work", "Topologically reorder and lay out remaining work, then recalculate the critical path.", emptySchema, () => service.replanRemainingWork(agent)),
    action("high-level", "rollback_last_agent_action", "Rollback last agent action", "Restore the snapshot immediately before the most recent agent mutation.", emptySchema, () => service.rollbackLastAgentAction()),

    action("modify", "remove_low_priority_task", "Remove low-priority task", "Safely remove a specified noncritical task or the largest remaining low-priority task and its dependencies.", objectSchema({ taskId: id }), (input) => service.removeLowPriorityTask(input, agent)),
    action("scenario", "apply_scenario", "Apply scenario", "Replace the live plan with an immutable scenario snapshot without deleting scenario history.", objectSchema({ scenarioId: id }, ["scenarioId"]), (input) => service.applyScenario(parseId(input, "scenarioId"), agent)),
    action("scenario", "discard_scenario", "Discard scenario", "Delete a scenario snapshot without changing the current plan.", objectSchema({ scenarioId: id }, ["scenarioId"]), (input) => service.discardScenario(parseId(input, "scenarioId"), agent)),
  ];
}

export async function registerThreadTools(service: WorkspaceService): Promise<RegistrationReport> {
  const tools = buildThreadTools(service);
  const modelContext = document.modelContext;
  const controller = new AbortController();
  const report: RegistrationReport = {
    supported: Boolean(modelContext), attempted: tools.length, registered: [], errors: [], nativeTools: [], dispose: () => controller.abort(),
  };
  if (!modelContext) return report;
  for (const tool of tools) {
    try {
      const { category: _, ...definition } = tool;
      await modelContext.registerTool(definition, { signal: controller.signal });
      report.registered.push(tool.name);
    } catch (error) {
      report.errors.push({ name: tool.name, message: error instanceof Error ? error.message : String(error) });
    }
  }
  try {
    report.nativeTools = (await modelContext.getTools()).map((tool) => tool.name);
  } catch (error) {
    report.errors.push({ name: "getTools", message: error instanceof Error ? error.message : String(error) });
  }
  return report;
}

export async function executeThreadTool(service: WorkspaceService, name: string, input: Record<string, unknown> = {}): Promise<WebMCPToolResult> {
  const tool = buildThreadTools(service).find((candidate) => candidate.name === name);
  if (!tool) return { isError: true, content: [{ type: "text", text: `Unknown THREAD tool: ${name}` }] };
  try {
    return await tool.execute(input);
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] };
  }
}

function wrap(execute: (input: Record<string, unknown>) => unknown | Promise<unknown>): (input: Record<string, unknown>) => Promise<WebMCPToolResult> {
  return async (input) => {
    const result = await execute(input ?? {});
    return { content: [{ type: "text", text: compact(result) }], structuredContent: result };
  };
}

function compact(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized.length > 4_000 ? `${serialized.slice(0, 3_950)}...` : serialized;
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: "object", additionalProperties: false, properties, ...(required.length ? { required } : {}) };
}

function parseId(input: Record<string, unknown>, key: string): string {
  return z.string().uuid().parse(input[key]);
}

function parseOperations(value: unknown): PlanOperation[] {
  return z.array(z.object({ type: z.enum(["create_task", "update_task", "create_dependency", "complete_task", "resolve_risk", "update_workspace"]), input: z.record(z.string(), z.unknown()) }).strict()).min(1).max(25).parse(value);
}

export const THREAD_TOOL_COUNT = 38;
