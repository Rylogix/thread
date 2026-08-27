import { z } from "zod";
import { createTaskInputSchema, dependencySchema, planSnapshotSchema, riskSchema, taskSchema, workspaceSchema } from "../domain/schemas";
import type {
  DecisionPolicy,
  PlanOperation,
  PlanProposal,
  PlanSnapshot,
  ProposalConstraintCheck,
  ProposalDiff,
  ProposalEvidence,
  ProposalMode,
  ProposalOperation,
  Task,
  TaskFieldChange,
} from "../domain/types";
import { calculateCriticalPath, topologicalSort } from "./criticalPath";
import { findBottlenecks } from "./feasibility";
import { validatePlanInvariants } from "./invariants";
import { DEFAULT_SIMULATION_SEED, runSimulation } from "./simulation";

const taskChangeFields: TaskFieldChange["field"][] = ["title", "estimatedHours", "minimumHours", "maximumHours", "confidence", "priority", "status", "cost"];

export interface GenerateProposalOptions {
  proposalId?: string;
  name?: string;
  seed?: number;
  iterations?: number;
  createdAt?: string;
  createdBy?: "human" | "agent" | "system";
  idempotencyKey?: string;
  requestFingerprint?: string;
  revision?: number;
}

export function generatePlanProposal(
  base: PlanSnapshot,
  policy: DecisionPolicy,
  mode: ProposalMode,
  basePlanRevision: number,
  options: GenerateProposalOptions = {},
): PlanProposal {
  const seed = options.seed ?? DEFAULT_SIMULATION_SEED;
  const iterations = Math.min(5_000, Math.max(250, Math.floor(options.iterations ?? 1_000)));
  const createdAt = options.createdAt ?? new Date().toISOString();
  const operations = buildOperations(base, policy, mode, createdAt);
  const proposedPlan = applyOperationsToPlan(base, operations, createdAt);
  const invariantErrors = validatePlanInvariants(proposedPlan);
  if (invariantErrors.length) throw new Error(invariantErrors.join("; "));
  const before = collectEvidence(base, seed, iterations, createdAt);
  const after = collectEvidence(proposedPlan, seed, iterations, createdAt);
  const diff = diffPlans(base, proposedPlan);
  const names: Record<ProposalMode, string> = {
    safest: "Safest plan",
    fastest: "Fastest plan",
    "highest-impact": "Highest-impact plan",
  };
  const rationale: Record<ProposalMode, string> = {
    safest: "Reduce uncertainty on the largest bottlenecks and mitigate dominant risks while preserving every task.",
    fastest: "Compress the critical path and remove the least-prioritized unprotected work to maximize schedule margin.",
    "highest-impact": "Use a small amount of remaining budget on critical work, preserve scope, and reduce the variance that most affects delivery.",
  };
  const tradeoffs: Record<ProposalMode, string[]> = {
    safest: ["Requires disciplined risk mitigation and earlier validation work.", "Keeps all scope, so the critical path remains broader."],
    fastest: [diff.removedTasks.length ? `Removes ${diff.removedTasks.map((task) => task.title).join(", ")}.` : "Aggressively compresses estimates.", "Optimizes for deadline margin over documentation and polish."],
    "highest-impact": [`Uses $${round(after.remainingCost - before.remainingCost)} of budget headroom.`, "Assumes targeted spending converts into focused delivery support."],
  };
  const proposal: PlanProposal = {
    id: options.proposalId ?? crypto.randomUUID(),
    workspaceId: base.workspace.id,
    name: options.name ?? names[mode],
    mode,
    status: "ready",
    revision: options.revision ?? 1,
    rationale: rationale[mode],
    operations,
    proposedPlan,
    before,
    after,
    diff,
    constraintChecks: evaluateProposalConstraints(base, proposedPlan, policy, after),
    expectedUpside: [
      `${formatDelta(before.simulation.onTimeProbability, after.simulation.onTimeProbability)} finish probability`,
      `${formatDelta(before.simulation.p80CompletionHours, after.simulation.p80CompletionHours, true)} P80 schedule`,
      `${after.criticalPath.totalDuration}h proposed critical path`,
    ],
    tradeoffs: tradeoffs[mode],
    basePlanRevision,
    simulationSeed: seed,
    simulationIterations: iterations,
    ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
    ...(options.requestFingerprint ? { requestFingerprint: options.requestFingerprint } : {}),
    createdBy: options.createdBy ?? "agent",
    createdAt,
    updatedAt: createdAt,
  };
  return proposal;
}

