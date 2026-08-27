import { z } from "zod";
import { calculateCriticalPath, topologicalSort } from "../engine/criticalPath";
import { detectConflicts } from "../engine/conflicts";
import { calculateFeasibility, findBottlenecks } from "../engine/feasibility";
import { runSimulation as simulate } from "../engine/simulation";
import type { WorkspaceRepository } from "../persistence/repository";
import {
  constraintSchema,
  createTaskInputSchema,
  dependencySchema,
  formatValidationError,
  resourceSchema,
  riskSchema,
  simulationInputSchema,
  taskPrioritySchema,
  taskSchema,
  updateTaskInputSchema,
  workspaceSchema,
  workspaceStateSchema,
} from "./schemas";
import { createDemoWorkspace } from "./seed";
import type {
  Actor,
  Constraint,
  Dependency,
  MutationMeta,
  PlanOperation,
  PlanSnapshot,
  Resource,
  Risk,
  Scenario,
  SimulationResult,
  Task,
  TaskPriority,
  WorkspaceState,
} from "./types";

export class ApplicationError extends Error {
  constructor(message: string, readonly code: "not-ready" | "not-found" | "conflict" | "validation" | "persistence") {
    super(message);
    this.name = "ApplicationError";
  }
}

type Listener = (state: WorkspaceState | null) => void;

export class WorkspaceService {
  private state: WorkspaceState | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly agentHistory: WorkspaceState[] = [];
  private readonly idempotency = new Map<string, unknown>();
  private agentBusy = false;
  private highlightedTaskId: string | null = null;

  constructor(private readonly repository: WorkspaceRepository, readonly workspaceId: string) {}

  async initialize(): Promise<WorkspaceState | null> {
    this.state = await this.repository.load(this.workspaceId);
    this.emit();
    return this.getState();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): WorkspaceState | null {
    return this.state ? structuredClone(this.state) : null;
  }

  getAgentStatus(): { busy: boolean; highlightedTaskId: string | null } {
    return { busy: this.agentBusy, highlightedTaskId: this.highlightedTaskId };
  }

  getWorkspace() { return this.requireState().workspace; }
  getGoal() {
    const state = this.requireState();
    return { objective: state.workspace.objective, deadline: state.workspace.deadline, availableHours: state.workspace.availableHours, budget: state.workspace.budget };
  }
  getTasks() { return this.requireState().tasks; }
  getTask(taskId: string) { return this.findTask(this.requireState(), taskId); }
  getConstraints() { return this.requireState().constraints; }
  getDependencies() { return this.requireState().dependencies; }
  getResources() { return this.requireState().resources; }
  getRisks() { return this.requireState().risks; }
  getActivity(limit = 50) { return this.requireState().activity.slice(-Math.min(200, Math.max(1, limit))).reverse(); }
  getCriticalPath() { const state = this.requireState(); return calculateCriticalPath(state.tasks, state.dependencies); }
  getTimeline() {
    const state = this.requireState();
    const critical = calculateCriticalPath(state.tasks, state.dependencies);
    return state.tasks.map((task) => ({ title: task.title, status: task.status, ...(critical.timings[task.id] ?? { taskId: task.id, earliestStart: 0, earliestFinish: 0, latestStart: 0, latestFinish: 0, slack: 0, critical: false }) })).sort((a, b) => a.earliestStart - b.earliestStart);
  }
  getSimulationSummary() { return this.requireState().lastSimulation; }
  detectConflicts() { return detectConflicts(this.requireState()); }
  findBottlenecks() { return findBottlenecks(this.requireState()); }
  calculateFeasibility() { const state = this.requireState(); return calculateFeasibility(state, state.lastSimulation ?? undefined); }

