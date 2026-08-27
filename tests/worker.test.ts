import { describe, expect, it } from "vitest";
import { createDemoWorkspace } from "../src/domain/seed";
import worker, { isCrossSiteMutation, pathForLogs, PUBLIC_REPOSITORY_URL, validateWorkspaceIntegrity } from "../worker/index";

const workspaceId = "70000000-0000-4000-8000-000000000007";

describe("Worker workspace integrity boundary", () => {
  it("redirects the canonical source route to the exact public repository", async () => {
    const assets = { fetch: () => Promise.reject(new Error("assets should not handle /repo")) };
    const env = { ASSETS: assets } as unknown as Env;
    const response = await worker.fetch(new Request("https://thread.rylogix.com/repo?ignored=1"), env);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(PUBLIC_REPOSITORY_URL);
    expect(PUBLIC_REPOSITORY_URL).toBe("https://github.com/rylogix/thread");
  });

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

  it("rejects cross-site browser mutations without blocking same-origin or non-browser clients", () => {
    const url = new URL("https://thread.rylogix.com/api/workspaces/70000000-0000-4000-8000-000000000007");
    expect(isCrossSiteMutation(new Request(url, { method: "PUT", headers: { Origin: "https://example.test" } }), url)).toBe(true);
    expect(isCrossSiteMutation(new Request(url, { method: "PUT", headers: { Origin: url.origin, "Sec-Fetch-Site": "same-origin" } }), url)).toBe(false);
    expect(isCrossSiteMutation(new Request(url, { method: "PUT" }), url)).toBe(false);
  });

  it("redacts anonymous workspace identifiers from application logs", () => {
    expect(pathForLogs(`/api/workspaces/${workspaceId}`)).toBe("/api/workspaces/:id");
    expect(pathForLogs("/api/health")).toBe("/api/health");
  });
});
