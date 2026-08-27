import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "../src/domain/seed";
import type { DecisionPolicy, PlanSnapshot, ProposalMode } from "../src/domain/types";
import { applyOperationsToPlan, generatePlanProposal } from "../src/engine/proposals";
import { validatePlanInvariants } from "../src/engine/invariants";

const workspaceId = "60000000-0000-4000-8000-000000000006";
const calculatedAt = "2026-08-27T14:00:00.000Z";

function plan(): PlanSnapshot {
  const state = createDemoWorkspace(workspaceId);
  return structuredClone({ workspace: state.workspace, tasks: state.tasks, dependencies: state.dependencies, constraints: state.constraints, resources: state.resources, risks: state.risks });
}

function policy(base: PlanSnapshot): DecisionPolicy {
  return {
    negotiationActive: true,
    deadlineLocked: true,
    budgetLocked: true,
    minimumProbabilityLocked: true,
    minimumProbability: 90,
    capacityLocked: false,
    preservedTaskIds: base.tasks.filter((task) => task.title.includes("WebMCP")).map((task) => task.id),
    maximumRiskLocked: true,
    maximumRisk: 0.25,
    preference: "balanced",
    updatedAt: calculatedAt,
  };
}

describe("deterministic proposal engine", () => {
  it.each<ProposalMode>(["safest", "fastest", "highest-impact"])("generates a deterministic valid %s proposal", (mode) => {
    const base = plan();
    const first = generatePlanProposal(base, policy(base), mode, 1, { seed: 20_260_903, iterations: 1_000, createdAt: calculatedAt });
    const second = generatePlanProposal(base, policy(base), mode, 1, { seed: 20_260_903, iterations: 1_000, createdAt: calculatedAt });

    expect(first.before).toEqual(second.before);
    expect(first.after).toEqual(second.after);
    expect(first.operations.map(({ type, input, reason }) => ({ type, input, reason }))).toEqual(second.operations.map(({ type, input, reason }) => ({ type, input, reason })));
    expect(first.after.simulation.onTimeProbability).toBeGreaterThan(first.before.simulation.onTimeProbability);
    expect(first.constraintChecks.find((check) => check.key === "preserved-scope")?.passed).toBe(true);
    expect(validatePlanInvariants(first.proposedPlan)).toEqual([]);
  });

  it("applies a multi-operation plan all-or-nothing and rejects invariant violations", () => {
    const base = plan();
    const original = structuredClone(base);
    expect(() => applyOperationsToPlan(base, [
      { type: "update_task", input: { taskId: base.tasks[1]!.id, confidence: 0.9 } },
      { type: "create_dependency", input: { fromTaskId: base.tasks.at(-1)!.id, toTaskId: base.tasks[0]!.id } },
    ])).toThrow();
    expect(base).toEqual(original);
  });

  it("turns a structured human preference into a materially revised simulation", () => {
    const base = plan();
    const balanced = policy(base);
    balanced.preference = "balanced";
    const safety = { ...balanced, preference: "safety" as const };
    const initial = generatePlanProposal(base, balanced, "safest", 1, { seed: 20_260_903, iterations: 1_000, createdAt: calculatedAt });
    const revised = generatePlanProposal(base, safety, "safest", 1, { seed: 20_260_903, iterations: 1_000, createdAt: calculatedAt, proposalId: initial.id, revision: 2 });
    expect(revised.operations.map((operation) => operation.input)).not.toEqual(initial.operations.map((operation) => operation.input));
    expect(revised.after.simulation.onTimeProbability).toBeGreaterThanOrEqual(initial.after.simulation.onTimeProbability);
    expect(revised.revision).toBe(2);
  });

  it("reports duplicate IDs, missing references, and cycles", () => {
    const broken = plan();
    broken.tasks.push(structuredClone(broken.tasks[0]!));
    broken.dependencies.push({ id: crypto.randomUUID(), workspaceId, fromTaskId: broken.tasks.at(-2)!.id, toTaskId: broken.tasks[0]!.id });
    const errors = validatePlanInvariants(broken);
    expect(errors.some((error) => error.includes("Duplicate task ID"))).toBe(true);
    expect(errors.some((error) => error.toLowerCase().includes("cycle"))).toBe(true);
  });
});