  async resetDemo(meta: MutationMeta = { actor: "human" }): Promise<WorkspaceState> {
    const previous = this.state;
    const next = createDemoWorkspace(this.workspaceId);
    next.activity.push(this.activity(next, meta.actor, "demo.reset", `${label(meta.actor)} reset the hackathon demo`, {}));
    const result = await this.repository.save(next);
    next.storageMode = result.mode;
    if (previous && meta.actor === "agent") this.rememberAgentState(previous);
    this.state = next;
    this.emit();
    return this.getState()!;
  }

  async updateWorkspace(input: unknown, meta: MutationMeta): Promise<WorkspaceState["workspace"]> {
    const parsed = workspaceSchema.pick({ name: true, objective: true, description: true, deadline: true, availableHours: true, budget: true }).partial().strict().safeParse(input);
    if (!parsed.success) throw this.validation(parsed.error);
    return this.commit((state) => {
      const before = structuredClone(state.workspace);
      Object.assign(state.workspace, parsed.data);
      return { result: state.workspace, message: `${label(meta.actor)} updated workspace limits`, type: "workspace.updated", payload: { before, after: state.workspace } };
    }, meta);
  }

  async createTask(input: unknown, meta: MutationMeta): Promise<Task> {
    if (meta.idempotencyKey && this.idempotency.has(meta.idempotencyKey)) return structuredClone(this.idempotency.get(meta.idempotencyKey) as Task);
    const parsed = createTaskInputSchema.safeParse(input);
    if (!parsed.success) throw this.validation(parsed.error);
    const state = this.requireState();
    if (parsed.data.id) {
      const existing = state.tasks.find((task) => task.id === parsed.data.id);
      if (existing) return existing;
    }
    const now = new Date().toISOString();
    const estimate = parsed.data.kind === "milestone" ? 0 : parsed.data.estimatedHours;
    const task = taskSchema.parse({
      ...parsed.data,
      id: parsed.data.id ?? crypto.randomUUID(),
      workspaceId: state.workspace.id,
      estimatedHours: estimate,
      minimumHours: parsed.data.kind === "milestone" ? 0 : (parsed.data.minimumHours ?? Math.max(0, estimate * 0.7)),
      maximumHours: parsed.data.kind === "milestone" ? 0 : (parsed.data.maximumHours ?? estimate * 1.4),
      createdAt: now,
      updatedAt: now,
    });
    const created = await this.commit((draft) => {
      draft.tasks.push(task);
      return { result: task, message: `${label(meta.actor)} created "${task.title}"`, type: `${task.kind}.created`, payload: { taskId: task.id } };
    }, meta, task.id);
    if (meta.idempotencyKey) this.idempotency.set(meta.idempotencyKey, created);
    return created;
  }

  async createMilestone(input: unknown, meta: MutationMeta): Promise<Task> {
    const value = typeof input === "object" && input ? { ...input, kind: "milestone", estimatedHours: 0, minimumHours: 0, maximumHours: 0 } : input;
    return this.createTask(value, meta);
  }

  async updateTask(input: unknown, meta: MutationMeta): Promise<Task> {
    const parsed = updateTaskInputSchema.safeParse(input);
    if (!parsed.success) throw this.validation(parsed.error);
    return this.commit((state) => {
      const task = this.findTask(state, parsed.data.taskId);
      const before = structuredClone(task);
      Object.assign(task, parsed.data, { updatedAt: new Date().toISOString() });
      if (parsed.data.estimatedHours !== undefined) {
        if (parsed.data.minimumHours === undefined) task.minimumHours = Math.min(task.minimumHours, parsed.data.estimatedHours);
        if (parsed.data.maximumHours === undefined) task.maximumHours = Math.max(task.maximumHours, parsed.data.estimatedHours);
      }
      taskSchema.parse(task);
      return { result: task, message: `${label(meta.actor)} updated "${task.title}"`, type: "task.updated", payload: { taskId: task.id, before, after: task } };
    }, meta, parsed.data.taskId);
  }

