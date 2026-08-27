import type { CriticalPathResult, Dependency, Task } from "../domain/types";

export class GraphValidationError extends Error {
  constructor(message: string, readonly code: "cycle" | "missing-task") {
    super(message);
    this.name = "GraphValidationError";
  }
}

export function topologicalSort(tasks: Task[], dependencies: Dependency[]): string[] {
  const taskIds = new Set(tasks.map((task) => task.id));
  const indegree = new Map(tasks.map((task) => [task.id, 0]));
  const successors = new Map(tasks.map((task) => [task.id, [] as string[]]));
  for (const dependency of dependencies) {
    if (!taskIds.has(dependency.fromTaskId) || !taskIds.has(dependency.toTaskId)) {
      throw new GraphValidationError(`Dependency ${dependency.id} references a missing task`, "missing-task");
    }
    indegree.set(dependency.toTaskId, (indegree.get(dependency.toTaskId) ?? 0) + 1);
    successors.get(dependency.fromTaskId)?.push(dependency.toTaskId);
  }
  const queue = tasks.filter((task) => indegree.get(task.id) === 0).map((task) => task.id).sort();
  const order: string[] = [];
  while (queue.length > 0) {
    const taskId = queue.shift();
    if (!taskId) break;
    order.push(taskId);
    for (const successor of successors.get(taskId) ?? []) {
      const next = (indegree.get(successor) ?? 0) - 1;
      indegree.set(successor, next);
      if (next === 0) {
        queue.push(successor);
        queue.sort();
      }
    }
  }
  if (order.length !== tasks.length) throw new GraphValidationError("Dependency graph contains a cycle", "cycle");
  return order;
}

export function calculateCriticalPath(
  tasks: Task[],
  dependencies: Dependency[],
  durationOverrides: ReadonlyMap<string, number> = new Map(),
): CriticalPathResult {
  if (tasks.length === 0) return { taskIds: [], taskTitles: [], totalDuration: 0, timings: {} };
  const order = topologicalSort(tasks, dependencies);
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const predecessors = new Map(tasks.map((task) => [task.id, [] as string[]]));
  const successors = new Map(tasks.map((task) => [task.id, [] as string[]]));
  for (const dependency of dependencies) {
    predecessors.get(dependency.toTaskId)?.push(dependency.fromTaskId);
    successors.get(dependency.fromTaskId)?.push(dependency.toTaskId);
  }
  const durations = new Map(
    tasks.map((task) => [task.id, task.status === "done" || task.kind === "milestone" ? 0 : (durationOverrides.get(task.id) ?? task.estimatedHours)]),
  );
  const earliestStart = new Map<string, number>();
  const earliestFinish = new Map<string, number>();
  const longestPredecessor = new Map<string, string>();
  for (const taskId of order) {
    let start = 0;
    for (const predecessor of predecessors.get(taskId) ?? []) {
      const finish = earliestFinish.get(predecessor) ?? 0;
      if (finish > start) {
        start = finish;
        longestPredecessor.set(taskId, predecessor);
      }
    }
    earliestStart.set(taskId, start);
    earliestFinish.set(taskId, start + (durations.get(taskId) ?? 0));
  }
  const totalDuration = Math.max(...earliestFinish.values());
  const latestFinish = new Map<string, number>();
  const latestStart = new Map<string, number>();
  for (const taskId of [...order].reverse()) {
    const nextTasks = successors.get(taskId) ?? [];
    const finish = nextTasks.length === 0 ? totalDuration : Math.min(...nextTasks.map((id) => latestStart.get(id) ?? totalDuration));
    latestFinish.set(taskId, finish);
    latestStart.set(taskId, finish - (durations.get(taskId) ?? 0));
  }
  const timings = Object.fromEntries(
    order.map((taskId) => {
      const slack = Math.max(0, (latestStart.get(taskId) ?? 0) - (earliestStart.get(taskId) ?? 0));
      return [taskId, {
        taskId,
        earliestStart: earliestStart.get(taskId) ?? 0,
        earliestFinish: earliestFinish.get(taskId) ?? 0,
        latestStart: latestStart.get(taskId) ?? 0,
        latestFinish: latestFinish.get(taskId) ?? 0,
        slack,
        critical: slack < 0.0001,
      }];
    }),
  );
  let endTask = order.reduce((best, taskId) => (earliestFinish.get(taskId) ?? 0) >= (earliestFinish.get(best) ?? 0) ? taskId : best, order[0]!);
  const path: string[] = [];
  while (endTask) {
    path.unshift(endTask);
    const previous = longestPredecessor.get(endTask);
    if (!previous) break;
    endTask = previous;
  }
  return {
    taskIds: path,
    taskTitles: path.map((taskId) => taskMap.get(taskId)?.title ?? taskId),
    totalDuration: round(totalDuration),
    timings,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