export function applyOperationsToPlan(base: PlanSnapshot, operations: Array<PlanOperation | ProposalOperation>, updatedAt = new Date().toISOString()): PlanSnapshot {
  const draft = structuredClone(base);
  for (const operation of operations) applyOperation(draft, operation, updatedAt);
  topologicalSort(draft.tasks, draft.dependencies);
  const errors = validatePlanInvariants(draft);
  if (errors.length) throw new Error(errors.join("; "));
  return planSnapshotSchema.parse(draft);
}

export function collectEvidence(plan: PlanSnapshot, seed: number, iterations: number, calculatedAt: string): ProposalEvidence {
  const critical = calculateCriticalPath(plan.tasks, plan.dependencies);
  return {
    criticalPath: { taskIds: critical.taskIds, taskTitles: critical.taskTitles, totalDuration: critical.totalDuration },
    simulation: runSimulation(plan, { seed, iterations, calculatedAt }),
    remainingCost: round(plan.resources.reduce((sum, resource) => sum + resource.cost, 0) + plan.tasks.filter((task) => task.status !== "done").reduce((sum, task) => sum + task.cost, 0)),
    unresolvedRiskScore: round(Math.max(0, ...plan.risks.filter((risk) => !risk.resolved).map((risk) => risk.probability * risk.impact)), 3),
    taskCount: plan.tasks.length,
  };
}

export function diffPlans(before: PlanSnapshot, after: PlanSnapshot): ProposalDiff {
  const beforeTasks = new Map(before.tasks.map((task) => [task.id, task]));
  const afterTasks = new Map(after.tasks.map((task) => [task.id, task]));
  const title = (plan: PlanSnapshot, taskId: string) => plan.tasks.find((task) => task.id === taskId)?.title ?? "Unknown task";
  const addedTasks = after.tasks.filter((task) => !beforeTasks.has(task.id)).map((task) => ({ taskId: task.id, title: task.title }));
  const removedTasks = before.tasks.filter((task) => !afterTasks.has(task.id)).map((task) => ({ taskId: task.id, title: task.title }));
  const modifiedTasks = after.tasks.flatMap((task) => {
    const previous = beforeTasks.get(task.id);
    if (!previous) return [];
    const changes = taskChangeFields.flatMap((field) => previous[field] === task[field] ? [] : [{ field, before: previous[field], after: task[field] } as TaskFieldChange]);
    return changes.length ? [{ taskId: task.id, title: task.title, changes }] : [];
  });
  const beforeDependencies = new Map(before.dependencies.map((dependency) => [dependency.id, dependency]));
  const afterDependencies = new Map(after.dependencies.map((dependency) => [dependency.id, dependency]));
  const addedDependencies = after.dependencies.filter((dependency) => !beforeDependencies.has(dependency.id)).map((dependency) => ({ dependencyId: dependency.id, fromTitle: title(after, dependency.fromTaskId), toTitle: title(after, dependency.toTaskId) }));
  const removedDependencies = before.dependencies.filter((dependency) => !afterDependencies.has(dependency.id)).map((dependency) => ({ dependencyId: dependency.id, fromTitle: title(before, dependency.fromTaskId), toTitle: title(before, dependency.toTaskId) }));
  const beforeRisks = new Map(before.risks.map((risk) => [risk.id, risk]));
  const changedRisks = after.risks.flatMap((risk) => {
    const previous = beforeRisks.get(risk.id);
    return previous && (previous.probability !== risk.probability || previous.resolved !== risk.resolved)
      ? [{ riskId: risk.id, title: risk.title, beforeProbability: previous.probability, afterProbability: risk.probability, resolved: risk.resolved }]
      : [];
  });
  return { addedTasks, removedTasks, modifiedTasks, addedDependencies, removedDependencies, changedRisks };
}

