import { workspaceStateSchema } from "../domain/schemas";
import type { SaveResult, WorkspaceState } from "../domain/types";

export interface WorkspaceRepository {
  load(workspaceId: string): Promise<WorkspaceState | null>;
  save(state: WorkspaceState): Promise<SaveResult>;
}

export const ANONYMOUS_WORKSPACE_KEY = "thread.anonymousWorkspaceId";

export function getAnonymousWorkspaceId(storage: Storage = window.localStorage): string {
  const existing = storage.getItem(ANONYMOUS_WORKSPACE_KEY);
  if (existing) return existing;
  const workspaceId = crypto.randomUUID();
  storage.setItem(ANONYMOUS_WORKSPACE_KEY, workspaceId);
  return workspaceId;
}

export class BrowserWorkspaceRepository implements WorkspaceRepository {
  constructor(
    private readonly storage: Storage = window.localStorage,
    private readonly fetcher: typeof fetch = window.fetch.bind(window),
    private readonly requestTimeoutMs = 2_500,
  ) {}

  async load(workspaceId: string): Promise<WorkspaceState | null> {
    const local = this.loadLocal(workspaceId);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await this.fetcher(`/api/workspaces/${workspaceId}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (response.status === 404) return local;
      if (!response.ok) throw new Error(`Workspace API returned ${response.status}`);
      const payload: unknown = await response.json();
      const remote = workspaceStateSchema.parse(payload);
      const winner = !local || Date.parse(remote.workspace.updatedAt) >= Date.parse(local.workspace.updatedAt) ? remote : local;
      this.saveLocal({ ...winner, storageMode: winner === remote ? "remote" : "local" });
      if (winner === local) await this.tryRemoteSave(local);
      return { ...winner, storageMode: winner === remote ? "remote" : "local" };
    } catch {
      return local ? { ...local, storageMode: "local" } : null;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async save(state: WorkspaceState): Promise<SaveResult> {
    const localState = { ...state, storageMode: "local" as const };
    this.saveLocal(localState);
    const warning = await this.tryRemoteSave(state);
    if (warning) return { mode: "local", warning };
    const remoteState = { ...state, storageMode: "remote" as const };
    this.saveLocal(remoteState);
    return { mode: "remote" };
  }

  private loadLocal(workspaceId: string): WorkspaceState | null {
    const serialized = this.storage.getItem(this.key(workspaceId));
    if (!serialized) return null;
    try {
      return workspaceStateSchema.parse(JSON.parse(serialized));
    } catch {
      this.storage.removeItem(this.key(workspaceId));
      return null;
    }
  }

  private saveLocal(state: WorkspaceState): void {
    this.storage.setItem(this.key(state.workspace.id), JSON.stringify(state));
  }

  private async tryRemoteSave(state: WorkspaceState): Promise<string | null> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await this.fetcher(`/api/workspaces/${state.workspace.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Workspace API returned ${response.status}`);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Remote persistence unavailable";
    } finally {
      window.clearTimeout(timeout);
    }
  }

  private key(workspaceId: string): string {
    return `thread.workspace.${workspaceId}`;
  }
}

export class MemoryWorkspaceRepository implements WorkspaceRepository {
  private state: WorkspaceState | null = null;
  failRemote = false;

  async load(workspaceId: string): Promise<WorkspaceState | null> {
    return this.state?.workspace.id === workspaceId ? structuredClone(this.state) : null;
  }

  async save(state: WorkspaceState): Promise<SaveResult> {
    this.state = structuredClone({ ...state, storageMode: this.failRemote ? "local" : "remote" });
    return this.failRemote ? { mode: "local", warning: "Simulated D1 failure" } : { mode: "remote" };
  }

}