  async moveTask(input: unknown, meta: MutationMeta): Promise<Task> {
    const parsed = z.object({ taskId: z.string().uuid(), x: z.number().finite(), y: z.number().finite() }).strict().safeParse(input);
    if (!parsed.success) throw this.validation(parsed.error);
    return this.commit((state) => {
      const task = this.findTask(state, parsed.data.taskId);
      const before = { x: task.x, y: task.y };
      task.x = parsed.data.x;
      task.y = parsed.data.y;
      task.updatedAt = new Date().toISOString();
      return { result: task, message: `${label(meta.actor)} moved "${task.title}"`, type: "task.moved", payload: { taskId: task.id, before, after: { x: task.x, y: task.y } } };
    }, meta, parsed.data.taskId);
  }

  async prioritizeTask(input: unknown, meta: MutationMeta): Promise<Task> {
    const parsed = z.object({ taskId: z.string().uuid(), priority: taskPrioritySchema }).strict().safeParse(input);
    if (!parsed.success) throw this.validation(parsed.error);
    return this.updateTask(parsed.data, meta);
  }

  async completeTask(input: unknown, meta: MutationMeta): Promise<Task> {
    const parsed = z.object({ taskId: z.string().uuid() }).strict().safeParse(input);
    if (!parsed.success) throw this.validation(parsed.error);
    return this.updateTask({ taskId: parsed.data.taskId, status: "done" }, meta);
  }

  async deleteTask(taskId: string, meta: MutationMeta): Promise<{ deletedTaskId: string; deletedDependencyIds: string[] }> {
    z.string().uuid().parse(taskId);
    return this.commit((state) => {
      const task = this.findTask(state, taskId);
      const deletedDependencyIds = state.dependencies.filter((dependency) => dependency.fromTaskId === taskId || dependency.toTaskId === taskId).map((dependency) => dependency.id);
      state.tasks = state.tasks.filter((candidate) => candidate.id !== taskId);
      state.dependencies = state.dependencies.filter((dependency) => !deletedDependencyIds.includes(dependency.id));
      state.risks = state.risks.map((risk) => risk.taskId === taskId ? { ...risk, taskId: null } : risk);
      return { result: { deletedTaskId: taskId, deletedDependencyIds }, message: `${label(meta.actor)} removed "${task.title}"`, type: "task.deleted", payload: { taskId, deletedDependencyIds } };
    }, meta, taskId);
  }

  async createDependency(input: unknown, meta: MutationMeta): Promise<Dependency> {
    const parsed = z.object({ id: z.string().uuid().optional(), fromTaskId: z.string().uuid(), toTaskId: z.string().uuid() }).strict().safeParse(input);
    if (!parsed.success) throw this.validation(parsed.error);
    if (parsed.data.fromTaskId === parsed.data.toTaskId) throw new ApplicationError("A task cannot depend on itself", "conflict");
    const current = this.requireState();
    const duplicate = current.dependencies.find((dependency) => dependency.fromTaskId === parsed.data.fromTaskId && dependency.toTaskId === parsed.data.toTaskId);
    if (duplicate) return duplicate;
    this.findTask(current, parsed.data.fromTaskId);
    this.findTask(current, parsed.data.toTaskId);
    const dependency = dependencySchema.parse({ ...parsed.data, id: parsed.data.id ?? crypto.randomUUID(), workspaceId: current.workspace.id });
    return this.commit((state) => {
      const nextDependencies = [...state.dependencies, dependency];
      try { topologicalSort(state.tasks, nextDependencies); } catch { throw new ApplicationError("Dependency would create a cycle", "conflict"); }
      state.dependencies = nextDependencies;
      const from = this.findTask(state, dependency.fromTaskId);
      const to = this.findTask(state, dependency.toTaskId);
      return { result: dependency, message: `${label(meta.actor)} connected "${from.title}" to "${to.title}"`, type: "dependency.created", payload: { dependencyId: dependency.id, fromTaskId: from.id, toTaskId: to.id } };
    }, meta, parsed.data.toTaskId);
  }

