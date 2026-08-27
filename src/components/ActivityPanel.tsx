import { Bot, CloudOff, Filter, UserRound, Workflow, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useThread } from "../app/ThreadProvider";
import type { ActivityEvent, Actor } from "../domain/types";

type LedgerFilter = "all" | Actor;

export function ActivityPanel() {
  const { service, state, registration } = useThread();
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const [selected, setSelected] = useState<ActivityEvent | null>(null);
  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [selected]);
  const activity = (state?.activity ?? []).filter((event) => filter === "all" || event.actor === filter).slice(-18).reverse();
  const status = service.getAgentStatus();
  return (
    <section className="activity-panel glass-panel" aria-label="Decision ledger">
      <header>
        <div><p className="panel-kicker">DECISION LEDGER</p><h2>Provenance</h2></div>
        <div className="ledger-controls"><Filter size={12} /><label><span className="sr-only">Filter ledger by actor</span><select value={filter} onChange={(event) => setFilter(event.target.value as LedgerFilter)}><option value="all">All actors</option><option value="human">Human</option><option value="agent">Agent</option><option value="system">System</option></select></label></div>
        <span className={`agent-live ${status.busy ? "working" : ""} ${registration?.supported ? "" : "unavailable"}`}><span /> {status.busy ? "Agent working..." : registration?.supported ? "Agent connected" : "Manual demo mode"}</span>
      </header>
      <div className="activity-list">{activity.map((event) => { const Icon = event.type === "persistence.fallback" ? CloudOff : event.actor === "agent" ? Bot : event.actor === "human" ? UserRound : Workflow; return <button type="button" key={event.id} onClick={() => setSelected(event)} aria-label={`Inspect ${event.message}`}><span className={`activity-icon actor-${event.actor}`}><Icon size={14} /></span><span><b>{event.message}</b><small>{new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {event.actor}{event.evidence ? " · evidence" : ""}</small></span></button>; })}</div>
      {selected && <div className="modal-backdrop ledger-modal-backdrop" role="presentation" onMouseDown={() => setSelected(null)}><section className="modal-card ledger-modal" role="dialog" aria-modal="true" aria-labelledby="ledger-event-heading" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="panel-kicker">{selected.actor.toUpperCase()} · {selected.type}</p><h2 id="ledger-event-heading">{selected.message}</h2><p>{new Date(selected.createdAt).toLocaleString()}</p></div><button type="button" className="icon-button" aria-label="Close ledger event" autoFocus onClick={() => setSelected(null)}><X size={17} /></button></header>{selected.evidence && <dl className="ledger-evidence"><div><dt>Action</dt><dd>{selected.evidence.action}</dd></div><div><dt>Reason</dt><dd>{selected.evidence.reason}</dd></div>{selected.evidence.beforeSummary && <div><dt>Before</dt><dd>{selected.evidence.beforeSummary}</dd></div>}{selected.evidence.afterSummary && <div><dt>After</dt><dd>{selected.evidence.afterSummary}</dd></div>}<div><dt>Result</dt><dd><span className={`ledger-result ${selected.evidence.result}`}>{selected.evidence.result}</span>{selected.evidence.rollbackAvailable ? " · rollback available" : ""}</dd></div>{selected.evidence.simulation && <div><dt>Simulation</dt><dd>Seed {selected.evidence.simulation.seed.toLocaleString()} · {selected.evidence.simulation.iterations.toLocaleString()} iterations</dd></div>}</dl>}<details className="ledger-payload"><summary>Structured payload</summary><pre>{JSON.stringify(selected.payload, null, 2)}</pre></details></section></div>}
    </section>
  );
}
