import type { Conflict, PlanSnapshot } from "../domain/types";
import { calculateCriticalPath, GraphValidationError, topologicalSort } from "./criticalPath";

export function detectConflicts(plan: PlanSnapshot): Conflict[] {
  const conflicts: Conflict[] = [];
  const taskIds = new Set(plan.tasks.map((task) => task.id));
  const missing = plan.dependencies.filter((dependency) => !taskIds.has(dependency.fromTaskId) || !taskIds.has(dependency.toTaskId));
  for (const dependency of missing) {
    conflicts.push({ type: "missing-task", severity: "error", message: `Dependency ${dependency.id} references a missing task`, taskIds: [dependency.fromTaskId, dependency.toTaskId] });
  }
  try {
    topologicalSort(plan.tasks, plan.dependencies.filter((dependency) => taskIds.has(dependency.fromTaskId) && taskIds.has(dependency.toTaskId)));
  } catch (error) {
    if (error instanceof GraphValidationError && error.code === "cycle") {
      conflicts.push({ type: "dependency-cycle", severity: "error", message: error.message, taskIds: [] });
    }
  }
  const remaining = plan.tasks.filter((task) => task.status !== "done" && task.kind !== "milestone");
  const totalHours = remaining.reduce((sum, task) => sum + task.estimatedHours, 0);
  if (totalHours > plan.workspace.availableHours) {
    conflicts.push({ type: "available-hours", severity: "error", message: `${round(totalHours)}h of remaining work exceeds ${plan.workspace.availableHours}h available`, taskIds: remaining.map((task) => task.id) });
  }
  const totalCost = remaining.reduce((sum, task) => sum + task.cost, 0) + plan.resources.reduce((sum, resource) => sum + resource.cost, 0);
  if (totalCost > plan.workspace.budget) {
    conflicts.push({ type: "budget-overrun", severity: "error", message: `$${round(totalCost)} projected cost exceeds the $${plan.workspace.budget} budget`, taskIds: remaining.filter((task) => task.cost > 0).map((task) => task.id) });
  }
  const capacity = plan.resources.reduce((sum, resource) => sum + resource.capacity, 0);
  if (capacity > 0 && totalHours > capacity) {
    conflicts.push({ type: "resource-capacity", severity: "warning", message: `${round(totalHours)}h of work exceeds ${round(capacity)}h named resource capacity`, taskIds: remaining.map((task) => task.id) });
  }
  try {
    const critical = calculateCriticalPath(plan.tasks, plan.dependencies);
    const deadlineHours = Math.max(0, (Date.parse(plan.workspace.deadline) - Date.parse(plan.workspace.createdAt)) / 3_600_000 / 3);
    if (critical.totalDuration > deadlineHours) {
      conflicts.push({ type: "impossible-deadline", severity: "error", message: `${critical.totalDuration}h critical path exceeds ${round(deadlineHours)}h of deadline capacity`, taskIds: critical.taskIds });
    }
  } catch {
    // A structural graph error is already reported above.
  }
  for (const milestone of plan.tasks.filter((task) => task.kind === "milestone" && task.status === "done")) {
    const unfinished = plan.dependencies
      .filter((dependency) => dependency.toTaskId === milestone.id)
      .map((dependency) => plan.tasks.find((task) => task.id === dependency.fromTaskId))
      .filter((task) => task && task.status !== "done");
    if (unfinished.length > 0) {
      conflicts.push({ type: "milestone-prerequisite", severity: "error", message: `${milestone.title} is complete while prerequisites remain unfinished`, taskIds: [milestone.id, ...unfinished.map((task) => task!.id)] });
    }
  }
  return conflicts;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