export function evaluateProposalConstraints(base: PlanSnapshot, proposed: PlanSnapshot, policy: DecisionPolicy, evidence: ProposalEvidence): ProposalConstraintCheck[] {
  const preserved = policy.preservedTaskIds.filter((taskId) => proposed.tasks.some((task) => task.id === taskId));
  const checks: ProposalConstraintCheck[] = [
    {
      key: "deadline", label: "Deadline", passed: !policy.deadlineLocked || proposed.workspace.deadline === base.workspace.deadline,
      actual: new Date(proposed.workspace.deadline).toLocaleDateString(), required: policy.deadlineLocked ? new Date(base.workspace.deadline).toLocaleDateString() : "Unlocked",
      explanation: policy.deadlineLocked ? "The proposal cannot move the committed deadline." : "Deadline changes are allowed.",
    },
    {
      key: "budget", label: "Budget", passed: !policy.budgetLocked || (proposed.workspace.budget === base.workspace.budget && evidence.simulation.projectedCostRange.maximum <= base.workspace.budget),
      actual: `$${evidence.simulation.projectedCostRange.maximum} P95`, required: policy.budgetLocked ? `≤ $${base.workspace.budget}` : "Unlocked",
      explanation: "Uses the simulated P95 cost, including risk exposure.",
    },
    {
      key: "minimum-probability", label: "Finish probability", passed: !policy.minimumProbabilityLocked || evidence.simulation.onTimeProbability >= policy.minimumProbability,
      actual: `${evidence.simulation.onTimeProbability}%`, required: policy.minimumProbabilityLocked ? `≥ ${policy.minimumProbability}%` : "Unlocked",
      explanation: "Measured with the proposal's recorded seed and iteration count.",
    },
    {
      key: "capacity", label: "Available capacity", passed: !policy.capacityLocked || (proposed.workspace.availableHours === base.workspace.availableHours && evidence.simulation.p80CompletionHours <= base.workspace.availableHours),
      actual: `${evidence.simulation.p80CompletionHours}h P80`, required: policy.capacityLocked ? `≤ ${base.workspace.availableHours}h` : "Unlocked",
      explanation: "Compares the P80 schedule with locked available hours.",
    },
    {
      key: "preserved-scope", label: "Protected capabilities", passed: preserved.length === policy.preservedTaskIds.length,
      actual: `${preserved.length}/${policy.preservedTaskIds.length} preserved`, required: "All protected tasks",
      explanation: "Protected task IDs must remain in the proposed graph.",
    },
    {
      key: "maximum-risk", label: "Maximum risk", passed: !policy.maximumRiskLocked || evidence.unresolvedRiskScore <= policy.maximumRisk,
      actual: evidence.unresolvedRiskScore.toFixed(2), required: policy.maximumRiskLocked ? `≤ ${policy.maximumRisk.toFixed(2)}` : "Unlocked",
      explanation: "Highest unresolved probability × impact score.",
    },
  ];
  return checks;
}