  async deleteDependency(dependencyId: string, meta: MutationMeta): Promise<{ deletedDependencyId: string }> {
    return this.commit((state) => {
      const dependency = state.dependencies.find((candidate) => candidate.id === dependencyId);
      if (!dependency) throw new ApplicationError(`Unknown dependency: ${dependencyId}`, "not-found");
      state.dependencies = state.dependencies.filter((candidate) => candidate.id !== dependencyId);
      return { result: { deletedDependencyId: dependencyId }, message: `${label(meta.actor)} removed a dependency`, type: "dependency.deleted", payload: { dependencyId } };
    }, meta);
  }

  async createConstraint(input: unknown, meta: MutationMeta): Promise<Constraint> {
    const parsed = constraintSchema.omit({ id: true, workspaceId: true }).strict().safeParse(input);
    if (!parsed.success) throw this.validation(parsed.error);
    const constraint = constraintSchema.parse({ ...parsed.data, id: crypto.randomUUID(), workspaceId: this.workspaceId });
    return this.commit((state) => { state.constraints.push(constraint); return { result: constraint, message: `${label(meta.actor)} added constraint "${constraint.title}"`, type: "constraint.created", payload: { constraintId: constraint.id } }; }, meta);
  }

  async updateConstraint(input: unknown, meta: MutationMeta): Promise<Constraint> {
    const parsed = constraintSchema.omit({ id: true, workspaceId: true }).partial().extend({ constraintId: z.string().uuid() }).strict().safeParse(input);
    if (!parsed.success) throw this.validation(parsed.error);
    return this.commit((state) => {
      const constraint = state.constraints.find((candidate) => candidate.id === parsed.data.constraintId);
      if (!constraint) throw new ApplicationError(`Unknown constraint: ${parsed.data.constraintId}`, "not-found");
      const before = structuredClone(constraint);
      const { constraintId: _, ...updates } = parsed.data;
      Object.assign(constraint, updates);
      constraintSchema.parse(constraint);
      return { result: constraint, message: `${label(meta.actor)} updated "${constraint.title}"`, type: "constraint.updated", payload: { constraintId: constraint.id, before, after: constraint } };
    }, meta);
  }

  async createResource(input: unknown, meta: MutationMeta): Promise<Resource> {
    const parsed = resourceSchema.omit({ id: true, workspaceId: true }).strict().safeParse(input);
    if (!parsed.success) throw this.validation(parsed.error);
    const resource = resourceSchema.parse({ ...parsed.data, id: crypto.randomUUID(), workspaceId: this.workspaceId });
    return this.commit((state) => { state.resources.push(resource); return { result: resource, message: `${label(meta.actor)} added resource "${resource.name}"`, type: "resource.created", payload: { resourceId: resource.id } }; }, meta);
  }

  async updateResource(input: unknown, meta: MutationMeta): Promise<Resource> {
    const parsed = resourceSchema.omit({ id: true, workspaceId: true }).partial().extend({ resourceId: z.string().uuid() }).strict().safeParse(input);
    if (!parsed.success) throw this.validation(parsed.error);
    return this.commit((state) => {
      const resource = state.resources.find((candidate) => candidate.id === parsed.data.resourceId);
      if (!resource) throw new ApplicationError(`Unknown resource: ${parsed.data.resourceId}`, "not-found");
      const before = structuredClone(resource);
      const { resourceId: _, ...updates } = parsed.data;
      Object.assign(resource, updates);
      resourceSchema.parse(resource);
      return { result: resource, message: `${label(meta.actor)} updated "${resource.name}"`, type: "resource.updated", payload: { resourceId: resource.id, before, after: resource } };
    }, meta);
  }

