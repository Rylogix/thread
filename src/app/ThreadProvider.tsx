import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import type { WorkspaceState } from "../domain/types";
import { WorkspaceService } from "../domain/workspaceService";
import { BrowserWorkspaceRepository, getAnonymousWorkspaceId } from "../persistence/repository";
import { registerThreadTools, type RegistrationReport } from "../webmcp/registerTools";

interface ThreadContextValue {
  service: WorkspaceService;
  state: WorkspaceState | null;
  loading: boolean;
  registration: RegistrationReport | null;
}

const ThreadContext = createContext<ThreadContextValue | null>(null);

export function ThreadProvider({ children }: PropsWithChildren) {
  const service = useMemo(() => new WorkspaceService(new BrowserWorkspaceRepository(), getAnonymousWorkspaceId()), []);
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [registration, setRegistration] = useState<RegistrationReport | null>(null);

  useEffect(() => {
    const unsubscribe = service.subscribe(setState);
    void service.initialize().finally(() => setLoading(false));
    return unsubscribe;
  }, [service]);

  useEffect(() => {
    if (!state) return;
    let report: RegistrationReport | null = null;
    let cancelled = false;
    void registerThreadTools(service).then((next) => {
      if (cancelled) next.dispose();
      else { report = next; setRegistration(next); }
    });
    return () => {
      cancelled = true;
      report?.dispose();
    };
  }, [service, Boolean(state)]);

  return <ThreadContext.Provider value={{ service, state, loading, registration }}>{children}</ThreadContext.Provider>;
}

export function useThread(): ThreadContextValue {
  const context = useContext(ThreadContext);
  if (!context) throw new Error("useThread must be used inside ThreadProvider");
  return context;
}
