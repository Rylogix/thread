import { AlertTriangle, CalendarClock, CloudOff, DollarSign, TimerReset } from "lucide-react";
import { useEffect, useState } from "react";
import { useThread } from "../app/ThreadProvider";

export function ObjectivePanel({ open, onClose }: { open: boolean; onClose(): void }) {
  const { service, state } = useThread();
  const feasibility = service.calculateFeasibility();
  const risks = [...(state?.risks ?? [])].filter((risk) => !risk.resolved).sort((a, b) => b.probability * b.impact - a.probability * a.impact).slice(0, 3);
  const [hours, setHours] = useState(state?.workspace.availableHours ?? 0);
  const [budget, setBudget] = useState(state?.workspace.budget ?? 0);
  useEffect(() => { if (state) { setHours(state.workspace.availableHours); setBudget(state.workspace.budget); } }, [state?.workspace.updatedAt]);
  if (!state) return null;
  const deadline = new Date(state.workspace.deadline);
  const remaining = Math.max(0, deadline.getTime() - Date.now());
  const days = Math.floor(remaining / 86_400_000);
  const hoursLeft = Math.floor((remaining % 86_400_000) / 3_600_000);
  const saveLimits = async () => { await service.updateWorkspace({ availableHours: hours, budget }, { actor: "human" }); };
  return (
    <aside className={`objective-panel glass-panel mobile-sheet ${open ? "sheet-open" : ""}`} aria-label="Objective and feasibility">
      <button className="sheet-close" onClick={onClose}>Close</button>
      <p className="panel-kicker">PRIMARY OBJECTIVE</p>
      <h2>{state.workspace.objective}</h2>
      <p className="muted-copy">{state.workspace.description}</p>
      <div className="feasibility-block">
        <div className="feasibility-ring" style={{ "--score": `${feasibility.percentage * 3.6}deg` } as React.CSSProperties}><strong data-testid="feasibility-score">{Math.round(feasibility.percentage)}%</strong><span>feasible</span></div>
        <p>{feasibility.explanation}</p>
      </div>
      <div className="metric-grid">
        <div><CalendarClock /><span>DEADLINE</span><strong>{deadline.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</strong><small>{days}d {hoursLeft}h left</small></div>
        <label><TimerReset /><span>AVAILABLE</span><input aria-label="Available hours" data-testid="available-hours" type="number" min="0" value={hours} onChange={(event) => setHours(event.target.valueAsNumber)} onBlur={() => void saveLimits()} /><small>hours remaining</small></label>
        <label><DollarSign /><span>BUDGET</span><input aria-label="Budget" type="number" min="0" value={budget} onChange={(event) => setBudget(event.target.valueAsNumber)} onBlur={() => void saveLimits()} /><small>${state.tasks.filter((task) => task.status !== "done").reduce((sum, task) => sum + task.cost, 0)} planned</small></label>
        <div><CloudOff /><span>STORAGE</span><strong>{state.storageMode === "remote" ? "D1 synced" : "Local safe"}</strong><small>{state.storageMode === "remote" ? "Cloudflare persistence" : "will retry automatically"}</small></div>
      </div>
      <div className="risk-list"><div className="section-heading"><span>TOP RISKS</span><b>{risks.length}</b></div>{risks.map((risk) => <button key={risk.id} className="risk-item"><AlertTriangle size={14} /><span><b>{risk.title}</b><small>{Math.round(risk.probability * 100)}% probability · {Math.round(risk.impact * 100)}% impact</small></span></button>)}</div>
    </aside>
  );
}
