import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceService } from "../src/domain/workspaceService";
import { MemoryWorkspaceRepository } from "../src/persistence/repository";
import { buildThreadTools, executeThreadTool, registerThreadTools, THREAD_TOOL_COUNT } from "../src/webmcp/registerTools";

const workspaceId = "40000000-0000-4000-8000-000000000004";
let service: WorkspaceService;

beforeEach(async () => {
  service = new WorkspaceService(new MemoryWorkspaceRepository(), workspaceId);
  await service.initialize();
  await service.resetDemo({ actor: "system" });
});

afterEach(() => {
  Object.defineProperty(document, "modelContext", { configurable: true, value: undefined });
});

describe("WebMCP imperative registration", () => {
  it("defines the complete unique strict tool suite", () => {
    const tools = buildThreadTools(service);
    expect(tools).toHaveLength(THREAD_TOOL_COUNT);
    expect(new Set(tools.map((tool) => tool.name))).toHaveLength(THREAD_TOOL_COUNT);
    expect(tools.every((tool) => tool.inputSchema.additionalProperties === false)).toBe(true);
    expect(tools.find((tool) => tool.name === "get_workspace")?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((tool) => tool.name === "create_task")?.annotations?.readOnlyHint).toBe(false);
    expect(tools.filter((tool) => tool.category === "analysis")).toHaveLength(6);
    expect(tools.filter((tool) => tool.category === "negotiation")).toHaveLength(8);
    expect(tools.some((tool) => tool.name.includes("approve"))).toBe(false);
  });

  it("feature-detects unsupported browsers without breaking manual state", async () => {
    Object.defineProperty(document, "modelContext", { configurable: true, value: undefined });
    const report = await registerThreadTools(service);
    expect(report.supported).toBe(false);
    expect(report.attempted).toBe(THREAD_TOOL_COUNT);
    expect(service.getTasks().length).toBeGreaterThan(0);
  });

  it("registers tools through document.modelContext and verifies getTools", async () => {
    const registered: WebMCPToolDefinition[] = [];
    Object.defineProperty(document, "modelContext", { configurable: true, value: {
      registerTool: vi.fn(async (tool: WebMCPToolDefinition) => { registered.push(tool); }),
      getTools: vi.fn(async () => registered.map((tool) => ({ ...tool, inputSchema: JSON.stringify(tool.inputSchema) }))),
      ontoolchange: null,
    } satisfies ModelContext });
    const report = await registerThreadTools(service);
    expect(report.registered).toHaveLength(THREAD_TOOL_COUNT);
    expect(report.nativeTools).toHaveLength(THREAD_TOOL_COUNT);
    expect(registered[0]!.name).toBe("get_workspace");
    report.dispose();
  });

  it("rejects malformed tool input and unknown IDs with compact errors", async () => {
    const malformed = await executeThreadTool(service, "create_task", { title: "", estimatedHours: -1 });
    const unknown = await executeThreadTool(service, "get_task", { taskId: crypto.randomUUID() });
    const unexpected = await executeThreadTool(service, "get_decision_context", { surprise: true });
    expect(malformed.isError).toBe(true);
    expect(unknown.isError).toBe(true);
    expect(unknown.content[0]!.text).toContain("Unknown task");
    expect(unknown.structuredContent).toMatchObject({ error: { code: "not-found" } });
    expect(unexpected).toMatchObject({ isError: true, structuredContent: { error: { code: "validation" } } });
  });

  it("executes every registered tool contract against real structured state", async () => {
    const failures: Array<{ name: string; error: string }> = [];
    const names = buildThreadTools(service).map((tool) => tool.name);
    for (const name of names) {
      const repository = new MemoryWorkspaceRepository();
      const isolated = new WorkspaceService(repository, workspaceId);
      await isolated.initialize();
      await isolated.resetDemo({ actor: "system" });
      const state = isolated.getState()!;
      let input: Record<string, unknown> = {};
      switch (name) {
        case "get_task": input = { taskId: state.tasks[0]!.id }; break;
        case "get_activity": input = { limit: 5 }; break;
        case "get_decision_context": break;
        case "create_plan_proposal": {
          await isolated.updateDecisionPolicy({ negotiationActive: true }, { actor: "human" });
          input = { mode: "safest", seed: 20_260_903, iterations: 250, idempotencyKey: "contract-proposal" };
          break;
        }
        case "get_plan_proposals": input = { status: "ready" }; break;
        case "get_plan_proposal": {
          await isolated.updateDecisionPolicy({ negotiationActive: true }, { actor: "human" });
          const proposal = await isolated.createPlanProposal({ mode: "safest", iterations: 250 }, { actor: "agent" });
          input = { proposalId: proposal.id };
          break;
        }
        case "compare_plan_proposals": {
          await isolated.updateDecisionPolicy({ negotiationActive: true }, { actor: "human" });
          const proposals = await isolated.generatePlanProposals({ modes: ["safest", "fastest"], iterations: 250 }, { actor: "agent" });
          input = { proposalIds: proposals.map((proposal) => proposal.id) };
          break;
        }
        case "revise_plan_proposal": {
          await isolated.updateDecisionPolicy({ negotiationActive: true }, { actor: "human" });
          const proposal = await isolated.createPlanProposal({ mode: "safest", iterations: 250 }, { actor: "agent" });
          input = { proposalId: proposal.id, preference: "safety", customResponse: "Keep protected scope." };
          break;
        }
        case "request_human_decision": {
          await isolated.updateDecisionPolicy({ negotiationActive: true }, { actor: "human" });
          const proposals = await isolated.generatePlanProposals({ modes: ["safest", "fastest"], iterations: 250 }, { actor: "agent" });
          input = { question: "Which plan should be revised?", proposalIds: proposals.map((proposal) => proposal.id) };
          break;
        }
        case "get_human_decisions": input = { status: "open" }; break;
        case "create_task": input = { title: "Contract task", estimatedHours: 1 }; break;
        case "create_milestone": input = { title: "Contract milestone" }; break;
        case "create_constraint": input = { type: "scope", title: "Contract constraint", value: true, hard: false, description: "Contract" }; break;
        case "create_dependency": {
          const task = await isolated.createTask({ title: "Dependency target" }, { actor: "system" });
          input = { fromTaskId: state.tasks[0]!.id, toTaskId: task.id };
          break;
        }
        case "create_resource": input = { name: "Contract resource", type: "person", capacity: 2, cost: 0 }; break;
        case "create_risk": input = { taskId: null, title: "Contract risk", probability: 0.2, impact: 0.3, mitigation: "Test" }; break;
        case "create_scenario": input = { name: "Contract scenario" }; break;
        case "update_task": input = { taskId: state.tasks[1]!.id, confidence: 0.8 }; break;
        case "move_task": input = { taskId: state.tasks[1]!.id, x: 100, y: 200 }; break;
        case "prioritize_task": input = { taskId: state.tasks[1]!.id, priority: "high" }; break;
        case "update_constraint": input = { constraintId: state.constraints[0]!.id, title: "Updated contract" }; break;
        case "resolve_risk": input = { riskId: state.risks[0]!.id }; break;
        case "complete_task": input = { taskId: state.tasks[1]!.id }; break;
        case "run_simulation": input = { iterations: 50, seed: 20_260_903 }; break;
        case "compare_scenarios": input = { scenarioIds: [state.scenarios[0]!.id] }; break;
        case "apply_plan": input = { operations: [{ type: "update_workspace", input: { budget: 49 } }] }; break;
        case "optimize_plan": input = { targetProbability: 90, preserveTaskIds: [] }; break;
        case "rollback_last_agent_action": await isolated.updateTask({ taskId: state.tasks[1]!.id, confidence: 0.9 }, { actor: "agent" }); break;
        case "remove_low_priority_task": {
          const task = await isolated.createTask({ title: "Low scope", priority: "low" }, { actor: "system" });
          input = { taskId: task.id };
          break;
        }
        case "apply_scenario": input = { scenarioId: state.scenarios[0]!.id }; break;
        case "discard_scenario": input = { scenarioId: state.scenarios[0]!.id }; break;
      }
      const output = await executeThreadTool(isolated, name, input);
      if (output.isError) failures.push({ name, error: output.content[0]?.text ?? "Unknown error" });
    }
    expect(failures).toEqual([]);
    expect(names).toHaveLength(THREAD_TOOL_COUNT);
  }, 20_000);

  it("keeps proposal creation idempotent and blocks direct agent mutation after locks activate", async () => {
    await service.updateDecisionPolicy({ negotiationActive: true }, { actor: "human" });
    const input = { mode: "safest", iterations: 250, idempotencyKey: "durable-retry" };
    const first = await executeThreadTool(service, "create_plan_proposal", input);
    const second = await executeThreadTool(service, "create_plan_proposal", input);
    expect(second.isError).not.toBe(true);
    expect((first.structuredContent as { id: string }).id).toBe((second.structuredContent as { id: string }).id);

    const blocked = await executeThreadTool(service, "update_task", { taskId: service.getTasks()[1]!.id, confidence: 0.99 });
    expect(blocked).toMatchObject({ isError: true, structuredContent: { error: { code: "conflict" } } });
  });
});