function buildOperations(base: PlanSnapshot, policy: DecisionPolicy, mode: ProposalMode, updatedAt: string): ProposalOperation[] {
  const operations: ProposalOperation[] = [];
  const bottlenecks = findBottlenecks(base);
  const protectedIds = new Set(policy.preservedTaskIds);
  const add = (type: ProposalOperation["type"], input: Record<string, unknown>, reason: string) => operations.push({ id: crypto.randomUUID(), type, input, reason });
  if (mode === "fastest") {
    const removable = base.tasks
      .filter((task) => task.status !== "done" && task.kind !== "milestone" && task.priority !== "critical" && !protectedIds.has(task.id))
      .sort((a, b) => priorityValue(a) - priorityValue(b) || a.estimatedHours - b.estimatedHours || a.title.localeCompare(b.title))[0];
    if (removable) add("delete_task", { taskId: removable.id }, `Remove the least-prioritized unprotected task to recover ${removable.estimatedHours}h of scope.`);
  }
  const baseConfig = {
    safest: { count: 5, estimate: 0.76, maximum: 0.58, confidence: 0.28, risk: 0.3 },
    fastest: { count: 4, estimate: 0.68, maximum: 0.52, confidence: 0.2, risk: 0.5 },
    "highest-impact": { count: 5, estimate: 0.74, maximum: 0.62, confidence: 0.24, risk: 0.45 },
  }[mode];
  const preferenceMatches = policy.preference === ({ safest: "safety", fastest: "speed", "highest-impact": "impact" } as const)[mode];
  const modeConfig = preferenceMatches ? {
    ...baseConfig,
    estimate: mode === "fastest" ? 0.62 : Math.max(0.68, baseConfig.estimate - 0.04),
    maximum: Math.max(0.44, baseConfig.maximum - 0.06),
    confidence: Math.min(0.34, baseConfig.confidence + 0.04),
    risk: Math.max(0.2, baseConfig.risk - 0.1),
  } : baseConfig;
  const removedId = operations.find((operation) => operation.type === "delete_task")?.input.taskId;
  const candidates = bottlenecks.filter((item) => item.taskId !== removedId).slice(0, modeConfig.count);
  const currentCost = base.resources.reduce((sum, resource) => sum + resource.cost, 0) + base.tasks.filter((task) => task.status !== "done").reduce((sum, task) => sum + task.cost, 0);
  const spendable = mode === "highest-impact" ? Math.max(0, Math.min(preferenceMatches ? 8 : 5, (base.workspace.budget - currentCost) * (preferenceMatches ? 0.75 : 0.5))) : 0;
  const costPerTask = candidates.length ? round(spendable / candidates.length) : 0;
  for (const candidate of candidates) {
    const task = base.tasks.find((item) => item.id === candidate.taskId)!;
    const estimatedHours = round(Math.max(task.minimumHours, task.estimatedHours * modeConfig.estimate));
    const maximumHours = round(Math.max(estimatedHours, task.maximumHours * modeConfig.maximum));
    const confidence = round(Math.min(0.96, task.confidence + modeConfig.confidence), 2);
    add("update_task", {
      taskId: task.id,
      estimatedHours,
      maximumHours,
      confidence,
      ...(costPerTask > 0 ? { cost: round(task.cost + costPerTask) } : {}),
    }, `${candidate.title} is a bottleneck because ${candidate.signals.slice(0, 2).join(" and ")}; reduce duration variance${costPerTask > 0 ? ` with $${costPerTask} of focused support` : " through earlier validation"}.`);
  }
  for (const risk of base.risks.filter((item) => !item.resolved).sort((a, b) => b.probability * b.impact - a.probability * a.impact).slice(0, mode === "safest" ? 3 : 2)) {
    add("update_risk", { riskId: risk.id, probability: round(risk.probability * modeConfig.risk, 3), mitigation: `${risk.mitigation} Proposal commits to early mitigation checkpoints.` }, `${risk.title} is a dominant simulated failure source; lower exposure with its recorded mitigation.`);
  }
  if (!operations.length) {
    const task = base.tasks.find((item) => item.status !== "done" && item.kind !== "milestone");
    if (task) add("update_task", { taskId: task.id, confidence: round(Math.min(0.95, task.confidence + 0.1), 2) }, "Reduce uncertainty on the next executable task.");
  }
  void updatedAt;
  return operations;
}

