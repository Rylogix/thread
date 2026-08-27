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

  it("makes duplicate create calls safe with an idempotency key", async () => {
    const first = await service.createTask({ title: "Idempotent task" }, { actor: "agent", idempotencyKey: "agent-call-1" });
    const second = await service.createTask({ title: "Different ignored payload" }, { actor: "agent", idempotencyKey: "agent-call-1" });
    expect(second.id).toBe(first.id);
    expect(service.getTasks().filter((task) => task.id === first.id)).toHaveLength(1);
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
});