  async createRisk(input: unknown, meta: MutationMeta): Promise<Risk> {
    const parsed = riskSchema.omit({ id: true, workspaceId: true, resolved: true }).extend({ resolved: z.boolean().optional() }).strict().safeParse(input);
    if (!parsed.success) throw this.validation(parsed.error);
    if (parsed.data.taskId) this.findTask(this.requireState(), parsed.data.taskId);
    const risk = riskSchema.parse({ ...parsed.data, id: crypto.randomUUID(), workspaceId: this.workspaceId, resolved: parsed.data.resolved ?? false });
    return this.commit((state) => { state.risks.push(risk); return { result: risk, message: `${label(meta.actor)} added risk "${risk.title}"`, type: "risk.created", payload: { riskId: risk.id, taskId: risk.taskId } }; }, meta, risk.taskId ?? undefined);
  }

  async updateRisk(input: unknown, meta: MutationMeta): Promise<Risk> {
    const parsed = riskSchema.omit({ id: true, workspaceId: true }).partial().extend({ riskId: z.string().uuid() }).strict().safeParse(input);
    if (!parsed.success) throw this.validation(parsed.error);
    return this.commit((state) => {
      const risk = state.risks.find((candidate) => candidate.id === parsed.data.riskId);
      if (!risk) throw new ApplicationError(`Unknown risk: ${parsed.data.riskId}`, "not-found");
      if (parsed.data.taskId) this.findTask(state, parsed.data.taskId);
      const before = structuredClone(risk);
      const { riskId: _, ...updates } = parsed.data;
      Object.assign(risk, updates);
      riskSchema.parse(risk);
      return { result: risk, message: `${label(meta.actor)} updated "${risk.title}"`, type: "risk.updated", payload: { riskId: risk.id, before, after: risk } };
    }, meta, this.requireState().risks.find((risk) => risk.id === parsed.data.riskId)?.taskId ?? undefined);
  }

  async resolveRisk(input: unknown, meta: MutationMeta): Promise<Risk> {
    const parsed = z.object({ riskId: z.string().uuid(), mitigation: z.string().max(1_000).optional() }).strict().safeParse(input);
    if (!parsed.success) throw this.validation(parsed.error);
    return this.commit((state) => {
      const risk = state.risks.find((candidate) => candidate.id === parsed.data.riskId);
      if (!risk) throw new ApplicationError(`Unknown risk: ${parsed.data.riskId}`, "not-found");
      risk.resolved = true;
      if (parsed.data.mitigation) risk.mitigation = parsed.data.mitigation;
      return { result: risk, message: `${label(meta.actor)} resolved "${risk.title}"`, type: "risk.resolved", payload: { riskId: risk.id } };
    }, meta, this.requireState().risks.find((risk) => risk.id === parsed.data.riskId)?.taskId ?? undefined);
  }

  async createScenario(input: unknown, meta: MutationMeta): Promise<Scenario> {
    const parsed = z.object({ name: z.string().trim().min(1).max(100), description: z.string().max(1_000).default("") }).strict().safeParse(input);
    if (!parsed.success) throw this.validation(parsed.error);
    return this.commit((state) => {
      const scenario: Scenario = { id: crypto.randomUUID(), workspaceId: state.workspace.id, name: parsed.data.name, description: parsed.data.description, snapshot: this.toPlan(state), createdAt: new Date().toISOString() };
      state.scenarios.push(scenario);
      return { result: scenario, message: `${label(meta.actor)} created scenario "${scenario.name}"`, type: "scenario.created", payload: { scenarioId: scenario.id } };
    }, meta);
  }

