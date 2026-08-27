import { describe, expect, it, vi } from "vitest";
import { createDemoWorkspace } from "../src/domain/seed";
import { BrowserWorkspaceRepository } from "../src/persistence/repository";

const workspaceId = "30000000-0000-4000-8000-000000000003";

describe("browser persistence fallback", () => {
  it("saves locally before a failed remote request and restores the snapshot", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => { throw new TypeError("offline"); });
    const repository = new BrowserWorkspaceRepository(localStorage, fetcher, 20);
    const state = createDemoWorkspace(workspaceId);
    const result = await repository.save(state);
    expect(result.mode).toBe("local");
    const restored = await repository.load(workspaceId);
    expect(restored?.workspace.objective).toBe(state.workspace.objective);
    expect(restored?.storageMode).toBe("local");
  });

  it("prefers newer local work and conservatively reconciles it to the API", async () => {
    const remote = createDemoWorkspace(workspaceId);
    remote.workspace.updatedAt = "2026-08-27T13:00:01.000Z";
    const local = createDemoWorkspace(workspaceId);
    local.workspace.objective = "Newer local objective";
    local.workspace.updatedAt = "2026-08-27T14:00:00.000Z";
    localStorage.setItem(`thread.workspace.${workspaceId}`, JSON.stringify(local));
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => init?.method === "PUT" ? new Response("{}", { status: 200 }) : Response.json(remote));
    const repository = new BrowserWorkspaceRepository(localStorage, fetcher, 50);
    const restored = await repository.load(workspaceId);
    expect(restored?.workspace.objective).toBe("Newer local objective");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
