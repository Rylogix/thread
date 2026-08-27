import { describe, expect, it } from "vitest";
import { workspaceStateSchema } from "../src/domain/schemas";
import { createDemoWorkspace } from "../src/domain/seed";
import type { PlanSnapshot } from "../src/domain/types";
import { calculateCriticalPath, GraphValidationError } from "../src/engine/criticalPath";
import { detectConflicts } from "../src/engine/conflicts";
import { calculateFeasibility, findBottlenecks } from "../src/engine/feasibility";
import { runSimulation } from "../src/engine/simulation";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const demo = () => createDemoWorkspace(workspaceId);
const plan = (): PlanSnapshot => {
  const state = demo();
  return { workspace: state.workspace, tasks: state.tasks, dependencies: state.dependencies, constraints: state.constraints, resources: state.resources, risks: state.risks };
};

describe("deterministic planning engine", () => {
  it("creates a schema-valid seeded workspace with a real critical path", () => {
    const state = workspaceStateSchema.parse(demo());
    const result = calculateCriticalPath(state.tasks, state.dependencies);
    expect(result.taskIds.length).toBeGreaterThan(4);
    expect(result.totalDuration).toBeGreaterThan(20);
    expect(result.taskTitles.at(-1)).toBe("Submit before deadline");
  });

  it("rejects dependency cycles", () => {
    const state = demo();
    const last = state.tasks.at(-1)!;
    const first = state.tasks[0]!;
    const dependencies = [...state.dependencies, { id: crypto.randomUUID(), workspaceId, fromTaskId: last.id, toTaskId: first.id }];
    expect(() => calculateCriticalPath(state.tasks, dependencies)).toThrow(GraphValidationError);
  });

  it("detects missing dependencies, capacity, budget, and milestone conflicts", () => {
    const state = demo();
    state.workspace.availableHours = 1;
    state.workspace.budget = 1;
    state.tasks.at(-1)!.status = "done";
    state.dependencies.push({ id: crypto.randomUUID(), workspaceId, fromTaskId: crypto.randomUUID(), toTaskId: state.tasks[0]!.id });
    const conflicts = detectConflicts(state);
    expect(new Set(conflicts.map((conflict) => conflict.type))).toEqual(expect.objectContaining(new Set(["missing-task", "available-hours", "budget-overrun", "milestone-prerequisite"])));
  });

  it("produces identical simulation results for the same documented seed", () => {
    const first = runSimulation(plan(), { iterations: 500, seed: 20_260_903, calculatedAt: "2026-08-27T13:00:00.000Z" });
    const second = runSimulation(plan(), { iterations: 500, seed: 20_260_903, calculatedAt: "2026-08-27T13:00:00.000Z" });
    expect(second).toEqual(first);
    expect(first.onTimeProbability).toBeGreaterThan(55);
    expect(first.onTimeProbability).toBeLessThan(85);
    expect(first.p95CompletionHours).toBeGreaterThan(first.medianCompletionHours);
  });

  it("ranks understandable bottlenecks and produces feasibility recommendations", () => {
    const bottlenecks = findBottlenecks(plan());
    expect(bottlenecks[0]!.signals.length).toBeGreaterThan(1);
    const feasibility = calculateFeasibility(plan());
    expect(feasibility.percentage).toBeGreaterThanOrEqual(0);
    expect(feasibility.percentage).toBeLessThanOrEqual(100);
    expect(feasibility.recommendedChanges.length).toBeGreaterThan(0);
  });
});