  async applyScenario(scenarioId: string, meta: MutationMeta): Promise<WorkspaceState> {
    return this.commit((state) => {
      const scenario = state.scenarios.find((candidate) => candidate.id === scenarioId);
      if (!scenario) throw new ApplicationError(`Unknown scenario: ${scenarioId}`, "not-found");
      const preservedScenarios = state.scenarios;
      const preservedActivity = state.activity;
      Object.assign(state, structuredClone(scenario.snapshot), { scenarios: preservedScenarios, activity: preservedActivity, lastSimulation: null, storageMode: state.storageMode });
      state.workspace.id = this.workspaceId;
      state.workspace.updatedAt = new Date().toISOString();
      for (const collection of [state.tasks, state.dependencies, state.constraints, state.resources, state.risks]) {
        for (const item of collection) item.workspaceId = this.workspaceId;
      }
      return { result: state, message: `${label(meta.actor)} applied scenario "${scenario.name}"`, type: "scenario.applied", payload: { scenarioId } };
    }, meta);
  }

  async discardScenario(scenarioId: string, meta: MutationMeta): Promise<{ discardedScenarioId: string }> {
    return this.commit((state) => {
      const scenario = state.scenarios.find((candidate) => candidate.id === scenarioId);
      if (!scenario) throw new ApplicationError(`Unknown scenario: ${scenarioId}`, "not-found");
      state.scenarios = state.scenarios.filter((candidate) => candidate.id !== scenarioId);
      return { result: { discardedScenarioId: scenarioId }, message: `${label(meta.actor)} discarded scenario "${scenario.name}"`, type: "scenario.discarded", payload: { scenarioId } };
    }, meta);
  }

  async compareScenarios(scenarioIds?: string[]) {
    const state = this.requireState();
    const selected = scenarioIds?.length ? state.scenarios.filter((scenario) => scenarioIds.includes(scenario.id)) : state.scenarios;
    if (scenarioIds?.some((scenarioId) => !selected.some((scenario) => scenario.id === scenarioId))) throw new ApplicationError("One or more scenario IDs are unknown", "not-found");
    return selected.map((scenario) => ({ scenarioId: scenario.id, name: scenario.name, simulation: simulate(scenario.snapshot, { iterations: 750 }), feasibility: calculateFeasibility(scenario.snapshot) }));
  }

  async runSimulation(input: unknown, meta: MutationMeta): Promise<SimulationResult> {
    const parsed = simulationInputSchema.safeParse(input);
    if (!parsed.success) throw this.validation(parsed.error);
    const state = this.requireState();
    const plan = parsed.data.scenarioId ? state.scenarios.find((scenario) => scenario.id === parsed.data.scenarioId)?.snapshot : this.toPlan(state);
    if (!plan) throw new ApplicationError(`Unknown scenario: ${parsed.data.scenarioId}`, "not-found");
    const result = simulate(plan, parsed.data);
    if (parsed.data.scenarioId) return result;
    return this.commit((draft) => {
      draft.lastSimulation = result;
      return { result, message: `${label(meta.actor)} ran ${result.iterations.toLocaleString()} simulations: ${result.onTimeProbability}% on time`, type: "simulation.completed", payload: { probability: result.onTimeProbability, iterations: result.iterations, seed: result.seed } };
    }, meta, undefined, true);
  }

  async applyPlan(operations: PlanOperation[], meta: MutationMeta): Promise<{ applied: number; state: WorkspaceState }> {
    if (!Array.isArray(operations) || operations.length === 0 || operations.length > 25) throw new ApplicationError("Plan must contain 1 to 25 operations", "validation");
    let applied = 0;
    for (const operation of operations) {
      switch (operation.type) {
        case "create_task": await this.createTask(operation.input, meta); break;
        case "update_task": await this.updateTask(operation.input, meta); break;
        case "create_dependency": await this.createDependency(operation.input, meta); break;
        case "complete_task": await this.completeTask(operation.input, meta); break;
        case "resolve_risk": await this.resolveRisk(operation.input, meta); break;
        case "update_workspace": await this.updateWorkspace(operation.input, meta); break;
        default: throw new ApplicationError(`Unsupported plan operation`, "validation");
      }
      applied += 1;
    }
    return { applied, state: this.getState()! };
  }