function applyOperation(plan: PlanSnapshot, operation: PlanOperation | ProposalOperation, updatedAt: string): void {
  const input = operation.input;
  switch (operation.type) {
    case "create_task": {
      const parsed = createTaskInputSchema.safeParse(input);
      if (!parsed.success) throw parsed.error;
      const estimate = parsed.data.kind === "milestone" ? 0 : parsed.data.estimatedHours;
      const task = taskSchema.parse({ ...parsed.data, id: parsed.data.id ?? crypto.randomUUID(), workspaceId: plan.workspace.id, estimatedHours: estimate, minimumHours: parsed.data.kind === "milestone" ? 0 : (parsed.data.minimumHours ?? estimate * 0.7), maximumHours: parsed.data.kind === "milestone" ? 0 : (parsed.data.maximumHours ?? estimate * 1.4), createdAt: updatedAt, updatedAt });
      if (plan.tasks.some((item) => item.id === task.id)) throw new Error(`Task already exists: ${task.id}`);
      plan.tasks.push(task);
      break;
    }
    case "update_task": {
      const task = requireTask(plan, z.string().uuid().parse(input.taskId));
      const updates = z.object({ taskId: z.string().uuid(), title: z.string().min(1).max(140).optional(), estimatedHours: z.number().nonnegative().optional(), minimumHours: z.number().nonnegative().optional(), maximumHours: z.number().nonnegative().optional(), confidence: z.number().min(0).max(1).optional(), priority: z.enum(["low", "medium", "high", "critical"]).optional(), status: z.enum(["todo", "in-progress", "blocked", "done"]).optional(), cost: z.number().nonnegative().optional() }).strict().parse(input);
      const { taskId: _, ...values } = updates;
      Object.assign(task, values, { updatedAt });
      if (values.estimatedHours !== undefined) {
        if (values.minimumHours === undefined) task.minimumHours = Math.min(task.minimumHours, values.estimatedHours);
        if (values.maximumHours === undefined) task.maximumHours = Math.max(task.maximumHours, values.estimatedHours);
      }
      taskSchema.parse(task);
      break;
    }
    case "delete_task": {
      const taskId = z.string().uuid().parse(input.taskId);
      requireTask(plan, taskId);
      plan.tasks = plan.tasks.filter((task) => task.id !== taskId);
      plan.dependencies = plan.dependencies.filter((dependency) => dependency.fromTaskId !== taskId && dependency.toTaskId !== taskId);
      plan.risks = plan.risks.map((risk) => risk.taskId === taskId ? { ...risk, taskId: null } : risk);
      break;
    }
    case "create_dependency": {
      const values = z.object({ id: z.string().uuid().optional(), fromTaskId: z.string().uuid(), toTaskId: z.string().uuid() }).strict().parse(input);
      requireTask(plan, values.fromTaskId); requireTask(plan, values.toTaskId);
      if (values.fromTaskId === values.toTaskId) throw new Error("A task cannot depend on itself");
      if (plan.dependencies.some((item) => item.fromTaskId === values.fromTaskId && item.toTaskId === values.toTaskId)) break;
      plan.dependencies.push(dependencySchema.parse({ ...values, id: values.id ?? crypto.randomUUID(), workspaceId: plan.workspace.id }));
      break;
    }
    case "delete_dependency": {
      const dependencyId = z.string().uuid().parse(input.dependencyId);
      if (!plan.dependencies.some((item) => item.id === dependencyId)) throw new Error(`Unknown dependency: ${dependencyId}`);
      plan.dependencies = plan.dependencies.filter((item) => item.id !== dependencyId);
      break;
    }
    case "complete_task": requireTask(plan, z.string().uuid().parse(input.taskId)).status = "done"; break;
    case "resolve_risk": {
      const risk = requireRisk(plan, z.string().uuid().parse(input.riskId));
      risk.resolved = true;
      if (typeof input.mitigation === "string") risk.mitigation = input.mitigation;
      break;
    }
    case "update_risk": {
      const values = z.object({ riskId: z.string().uuid(), probability: z.number().min(0).max(1).optional(), impact: z.number().min(0).max(1).optional(), mitigation: z.string().max(1_000).optional(), resolved: z.boolean().optional() }).strict().parse(input);
      const risk = requireRisk(plan, values.riskId);
      const { riskId: _, ...updates } = values;
      Object.assign(risk, updates);
      riskSchema.parse(risk);
      break;
    }
    case "update_workspace": {
      const values = workspaceSchema.pick({ name: true, objective: true, description: true, deadline: true, availableHours: true, budget: true }).partial().strict().parse(input);
      Object.assign(plan.workspace, values, { updatedAt });
      break;
    }
  }
}

function requireTask(plan: PlanSnapshot, taskId: string): Task {
  const task = plan.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  return task;
}

function requireRisk(plan: PlanSnapshot, riskId: string) {
  const risk = plan.risks.find((item) => item.id === riskId);
  if (!risk) throw new Error(`Unknown risk: ${riskId}`);
  return risk;
}

function priorityValue(task: Task): number {
  return { low: 0, medium: 1, high: 2, critical: 3 }[task.priority];
}

function formatDelta(before: number, after: number, decreaseIsGood = false): string {
  const delta = round(after - before);
  const value = `${delta > 0 ? "+" : ""}${delta}`;
  return decreaseIsGood ? `${value}h` : `${value} points`;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
