import type { Bottleneck, FeasibilityResult, PlanSnapshot, SimulationResult } from "../domain/types";
import { calculateCriticalPath } from "./criticalPath";
import { detectConflicts } from "./conflicts";
import { runSimulation } from "./simulation";

const priorityWeight = { low: 0, medium: 0.5, high: 1, critical: 1.5 } as const;

export function findBottlenecks(plan: PlanSnapshot): Bottleneck[] {
  const critical = calculateCriticalPath(plan.tasks, plan.dependencies);
  const criticalIds = new Set(critical.taskIds);
  const descendants = descendantCounts(plan);
  return plan.tasks
    .filter((task) => task.status !== "done" && task.kind !== "milestone")
    .map((task) => {
      const signals: string[] = [];
      let score = priorityWeight[task.priority];
      if (criticalIds.has(task.id)) { score += 4; signals.push("on critical path"); }
      const downstream = descendants.get(task.id) ?? 0;
      if (downstream > 0) { score += Math.min(3, downstream * 0.45); signals.push(`${downstream} downstream task${downstream === 1 ? "" : "s"}`); }
      if (task.estimatedHours >= 5) { score += Math.min(2.5, task.estimatedHours / 5); signals.push(`${task.estimatedHours}h estimate`); }
      if (task.confidence < 0.7) { score += (0.7 - task.confidence) * 5; signals.push(`${Math.round(task.confidence * 100)}% confidence`); }
      const risk = plan.risks.filter((candidate) => !candidate.resolved && candidate.taskId === task.id).reduce((sum, candidate) => sum + candidate.probability * candidate.impact, 0);
      if (risk > 0) { score += risk * 4; signals.push("linked unresolved risk"); }
      return { taskId: task.id, title: task.title, score: Math.round(score * 10) / 10, signals };
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

export function calculateFeasibility(plan: PlanSnapshot, simulation?: SimulationResult): FeasibilityResult {
  const result = simulation ?? runSimulation(plan, { iterations: 1_000 });
  const conflicts = detectConflicts(plan);
  const bottlenecks = findBottlenecks(plan);
  const positives: string[] = [];
  const remainingCost = plan.tasks.filter((task) => task.status !== "done").reduce((sum, task) => sum + task.cost, 0);
  if (remainingCost <= plan.workspace.budget) positives.push(`Projected base cost stays within the $${plan.workspace.budget} budget`);
  if (!conflicts.some((conflict) => conflict.type === "dependency-cycle" || conflict.type === "missing-task")) positives.push("The dependency graph is valid and acyclic");
  const completed = plan.tasks.filter((task) => task.status === "done").length;
  if (completed > 0) positives.push(`${completed} task${completed === 1 ? " is" : "s are"} already complete`);
  if (result.p80CompletionHours <= plan.workspace.availableHours) positives.push("The P80 schedule fits the available-hours constraint");
  const failures = result.failureSources.slice(0, 3).map((source) => source.source);
  const recommendations: FeasibilityResult["recommendedChanges"] = bottlenecks.slice(0, 3).map((bottleneck) => ({
    action: "reduce_uncertainty",
    targetId: bottleneck.taskId,
    reason: `${bottleneck.title}: ${bottleneck.signals.slice(0, 2).join(", ")}`,
  }));
  if (conflicts.some((conflict) => conflict.type === "available-hours" || conflict.type === "resource-capacity")) {
    recommendations.unshift({ action: "reduce_scope_or_add_capacity", reason: "Remaining effort exceeds a hard capacity constraint" });
  }
  return {
    percentage: result.onTimeProbability,
    explanation: result.onTimeProbability >= 90
      ? `Strong plan: ${result.onTimeProbability}% of ${result.iterations} seeded simulations finish within time and budget.`
      : `At-risk plan: ${result.onTimeProbability}% of ${result.iterations} seeded simulations finish within time and budget.`,
    positiveFactors: positives.slice(0, 4),
    failureSources: failures,
    recommendedChanges: recommendations.slice(0, 4),
  };
}

function descendantCounts(plan: PlanSnapshot): Map<string, number> {
  const successors = new Map(plan.tasks.map((task) => [task.id, [] as string[]]));
  for (const dependency of plan.dependencies) successors.get(dependency.fromTaskId)?.push(dependency.toTaskId);
  const counts = new Map<string, number>();
  for (const task of plan.tasks) {
    const seen = new Set<string>();
    const stack = [...(successors.get(task.id) ?? [])];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || seen.has(current)) continue;
      seen.add(current);
      stack.push(...(successors.get(current) ?? []));
    }
    counts.set(task.id, seen.size);
  }
  return counts;
}