  async optimizePlan(input: unknown, meta: MutationMeta): Promise<{ changes: string[]; feasibility: ReturnType<typeof calculateFeasibility> }> {
    const parsed = z.object({ targetProbability: z.number().min(50).max(99).default(90), preserveTaskIds: z.array(z.string().uuid()).default([]) }).strict().safeParse(input);
    if (!parsed.success) throw this.validation(parsed.error);
    const before = this.calculateFeasibility().percentage;
    const changes: string[] = [];
    await this.commit((state) => {
      const candidates = findBottlenecks(state).filter((item) => !parsed.data.preserveTaskIds.includes(item.taskId));
      for (const candidate of candidates.slice(0, 4)) {
        const task = this.findTask(state, candidate.taskId);
        const oldEstimate = task.estimatedHours;
        task.estimatedHours = round(Math.max(task.minimumHours, task.estimatedHours * 0.78));
        task.maximumHours = round(Math.max(task.estimatedHours, task.maximumHours * 0.7));
        task.confidence = Math.min(0.92, round(task.confidence + 0.2));
        task.updatedAt = new Date().toISOString();
        changes.push(`${task.title}: ${oldEstimate}h to ${task.estimatedHours}h, uncertainty reduced`);
      }
      for (const risk of state.risks.filter((candidate) => !candidate.resolved).slice(0, 2)) {
        risk.probability = round(risk.probability * 0.55);
        changes.push(`${risk.title}: mitigation lowered probability`);
      }
      return { result: undefined, message: `${label(meta.actor)} optimized ${changes.length} plan variables`, type: "plan.optimized", payload: { changes, targetProbability: parsed.data.targetProbability } };
    }, meta);
    const simulation = await this.runSimulation({ iterations: 1_500 }, meta);
    const feasibility = calculateFeasibility(this.requireState(), simulation);
    this.requireState().activity.at(-1)!.payload = { ...this.requireState().activity.at(-1)!.payload, before, after: feasibility.percentage };
    return { changes, feasibility };
  }

  async replanRemainingWork(meta: MutationMeta): Promise<{ reorderedTaskIds: string[]; criticalPath: ReturnType<typeof calculateCriticalPath> }> {
    return this.commit((state) => {
      const order = topologicalSort(state.tasks, state.dependencies);
      const level = new Map<string, number>();
      for (const taskId of order) {
        const predecessors = state.dependencies.filter((dependency) => dependency.toTaskId === taskId).map((dependency) => dependency.fromTaskId);
        level.set(taskId, predecessors.length ? Math.max(...predecessors.map((id) => level.get(id) ?? 0)) + 1 : 0);
      }
      const rows = new Map<number, number>();
      for (const taskId of order) {
        const task = this.findTask(state, taskId);
        const column = level.get(taskId) ?? 0;
        const row = rows.get(column) ?? 0;
        task.x = 80 + column * 260;
        task.y = 70 + row * 180;
        task.updatedAt = new Date().toISOString();
        rows.set(column, row + 1);
      }
      const criticalPath = calculateCriticalPath(state.tasks, state.dependencies);
      return { result: { reorderedTaskIds: order, criticalPath }, message: `${label(meta.actor)} replanned and laid out ${order.length} tasks`, type: "plan.replanned", payload: { criticalPath: criticalPath.taskIds, duration: criticalPath.totalDuration } };
    }, meta);
  }

  async removeLowPriorityTask(input: unknown, meta: MutationMeta) {
    const parsed = z.object({ taskId: z.string().uuid().optional() }).strict().safeParse(input);
    if (!parsed.success) throw this.validation(parsed.error);
    const state = this.requireState();
    const candidate = parsed.data.taskId
      ? this.findTask(state, parsed.data.taskId)
      : state.tasks.filter((task) => task.priority === "low" && task.status !== "done").sort((a, b) => b.estimatedHours - a.estimatedHours)[0];
    if (!candidate) throw new ApplicationError("No removable low-priority task found", "not-found");
    if (candidate.priority === "critical") throw new ApplicationError("Critical tasks cannot be removed by this operation", "conflict");
    return this.deleteTask(candidate.id, meta);
  }

