import { beforeEach, describe, expect, it } from "vitest";
import { WorkspaceService, ApplicationError } from "../src/domain/workspaceService";
import { MemoryWorkspaceRepository } from "../src/persistence/repository";

const workspaceId = "20000000-0000-4000-8000-000000000002";
let repository: MemoryWorkspaceRepository;
let service: WorkspaceService;

beforeEach(async () => {
  repository = new MemoryWorkspaceRepository();
  service = new WorkspaceService(repository, workspaceId);
  await service.initialize();
  await service.resetDemo({ actor: "system" });
});

describe("workspace application service", () => {
  it("creates, edits, completes, and deletes a task through atomic shared services", async () => {
    const task = await service.createTask({ title: "Production smoke test", estimatedHours: 2 }, { actor: "human" });
    expect(service.getTask(task.id).title).toBe("Production smoke test");
    await service.updateTask({ taskId: task.id, estimatedHours: 1.5, priority: "high" }, { actor: "human" });
    await service.completeTask({ taskId: task.id }, { actor: "human" });
    expect(service.getTask(task.id).status).toBe("done");
    await service.deleteTask(task.id, { actor: "human" });
    expect(() => service.getTask(task.id)).toThrow(ApplicationError);
  });

  it("prevents cycles and safely returns an existing duplicate dependency", async () => {
    const tasks = service.getTasks();
    const existing = service.getDependencies()[0]!;
    await expect(service.createDependency({ fromTaskId: existing.fromTaskId, toTaskId: existing.toTaskId }, { actor: "agent" })).resolves.toEqual(existing);
    const end = tasks.find((task) => task.kind === "milestone")!;
    await expect(service.createDependency({ fromTaskId: end.id, toTaskId: tasks[0]!.id }, { actor: "agent" })).rejects.toMatchObject({ code: "conflict" });
  });

  it("validates malformed and unknown inputs without partially mutating state", async () => {
    const before = service.getTasks().length;
    await expect(service.createTask({ title: "", estimatedHours: -2 }, { actor: "agent" })).rejects.toMatchObject({ code: "validation" });
    await expect(service.updateTask({ taskId: crypto.randomUUID(), title: "Missing" }, { actor: "agent" })).rejects.toMatchObject({ code: "not-found" });
    expect(service.getTasks()).toHaveLength(before);
  });

  it("makes same-payload retries safe and rejects conflicting idempotency payloads", async () => {
    const first = await service.createTask({ title: "Idempotent task" }, { actor: "agent", idempotencyKey: "agent-call-1" });
    const second = await service.createTask({ title: "Idempotent task" }, { actor: "agent", idempotencyKey: "agent-call-1" });
    expect(second.id).toBe(first.id);
    expect(service.getTasks().filter((task) => task.id === first.id)).toHaveLength(1);
    await expect(service.createTask({ title: "Different payload" }, { actor: "agent", idempotencyKey: "agent-call-1" })).rejects.toMatchObject({ code: "conflict" });
  });

  it("creates, compares, applies, and discards immutable scenarios", async () => {
    const scenario = await service.createScenario({ name: "Safer release", description: "Snapshot" }, { actor: "human" });
    await service.updateWorkspace({ availableHours: 10 }, { actor: "human" });
    await service.applyScenario(scenario.id, { actor: "human" });
    expect(service.getWorkspace().availableHours).toBe(scenario.snapshot.workspace.availableHours);
    const comparison = await service.compareScenarios([scenario.id]);
    expect(comparison).toHaveLength(1);
    await service.discardScenario(scenario.id, { actor: "human" });
    expect(service.getState()!.scenarios.some((item) => item.id === scenario.id)).toBe(false);
  });

  it("keeps usable local state when D1 persistence fails", async () => {
    repository.failRemote = true;
    await service.createConstraint({ type: "scope", title: "No scope creep", value: true, hard: true, description: "Keep the core." }, { actor: "human" });
    expect(service.getState()!.storageMode).toBe("local");
    expect(service.getActivity().some((event) => event.type === "persistence.fallback")).toBe(true);
  });

  it("rolls back the latest agent mutation", async () => {
    const original = service.getTasks()[1]!.estimatedHours;
    await service.updateTask({ taskId: service.getTasks()[1]!.id, estimatedHours: original + 4 }, { actor: "agent" });
    await service.rollbackLastAgentAction();
    expect(service.getTasks()[1]!.estimatedHours).toBe(original);
  });

  it("runs a representative multi-step agent optimization above 90 percent", async () => {
    const before = (await service.runSimulation({ iterations: 750 }, { actor: "agent" })).onTimeProbability;
    const optimized = await service.optimizePlan({ targetProbability: 90, preserveTaskIds: service.getTasks().filter((task) => task.title.includes("WebMCP")).map((task) => task.id) }, { actor: "agent" });
    expect(optimized.feasibility.percentage).toBeGreaterThan(before);
    expect(optimized.feasibility.percentage).toBeGreaterThanOrEqual(90);
    expect(optimized.changes.length).toBeGreaterThan(2);
  });

  it("keeps agent proposals isolated, comparable, and human-gated", async () => {
    const protectedTaskIds = service.getTasks().filter((task) => task.title.includes("WebMCP")).map((task) => task.id);
    await service.updateDecisionPolicy({
      negotiationActive: true,
      deadlineLocked: true,
      budgetLocked: true,
      minimumProbabilityLocked: true,
      minimumProbability: 90,
      preservedTaskIds: protectedTaskIds,
      maximumRiskLocked: true,
      maximumRisk: 0.25,
      preference: "balanced",
    }, { actor: "human" });
    const liveBefore = service.getState()!;
    const proposals = await service.generatePlanProposals({ modes: ["safest", "fastest", "highest-impact"], seed: 20_260_903, iterations: 1_000 }, { actor: "agent" });

    expect(service.getTasks()).toEqual(liveBefore.tasks);
    expect(service.getState()!.planRevision).toBe(liveBefore.planRevision);
    expect(new Set(proposals.map((proposal) => proposal.basePlanRevision))).toEqual(new Set([liveBefore.planRevision]));
    expect(new Set(proposals.map((proposal) => `${proposal.simulationSeed}:${proposal.simulationIterations}`))).toEqual(new Set(["20260903:1000"]));
    expect(service.comparePlanProposals(proposals.map((proposal) => proposal.id)).proposals).toHaveLength(3);
    await expect(service.updateTask({ taskId: liveBefore.tasks[1]!.id, confidence: 0.95 }, { actor: "agent" })).rejects.toMatchObject({ code: "conflict" });
    await expect(service.approvePlanProposal(proposals[0]!.id, { actor: "agent" })).rejects.toMatchObject({ code: "conflict" });
  });

  it("records a structured decision, atomically applies a valid proposal, and durably undoes it", async () => {
    await service.updateDecisionPolicy({
      negotiationActive: true,
      deadlineLocked: true,
      budgetLocked: true,
      minimumProbabilityLocked: true,
      minimumProbability: 90,
      capacityLocked: false,
      preservedTaskIds: service.getTasks().filter((task) => task.title.includes("WebMCP")).map((task) => task.id),
      maximumRiskLocked: true,
      maximumRisk: 0.25,
    }, { actor: "human" });
    const before = service.getState()!;
    const proposals = await service.generatePlanProposals({}, { actor: "agent" });
    const decision = await service.requestHumanDecision({
      question: "Which tradeoff should THREAD prioritize?",
      context: "All options use identical simulation evidence.",
      proposalIds: proposals.map((proposal) => proposal.id),
      idempotencyKey: "decision-lifecycle",
    }, { actor: "agent" });
    const valid = proposals.find((proposal) => proposal.constraintChecks.every((check) => check.passed));
    expect(valid).toBeDefined();
    const option = decision.options.find((candidate) => candidate.proposalId === valid!.id)!;
    await service.answerHumanDecision({ decisionId: decision.id, optionId: option.id, customResponse: "Preserve the locked WebMCP scope." }, { actor: "human" });
    await service.approvePlanProposal(valid!.id, { actor: "human" });

    expect(service.getState()!.planRevision).toBe(before.planRevision + 1);
    expect(service.getPlanProposal(valid!.id).status).toBe("applied");
    expect(service.getActivity().some((event) => event.type === "proposal.applied" && event.evidence?.rollbackAvailable)).toBe(true);

    const reconstructed = new WorkspaceService(repository, workspaceId);
    await reconstructed.initialize();
    await reconstructed.undoProposalApplication({ actor: "human" });
    expect(reconstructed.getTasks()).toEqual(before.tasks);
    expect(reconstructed.getPlanProposal(valid!.id).status).toBe("rolled-back");
    expect(reconstructed.getState()!.lastProposalApplication).toBeNull();
  });

  it("rejects stale approval and preserves the live plan when an atomic batch is invalid", async () => {
    await service.updateDecisionPolicy({ negotiationActive: true, minimumProbabilityLocked: false }, { actor: "human" });
    const proposal = await service.createPlanProposal({ mode: "safest" }, { actor: "agent" });
    await service.updateTask({ taskId: service.getTasks()[1]!.id, confidence: 0.91 }, { actor: "human" });
    const changed = service.getState()!;
    await expect(service.approvePlanProposal(proposal.id, { actor: "human" })).rejects.toMatchObject({ code: "conflict" });
    expect(service.getTasks()).toEqual(changed.tasks);

    await service.updateDecisionPolicy({ negotiationActive: false }, { actor: "human" });
    const beforeInvalidBatch = service.getState()!;
    await expect(service.applyPlan([
      { type: "update_task", input: { taskId: beforeInvalidBatch.tasks[1]!.id, confidence: 0.99 } },
      { type: "create_dependency", input: { fromTaskId: beforeInvalidBatch.tasks.at(-1)!.id, toTaskId: beforeInvalidBatch.tasks[0]!.id } },
    ], { actor: "agent" })).rejects.toMatchObject({ code: "validation" });
    expect(service.getState()).toEqual(beforeInvalidBatch);
  });

  it("persists proposal workflow idempotency and rejects key reuse with different input", async () => {
    await service.updateDecisionPolicy({ negotiationActive: true }, { actor: "human" });
    const first = await service.createPlanProposal({ mode: "safest", iterations: 250, idempotencyKey: "proposal-key" }, { actor: "agent" });
    expect((await service.createPlanProposal({ mode: "safest", iterations: 250, idempotencyKey: "proposal-key" }, { actor: "agent" })).id).toBe(first.id);
    await expect(service.createPlanProposal({ mode: "fastest", iterations: 250, idempotencyKey: "proposal-key" }, { actor: "agent" })).rejects.toMatchObject({ code: "conflict" });

    const revised = await service.revisePlanProposal({ proposalId: first.id, customResponse: "Prioritize safety", idempotencyKey: "revision-key" }, { actor: "agent" });
    expect((await service.revisePlanProposal({ proposalId: first.id, customResponse: "Prioritize safety", idempotencyKey: "revision-key" }, { actor: "agent" })).revision).toBe(revised.revision);
    await expect(service.revisePlanProposal({ proposalId: first.id, customResponse: "Prioritize speed", idempotencyKey: "revision-key" }, { actor: "agent" })).rejects.toMatchObject({ code: "conflict" });
  });
});
