import { Braces, ChevronDown, Copy, GitCompareArrows, PanelLeft, PanelRight, PlayCircle, RefreshCw, Route, Sparkles } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useThread } from "../app/ThreadProvider";
import { DEMO_PROMPT } from "../domain/seed";
import { ActivityPanel } from "./ActivityPanel";
import { GraphPanel } from "./GraphPanel";
import { Inspector } from "./Inspector";
import { ObjectivePanel } from "./ObjectivePanel";
import { ScenarioPanel } from "./ScenarioPanel";
import { DecisionRoom } from "./DecisionRoom";

export function Workspace() {
  const { service, state, registration } = useThread();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCritical, setShowCritical] = useState(true);
  const [scenariosOpen, setScenariosOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [decisionRoomOpen, setDecisionRoomOpen] = useState(() => new URLSearchParams(window.location.search).has("decision-room"));
  const guidedDecisionDemo = new URLSearchParams(window.location.search).get("decision-room") === "guided";
  const result = state?.lastSimulation;
  const critical = useMemo(() => service.getCriticalPath(), [service, state?.workspace.updatedAt]);
  if (!state) return null;
  const runSimulation = async () => { setSimulating(true); try { await service.runSimulation({ iterations: 1_000 }, { actor: "human" }); setSimulationOpen(true); } finally { setSimulating(false); } };
  const reset = async () => { if (window.confirm("Reset THREAD to the known seeded demo? Current changes will be replaced.")) { await service.resetDemo({ actor: "human" }); setSelectedTaskId(null); } };
  const agentSupported = registration?.supported ?? Boolean(document.modelContext);
  const registeredCount = registration?.registered.length ?? 0;
  const openDecisionRoom = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("decision-room", "guided");
    window.history.replaceState({}, "", url);
    setDecisionRoomOpen(true);
  }, []);
  const closeDecisionRoom = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("decision-room");
    window.history.replaceState({}, "", url);
    setDecisionRoomOpen(false);
  }, []);
  return (
    <main className="workspace-shell">
      <nav className="workspace-nav" aria-label="Workspace navigation">
        <a className="brand" href="/"><img src="/thread-mark.svg" alt="" /><span>THREAD</span></a>
        <div className="workspace-title"><button aria-label="Choose workspace"><span>{state.workspace.name}</span><ChevronDown size={14} /></button><small>{critical.totalDuration}h critical path · {state.tasks.filter((task) => task.status === "done").length}/{state.tasks.length} complete</small></div>
        <div className="nav-actions">
          <button className="agent-pill" title={agentSupported ? `${registeredCount} tools registered` : "Manual demo mode is active; open in a WebMCP-capable browser for agent discovery."}><span className={`status-dot ${agentSupported ? "online" : "offline"}`} /><b>{agentSupported ? "Agent connected" : "Manual demo mode"}</b><small>{agentSupported ? `${registeredCount} tools` : "46 tools ready"}</small></button>
          <button className="icon-text-button decision-room-trigger" data-testid="open-decision-room" onClick={openDecisionRoom}><Sparkles size={15} /> Decision Room</button>
          <button className="icon-text-button mobile-only" onClick={() => setLeftOpen(true)}><PanelLeft size={16} /> Plan</button>
          <button className="icon-text-button mobile-only" onClick={() => setRightOpen(true)}><PanelRight size={16} /> Inspect</button>
          <button className="icon-text-button" onClick={() => setScenariosOpen(true)}><GitCompareArrows size={15} /> What If?</button>
          <button className="icon-text-button desktop-action" onClick={() => void navigator.clipboard.writeText(DEMO_PROMPT)}><Copy size={15} /> Prompt</button>
          <button className="icon-text-button" data-testid="run-simulation" disabled={simulating} onClick={() => void runSimulation()}><PlayCircle size={15} /> {simulating ? "Running..." : "Simulate"}</button>
          <a className="icon-button desktop-action" href="/debug/webmcp" aria-label="Open WebMCP debugger"><Braces size={17} /></a>
          <button className="icon-button" onClick={() => void reset()} aria-label="Reset demo"><RefreshCw size={17} /></button>
        </div>
      </nav>
      <div className="workspace-grid">
        <ObjectivePanel open={leftOpen} onClose={() => setLeftOpen(false)} />
        <GraphPanel selectedTaskId={selectedTaskId} onSelectTask={(id) => { setSelectedTaskId(id); if (id && window.innerWidth < 860) setRightOpen(true); }} showCritical={showCritical} onToggleCritical={() => setShowCritical((value) => !value)} />
        <Inspector selectedTaskId={selectedTaskId} open={rightOpen} onClose={() => setRightOpen(false)} />
        <ActivityPanel />
      </div>
      <ScenarioPanel open={scenariosOpen} onClose={() => setScenariosOpen(false)} />
      <DecisionRoom open={decisionRoomOpen} guided={guidedDecisionDemo} onClose={closeDecisionRoom} />
      {simulationOpen && result && <div className="modal-backdrop" role="presentation" onMouseDown={() => setSimulationOpen(false)}><section className="modal-card simulation-modal" role="dialog" aria-modal="true" aria-labelledby="simulation-heading" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="panel-kicker">SEE THE FUTURE</p><h2 id="simulation-heading">{result.onTimeProbability}% chance of finishing</h2><p>{result.iterations.toLocaleString()} deterministic iterations · seed {result.seed.toLocaleString()}</p></div><button className="secondary-button" onClick={() => setSimulationOpen(false)}>Close</button></header><div className="simulation-hero"><strong>{result.onTimeProbability}%</strong><div><span className="simulation-track"><i style={{ width: `${result.onTimeProbability}%` }} /></span><small>{result.onTimeProbability >= 90 ? "Plan is resilient" : "Plan needs intervention"}</small></div></div><div className="simulation-stats"><div><span>Median</span><b>{result.medianCompletionHours}h</b></div><div><span>P80</span><b>{result.p80CompletionHours}h</b></div><div><span>P95</span><b>{result.p95CompletionHours}h</b></div><div><span>Cost range</span><b>${result.projectedCostRange.minimum}-${result.projectedCostRange.maximum}</b></div></div><div className="simulation-columns"><div><h3><Route size={15} /> Failure sources</h3>{result.failureSources.slice(0, 4).map((source) => <p key={source.source}><span>{source.source}</span><b>{Math.round(source.frequency * 100)}%</b></p>)}</div><div><h3><Sparkles size={15} /> Variance drivers</h3>{result.varianceContributors.slice(0, 4).map((task) => <p key={task.taskId}><span>{task.title}</span><b>{task.score}</b></p>)}</div></div></section></div>}
    </main>
  );
}