  async rollbackLastAgentAction(): Promise<WorkspaceState> {
    const previous = this.agentHistory.pop();
    if (!previous) throw new ApplicationError("No agent mutation is available to roll back", "not-found");
    const next = structuredClone(previous);
    next.activity.push(this.activity(next, "agent", "agent.rollback", "Agent rolled back its last mutation", {}));
    next.workspace.updatedAt = new Date().toISOString();
    const result = await this.repository.save(next);
    next.storageMode = result.mode;
    this.state = next;
    this.emit();
    return this.getState()!;
  }

  private async commit<T>(
    mutate: (draft: WorkspaceState) => { result: T; message: string; type: string; payload: Record<string, unknown> },
    meta: MutationMeta,
    highlightedTaskId?: string,
    keepSimulation = false,
  ): Promise<T> {
    const current = this.requireState();
    const draft = structuredClone(current);
    if (meta.actor === "agent") {
      this.agentBusy = true;
      this.highlightedTaskId = highlightedTaskId ?? null;
      this.emit();
    }
    try {
      const outcome = mutate(draft);
      draft.workspace.updatedAt = new Date().toISOString();
      if (!keepSimulation && outcome.type !== "simulation.completed") draft.lastSimulation = null;
      draft.activity.push(this.activity(draft, meta.actor, outcome.type, outcome.message, outcome.payload));
      if (draft.activity.length > 500) draft.activity = draft.activity.slice(-500);
      workspaceStateSchema.parse(draft);
      const saveResult = await this.repository.save(draft);
      draft.storageMode = saveResult.mode;
      if (saveResult.warning) draft.activity.push(this.activity(draft, "system", "persistence.fallback", "D1 unavailable; changes saved in this browser", { warning: saveResult.warning }));
      if (meta.actor === "agent") this.rememberAgentState(current);
      this.state = draft;
      this.emit();
      return structuredClone(outcome.result);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      if (error instanceof z.ZodError) throw this.validation(error);
      throw error;
    } finally {
      if (meta.actor === "agent") {
        this.agentBusy = false;
        globalThis.setTimeout(() => { this.highlightedTaskId = null; this.emit(); }, 850);
        this.emit();
      }
    }
  }

  private requireState(): WorkspaceState {
    if (!this.state) throw new ApplicationError("Load or reset a workspace first", "not-ready");
    return this.state;
  }

  private findTask(state: WorkspaceState, taskId: string): Task {
    const task = state.tasks.find((candidate) => candidate.id === taskId);
    if (!task) throw new ApplicationError(`Unknown task: ${taskId}`, "not-found");
    return task;
  }

  private toPlan(state: WorkspaceState): PlanSnapshot {
    return structuredClone({ workspace: state.workspace, tasks: state.tasks, dependencies: state.dependencies, constraints: state.constraints, resources: state.resources, risks: state.risks });
  }

  private activity(state: WorkspaceState, actor: Actor, type: string, message: string, payload: Record<string, unknown>) {
    return { id: crypto.randomUUID(), workspaceId: state.workspace.id, actor, type, message, payload, createdAt: new Date().toISOString() } as const;
  }

  private rememberAgentState(state: WorkspaceState): void {
    this.agentHistory.push(structuredClone(state));
    if (this.agentHistory.length > 25) this.agentHistory.shift();
  }

  private validation(error: z.ZodError): ApplicationError {
    return new ApplicationError(formatValidationError(error), "validation");
  }

  private emit(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }
}

function label(actor: Actor): string {
  return actor === "agent" ? "Agent" : actor === "human" ? "You" : "THREAD";
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function priorityRank(priority: TaskPriority): number {
  return { low: 0, medium: 1, high: 2, critical: 3 }[priority];
}
