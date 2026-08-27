import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "../src/domain/seed";
import { validateWorkspaceIntegrity } from "../worker/index";

const workspaceId = "70000000-0000-4000-8000-000000000007";

describe("Worker workspace integrity boundary", () => {
  it("accepts the migrated demo workspace", () => {
    expect(validateWorkspaceIntegrity(createDemoWorkspace(workspaceId))).toEqual([]);
  });

  it("rejects graph cycles and decision references that do not exist", () => {
    const state = createDemoWorkspace(workspaceId);
    state.dependencies.push({ id: crypto.randomUUID(), workspaceId, fromTaskId: state.tasks.at(-1)!.id, toTaskId: state.tasks[0]!.id });
    const proposalId = crypto.randomUUID();
    const optionId = crypto.randomUUID();
    state.humanDecisions.push({
      id: crypto.randomUUID(), workspaceId, question: "Choose", context: "Invalid fixture", proposalIds: [proposalId, crypto.randomUUID()],
      options: [
        { id: optionId, proposalId, label: "Missing A", summary: "Missing", predictedProbability: 90, predictedP80: 10, predictedCostMaximum: 10, scopeDelta: 0 },
        { id: crypto.randomUUID(), proposalId: crypto.randomUUID(), label: "Missing B", summary: "Missing", predictedProbability: 91, predictedP80: 9, predictedCostMaximum: 11, scopeDelta: 0 },
      ],
      status: "open", selectedOptionId: null, customResponse: null, requestedAt: new Date().toISOString(), answeredAt: null,
    });
    const issues = validateWorkspaceIntegrity(state);
    expect(issues.some((issue) => issue.message.toLowerCase().includes("cycle"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("unknown proposal"))).toBe(true);
  });
});
