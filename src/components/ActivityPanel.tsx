import { Bot, CloudOff, UserRound, Workflow } from "lucide-react";
import { useThread } from "../app/ThreadProvider";

export function ActivityPanel() {
  const { service, state, registration } = useThread();
  const activity = state?.activity.slice(-12).reverse() ?? [];
  const status = service.getAgentStatus();
  return (
    <section className="activity-panel glass-panel" aria-label="Agent and human activity">
      <header><div><p className="panel-kicker">LIVE COLLABORATION</p><h2>Activity</h2></div><span className={`agent-live ${status.busy ? "working" : ""} ${registration?.supported ? "" : "unavailable"}`}><span /> {status.busy ? "Agent working..." : registration?.supported ? "Agent connected" : "Agent tools unavailable"}</span></header>
      <div className="activity-list">{activity.map((event) => { const Icon = event.type === "persistence.fallback" ? CloudOff : event.actor === "agent" ? Bot : event.actor === "human" ? UserRound : Workflow; return <article key={event.id}><span className={`activity-icon actor-${event.actor}`}><Icon size={14} /></span><div><b>{event.message}</b><small>{new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {event.actor}</small></div></article>; })}</div>
    </section>
  );
}
