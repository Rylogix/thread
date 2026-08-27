import { GitCompareArrows, Layers3, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useThread } from "../app/ThreadProvider";

export function ScenarioPanel({ open, onClose }: { open: boolean; onClose(): void }) {
  const { service, state } = useThread();
  const [comparisons, setComparisons] = useState<Awaited<ReturnType<typeof service.compareScenarios>>>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setBusy(true); void service.compareScenarios().then(setComparisons).finally(() => setBusy(false)); } }, [open, state?.scenarios.length]);
  if (!open || !state) return null;
  const create = async () => { await service.createScenario({ name: `Snapshot ${state.scenarios.length + 1}`, description: "Captured from the live workspace." }, { actor: "human" }); };
  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation"><section className="modal-card scenario-modal" role="dialog" aria-modal="true" aria-labelledby="scenario-heading" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><p className="panel-kicker">WHAT IF?</p><h2 id="scenario-heading">Compare futures, not guesses.</h2><p>Every card is an immutable snapshot evaluated by the same seeded engine.</p></div><button className="icon-button" onClick={onClose} aria-label="Close scenarios"><X /></button></header>
      <div className="scenario-actions"><button className="secondary-button" onClick={() => void create()}><Plus size={15} /> Snapshot current plan</button><span><GitCompareArrows size={15} /> Seed 20,260,903 · 750 iterations each</span></div>
      <div className="scenario-grid" data-testid="scenario-grid">{busy ? <p>Running reproducible comparisons...</p> : comparisons.map((comparison) => { const scenario = state.scenarios.find((item) => item.id === comparison.scenarioId)!; return <article key={comparison.scenarioId} className="scenario-card"><div className="scenario-card-top"><Layers3 /><span>{scenario.name}</span></div><strong>{Math.round(comparison.simulation.onTimeProbability)}%</strong><span className="scenario-label">finish probability</span><div className="scenario-bar"><span style={{ width: `${comparison.simulation.onTimeProbability}%` }} /></div><dl><div><dt>P80</dt><dd>{comparison.simulation.p80CompletionHours}h</dd></div><div><dt>P95</dt><dd>{comparison.simulation.p95CompletionHours}h</dd></div><div><dt>Cost max</dt><dd>${comparison.simulation.projectedCostRange.maximum}</dd></div></dl><p>{scenario.description}</p><div className="scenario-card-actions"><button onClick={() => void service.applyScenario(scenario.id, { actor: "human" }).then(onClose)}>Apply</button><button className="icon-button" onClick={() => void service.discardScenario(scenario.id, { actor: "human" })} aria-label={`Discard ${scenario.name}`}><Trash2 size={14} /></button></div></article>; })}</div>
    </section></div>
  );
}
