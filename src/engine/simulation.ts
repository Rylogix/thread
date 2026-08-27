import type { PlanSnapshot, SimulationResult, Task } from "../domain/types";
import { calculateCriticalPath } from "./criticalPath";

export const DEFAULT_SIMULATION_SEED = 20_260_903;
export const MAX_SIMULATION_ITERATIONS = 5_000;

export function runSimulation(
  plan: PlanSnapshot,
  options: { iterations?: number; seed?: number; calculatedAt?: string } = {},
): SimulationResult {
  const iterations = Math.min(MAX_SIMULATION_ITERATIONS, Math.max(50, Math.floor(options.iterations ?? 1_000)));
  const seed = options.seed ?? DEFAULT_SIMULATION_SEED;
  const random = mulberry32(seed);
  const completionHours: number[] = [];
  const costs: number[] = [];
  const failures = new Map<string, number>();
  let successes = 0;
  const resourceCapacity = plan.resources.reduce((sum, resource) => sum + resource.capacity, 0);
  const availableCapacity = Math.min(plan.workspace.availableHours, resourceCapacity > 0 ? resourceCapacity : plan.workspace.availableHours);
  const deadlineIsValid = Date.parse(plan.workspace.deadline) > Date.parse(plan.workspace.createdAt);
  const hardCapacity = deadlineIsValid ? availableCapacity : 0;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const durations = new Map<string, number>();
    let totalHours = 0;
    let totalCost = plan.resources.reduce((sum, resource) => sum + resource.cost, 0);
    for (const task of plan.tasks) {
      const duration = sampleTaskDuration(task, random);
      durations.set(task.id, duration);
      totalHours += duration;
      totalCost += task.status === "done" ? 0 : task.cost;
    }
    for (const risk of plan.risks) {
      if (risk.resolved || random() >= risk.probability) continue;
      const task = risk.taskId ? plan.tasks.find((candidate) => candidate.id === risk.taskId) : undefined;
      const delay = (task?.maximumHours ?? Math.max(totalHours * 0.06, 1)) * risk.impact * (0.35 + random() * 0.5);
      totalHours += delay;
      if (task) durations.set(task.id, (durations.get(task.id) ?? 0) + delay);
      totalCost += risk.impact * (task?.cost ?? 5) * random();
      failures.set(risk.title, (failures.get(risk.title) ?? 0) + 1);
    }
    const criticalHours = calculateCriticalPath(plan.tasks, plan.dependencies, durations).totalDuration;
    const effectiveCompletion = Math.max(criticalHours, totalHours);
    completionHours.push(effectiveCompletion);
    costs.push(totalCost);
    let success = true;
    if (effectiveCompletion > hardCapacity) {
      failures.set("Available time and capacity", (failures.get("Available time and capacity") ?? 0) + 1);
      success = false;
    }
    if (totalCost > plan.workspace.budget) {
      failures.set("Budget ceiling", (failures.get("Budget ceiling") ?? 0) + 1);
      success = false;
    }
    if (success) successes += 1;
  }

  completionHours.sort((a, b) => a - b);
  costs.sort((a, b) => a - b);
  const varianceContributors = plan.tasks
    .filter((task) => task.status !== "done" && task.kind !== "milestone")
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      score: round((task.maximumHours - task.minimumHours) * (1.2 - task.confidence) * (1 + unresolvedRiskWeight(task, plan))),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  const failureSources = [...failures.entries()]
    .map(([source, count]) => ({ source, frequency: round(count / iterations, 3) }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 6);
  const warnings: string[] = [];
  if (successes / iterations < 0.8) warnings.push("The plan has less than an 80% chance of finishing within its hard limits.");
  if (varianceContributors[0]?.score && varianceContributors[0].score > 4) warnings.push(`${varianceContributors[0].title} is the largest source of schedule variance.`);
  if (hardCapacity <= 0) warnings.push("The workspace deadline has no calculable capacity.");
  return {
    seed,
    iterations,
    onTimeProbability: round((successes / iterations) * 100, 1),
    medianCompletionHours: round(percentile(completionHours, 0.5), 1),
    p80CompletionHours: round(percentile(completionHours, 0.8), 1),
    p95CompletionHours: round(percentile(completionHours, 0.95), 1),
    projectedCostRange: { minimum: round(percentile(costs, 0.05), 2), maximum: round(percentile(costs, 0.95), 2) },
    failureSources,
    varianceContributors,
    warnings,
    calculatedAt: options.calculatedAt ?? new Date().toISOString(),
  };
}

function sampleTaskDuration(task: Task, random: () => number): number {
  if (task.status === "done" || task.kind === "milestone") return 0;
  const minimum = task.minimumHours;
  const maximum = task.maximumHours;
  if (maximum <= minimum) return minimum;
  const mode = Math.min(maximum, Math.max(minimum, task.estimatedHours));
  const split = (mode - minimum) / (maximum - minimum);
  const roll = random();
  const triangular = roll < split
    ? minimum + Math.sqrt(roll * (maximum - minimum) * (mode - minimum))
    : maximum - Math.sqrt((1 - roll) * (maximum - minimum) * (maximum - mode));
  const confidencePenalty = (1 - task.confidence) * (maximum - mode) * random() * 0.35;
  return triangular + confidencePenalty;
}

function unresolvedRiskWeight(task: Task, plan: PlanSnapshot): number {
  return plan.risks.filter((risk) => !risk.resolved && risk.taskId === task.id).reduce((sum, risk) => sum + risk.probability * risk.impact, 0);
}

function percentile(sorted: number[], quantile: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))] ?? 0;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}
