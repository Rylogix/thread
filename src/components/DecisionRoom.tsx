import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Coins,
  GitCompareArrows,
  History,
  LockKeyhole,
  MessageSquareMore,
  PencilLine,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  UserRoundCheck,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useThread } from "../app/ThreadProvider";
import type { WorkspaceService } from "../domain/workspaceService";
import type {
  DecisionPolicy,
  HumanDecision,
  MutationMeta,
  PlanProposal,
  PlanSnapshot,
  ProposalMode,
} from "../domain/types";
import { ProposalDiffGraph } from "./ProposalDiffGraph";
import "./decision-room.css";

interface DecisionRoomProps {
  open: boolean;
  guided?: boolean;
  onClose(): void;
}

type DecisionRoomService = WorkspaceService & {
  updateDecisionPolicy?: (input: Partial<DecisionPolicy>, meta: MutationMeta) => Promise<unknown>;
  generatePlanProposals?: (input: { modes: ProposalMode[]; targetProbability: number }, meta: MutationMeta) => Promise<PlanProposal[]>;
  requestHumanDecision?: (input: { question: string; context: string; proposalIds: string[]; idempotencyKey?: string }, meta: MutationMeta) => Promise<HumanDecision>;
  revisePlanProposal?: (input: { proposalId: string; preserveTaskIds?: string[]; preference?: DecisionPolicy["preference"]; customResponse?: string }, meta: MutationMeta) => Promise<unknown>;
  rejectPlanProposal?: (proposalId: string, meta: MutationMeta) => Promise<unknown>;
  approvePlanProposal?: (proposalId: string, meta: MutationMeta) => Promise<unknown>;
  answerHumanDecision?: (input: { decisionId: string; selectedOptionId?: string; customResponse?: string }, meta: MutationMeta) => Promise<unknown>;
  undoProposalApplication?: (meta: MutationMeta) => Promise<unknown>;
};

const proposalModes: ProposalMode[] = ["safest", "fastest", "highest-impact"];
const focusableSelector = "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

function signed(value: number, suffix = ""): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}${suffix}`;
}

function modeIcon(mode: ProposalMode) {
  if (mode === "safest") return <ShieldCheck size={15} />;
  if (mode === "fastest") return <Zap size={15} />;
  return <Sparkles size={15} />;
}

function statusLabel(proposal: PlanProposal): string {
  if (proposal.status === "awaiting-decision") return "Needs your decision";
  if (proposal.status === "applied") return "Approved and applied";
  if (proposal.status === "rejected") return "Rejected by human";
  if (proposal.status === "rolled-back") return "Rolled back";
  return "Ready for human review";
}

function currentPlan(state: NonNullable<ReturnType<typeof useThread>["state"]>): PlanSnapshot {
  return {
    workspace: state.workspace,
    tasks: state.tasks,
    dependencies: state.dependencies,
    constraints: state.constraints,
    resources: state.resources,
    risks: state.risks,
  };
}

export function DecisionRoom({ open, guided = false, onClose }: DecisionRoomProps) {
  const { service, state } = useThread();
  const api = service as DecisionRoomService;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const revisionRef = useRef<HTMLTextAreaElement>(null);
  const contractRef = useRef<HTMLElement>(null);
  const workbenchRef = useRef<HTMLElement>(null);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [policyDraft, setPolicyDraft] = useState<DecisionPolicy | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revisionRequest, setRevisionRequest] = useState("");
  const [confirmation, setConfirmation] = useState<"approve" | "reject" | null>(null);
  const [selectedDecisionOption, setSelectedDecisionOption] = useState<string | null>(null);
  const [customDecision, setCustomDecision] = useState("");

  const proposals = state?.planProposals ?? [];
  const firstProposal = proposals[0];
  const selectedProposal = proposals.find((proposal) => proposal.id === selectedProposalId) ?? proposals.find((proposal) => proposal.status !== "rejected") ?? proposals[0] ?? null;
  const openDecision = state?.humanDecisions.find((decision) => decision.status === "open" && (!selectedProposal || decision.proposalIds.includes(selectedProposal.id))) ?? null;

  useEffect(() => {
    if (!state) return;
    setPolicyDraft(structuredClone(state.decisionPolicy));
  }, [state?.decisionPolicy]);

  useEffect(() => {
    if (!selectedProposalId && firstProposal) setSelectedProposalId(firstProposal.id);
    if (selectedProposalId && !proposals.some((proposal) => proposal.id === selectedProposalId)) setSelectedProposalId(proposals[0]?.id ?? null);
  }, [proposals, selectedProposalId]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => closeRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector)].filter((element) => element.offsetParent !== null);
      if (!focusable.length) { event.preventDefault(); dialogRef.current.focus(); return; }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose, open]);

  useEffect(() => {
    setConfirmation(null);
    setRevisionRequest("");
    setSelectedDecisionOption(null);
    setCustomDecision("");
  }, [selectedProposal?.id]);

  const call = async (label: string, method: (() => Promise<unknown>) | undefined, success: string) => {
    if (!method) { setError("Decision services are still initializing. Refresh after the negotiation service update is available."); return; }
    setBusy(label); setError(null); setNotice(null);
    try { await method(); setNotice(success); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  };

  const savePolicy = async () => {
    if (!policyDraft) return;
    const { updatedAt: _, ...policyInput } = policyDraft;
    await call("policy", api.updateDecisionPolicy ? () => api.updateDecisionPolicy!({ ...policyInput, negotiationActive: true }, { actor: "human" }) : undefined, "The contract is locked. Agent proposals must preserve it.");
  };

  const lockDemoContract = () => {
    if (!state || !policyDraft) return;
    const protectedIds = state.tasks.filter((task) => /webmcp/i.test(task.title)).map((task) => task.id);
    setPolicyDraft({
      ...policyDraft,
      negotiationActive: true,
      deadlineLocked: true,
      budgetLocked: true,
      minimumProbabilityLocked: true,
      minimumProbability: 90,
      capacityLocked: true,
      preservedTaskIds: protectedIds,
      maximumRiskLocked: true,
      maximumRisk: 0.4,
      preference: "balanced",
      updatedAt: new Date().toISOString(),
    });
    setNotice("Demo contract prepared. Review it, then lock constraints.");
  };

  const generateProposals = async () => {
    if (!policyDraft) return;
    if (!api.updateDecisionPolicy || !api.generatePlanProposals) { setError("Proposal generation is not available in the current service build."); return; }
    const { updatedAt: _, ...policyInput } = policyDraft;
    setBusy("generate"); setError(null); setNotice(null);
    try {
      await api.updateDecisionPolicy({ ...policyInput, negotiationActive: true }, { actor: "human" });
      const generated = await api.generatePlanProposals({ modes: proposalModes, targetProbability: policyDraft.minimumProbability }, { actor: "agent" });
      if (guided && api.requestHumanDecision && generated.length > 1) {
        await api.requestHumanDecision({
          question: "Which tradeoff should govern the final plan?",
          context: "Choose whether THREAD should prioritize maximum resilience, the shortest schedule, or the highest retained impact. Each option uses directly comparable simulation evidence.",
          proposalIds: generated.map((proposal) => proposal.id),
          idempotencyKey: `guided-decision-${state?.planRevision ?? 0}-${generated[0]!.id}`,
        }, { actor: "agent" });
      }
      requestAnimationFrame(() => {
        if (window.innerWidth <= 900) workbenchRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
        else contractRef.current?.scrollTo({ top: 0, behavior: "auto" });
      });
      setNotice(guided ? "Three proposals are ready. The agent needs one human tradeoff decision." : "Three simulated proposals are ready for human review.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  };

  const revise = async () => {
    if (!selectedProposal || !revisionRequest.trim()) { revisionRef.current?.focus(); return; }
    await call("revise", api.revisePlanProposal ? () => api.revisePlanProposal!({ proposalId: selectedProposal.id, preserveTaskIds: policyDraft?.preservedTaskIds, preference: policyDraft?.preference, customResponse: revisionRequest.trim() }, { actor: "agent" }) : undefined, "The agent revised its proposal. The live plan was not changed.");
  };

  const approve = async () => {
    if (!selectedProposal) return;
    await call("approve", api.approvePlanProposal ? () => api.approvePlanProposal!(selectedProposal.id, { actor: "human" }) : undefined, `${selectedProposal.name} entered shared reality. You can undo it from this room.`);
    setConfirmation(null);
  };

  const reject = async () => {
    if (!selectedProposal) return;
    await call("reject", api.rejectPlanProposal ? () => api.rejectPlanProposal!(selectedProposal.id, { actor: "human" }) : undefined, `${selectedProposal.name} was rejected. The live plan was not changed.`);
    setConfirmation(null);
  };

  const answerDecision = async (decision: HumanDecision) => {
    if (!selectedDecisionOption && !customDecision.trim()) { setError("Choose an option or provide a custom response."); return; }
    if (!api.answerHumanDecision || !api.revisePlanProposal || !api.updateDecisionPolicy) { setError("Decision services are still initializing."); return; }
    const option = decision.options.find((candidate) => candidate.id === selectedDecisionOption);
    const proposal = proposals.find((candidate) => candidate.id === (option?.proposalId ?? selectedProposal?.id));
    if (!proposal) { setError("Select a proposal option before continuing."); return; }
    const preference = ({ safest: "safety", fastest: "speed", "highest-impact": "impact" } as const)[proposal.mode];
    setBusy("decision"); setError(null); setNotice(null);
    try {
      await api.answerHumanDecision({ decisionId: decision.id, ...(selectedDecisionOption ? { selectedOptionId: selectedDecisionOption } : {}), ...(customDecision.trim() ? { customResponse: customDecision.trim() } : {}) }, { actor: "human" });
      await api.updateDecisionPolicy({ preference }, { actor: "human" });
      await api.revisePlanProposal({ proposalId: proposal.id, preference, preserveTaskIds: policyDraft?.preservedTaskIds, customResponse: customDecision.trim() || `Prioritize the selected ${proposal.name} tradeoff.` }, { actor: "agent" });
      setSelectedProposalId(proposal.id);
      setNotice("Your answer changed the agent proposal. Revision 2 was re-simulated against the same seed.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(null); }
  };

  const undo = async () => {
    await call("undo", api.undoProposalApplication ? () => api.undoProposalApplication!({ actor: "human" }) : undefined, "Applied proposal rolled back. The previous plan is live again.");
  };

  const activeStep = state?.lastProposalApplication ? 4 : openDecision ? 2 : proposals.length ? 3 : policyDraft?.negotiationActive ? 1 : 0;
  const allConstraintsPass = selectedProposal?.constraintChecks.every((check) => check.passed) ?? false;
  const proposalReady = selectedProposal?.status === "ready" && !openDecision;
  const appliedProposal = state?.lastProposalApplication ? proposals.find((proposal) => proposal.id === state.lastProposalApplication?.proposalId) : null;
  const afterProbability = selectedProposal?.after.simulation.onTimeProbability ?? 0;
  const beforeProbability = selectedProposal?.before.simulation.onTimeProbability ?? state?.lastSimulation?.onTimeProbability ?? 0;

  if (!open || !state || !policyDraft) return null;
  const plan = currentPlan(state);

  return (
    <div className="decision-room-layer" role="presentation">
      <div className={`decision-room ${proposals.length ? "has-proposals" : ""}`} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="decision-room-heading" tabIndex={-1}>
        <header className="decision-room-header">
          <div className="decision-room-title">
            <span className="decision-room-mark"><GitCompareArrows size={18} /></span>
            <div><p className="panel-kicker">{guided ? "90-SECOND GUIDED DEMO" : "AGENT–HUMAN NEGOTIATION"}</p><h2 id="decision-room-heading">Decision Room</h2></div>
          </div>
          <ol className="decision-steps" aria-label="Negotiation progress">
            {["Lock contract", "Compare proposals", "Human decision", "Shared reality"].map((label, index) => <li key={label} className={index < activeStep ? "complete" : index === activeStep ? "active" : ""}><span>{index < activeStep ? <Check size={11} /> : index + 1}</span>{label}</li>)}
          </ol>
          <div className="decision-header-actions">
            {state.lastProposalApplication && <button type="button" className="decision-undo-button" disabled={Boolean(busy)} onClick={() => void undo()}><RotateCcw size={14} /> Undo {appliedProposal?.name ?? "applied plan"}</button>}
            <button ref={closeRef} type="button" className="decision-close-button" onClick={onClose} aria-label="Close Decision Room"><X size={20} /></button>
          </div>
        </header>

        {(error || notice) && <div className={`decision-alert ${error ? "error" : "success"}`} role={error ? "alert" : "status"}>{error ? <CircleAlert size={15} /> : <CheckCircle2 size={15} />}<span>{error ?? notice}</span><button onClick={() => { setError(null); setNotice(null); }} aria-label="Dismiss message"><X size={13} /></button></div>}

        <div className="decision-room-grid">
          <aside ref={contractRef} className="decision-contract" aria-labelledby="contract-heading">
            <div className="decision-section-heading"><div><p className="panel-kicker">HUMAN CONTRACT</p><h3 id="contract-heading">What cannot change</h3></div><LockKeyhole size={18} /></div>
            <p className="decision-intro">Locked requirements are enforced by the same service used by the UI and agent tools.</p>
            <button type="button" className="decision-demo-contract" onClick={lockDemoContract}><Sparkles size={14} /> Prepare demo contract</button>
            <div className="contract-list">
              <ContractToggle label="Deadline" value={new Date(state.workspace.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })} checked={policyDraft.deadlineLocked} onChange={(checked) => setPolicyDraft({ ...policyDraft, deadlineLocked: checked })} icon={<Clock3 size={14} />} />
              <ContractToggle label="Budget" value={`$${state.workspace.budget}`} checked={policyDraft.budgetLocked} onChange={(checked) => setPolicyDraft({ ...policyDraft, budgetLocked: checked })} icon={<Coins size={14} />} />
              <ContractToggle label="Available capacity" value={`${state.workspace.availableHours}h`} checked={policyDraft.capacityLocked} onChange={(checked) => setPolicyDraft({ ...policyDraft, capacityLocked: checked })} icon={<Target size={14} />} />
              <ContractToggle label="Minimum finish probability" value={`${policyDraft.minimumProbability}%`} checked={policyDraft.minimumProbabilityLocked} onChange={(checked) => setPolicyDraft({ ...policyDraft, minimumProbabilityLocked: checked })} icon={<ShieldCheck size={14} />}>
                <input aria-label="Minimum finish probability" type="number" min="50" max="99" value={policyDraft.minimumProbability} onChange={(event) => setPolicyDraft({ ...policyDraft, minimumProbability: Number(event.target.value) })} />
              </ContractToggle>
              <ContractToggle label="Maximum risk" value={policyDraft.maximumRisk.toFixed(2)} checked={policyDraft.maximumRiskLocked} onChange={(checked) => setPolicyDraft({ ...policyDraft, maximumRiskLocked: checked })} icon={<CircleAlert size={14} />}>
                <input aria-label="Maximum risk score" type="number" min="0" max="1" step="0.05" value={policyDraft.maximumRisk} onChange={(event) => setPolicyDraft({ ...policyDraft, maximumRisk: Number(event.target.value) })} />
              </ContractToggle>
            </div>
            <details className="protected-scope" open={guided}>
              <summary><span><LockKeyhole size={13} /> Protected capabilities</span><b>{policyDraft.preservedTaskIds.length}</b></summary>
              <div>{state.tasks.filter((task) => task.kind !== "milestone").map((task) => <label key={task.id}><input type="checkbox" checked={policyDraft.preservedTaskIds.includes(task.id)} onChange={(event) => setPolicyDraft({ ...policyDraft, preservedTaskIds: event.target.checked ? [...policyDraft.preservedTaskIds, task.id] : policyDraft.preservedTaskIds.filter((id) => id !== task.id) })} /><span>{task.title}</span></label>)}</div>
            </details>
            <label className="decision-preference">Optimize for<select value={policyDraft.preference} onChange={(event) => setPolicyDraft({ ...policyDraft, preference: event.target.value as DecisionPolicy["preference"] })}><option value="balanced">Balanced tradeoffs</option><option value="safety">Safety</option><option value="speed">Speed</option><option value="impact">Impact</option><option value="cost">Lowest cost</option></select></label>
            <button type="button" className="secondary-button decision-save-contract" disabled={Boolean(busy)} onClick={() => void savePolicy()}><LockKeyhole size={14} /> {busy === "policy" ? "Locking…" : "Lock constraints"}</button>
            <button type="button" className="primary-button decision-generate" disabled={Boolean(busy)} onClick={() => void generateProposals()}><Bot size={15} /> {busy === "generate" ? "Simulating proposals…" : proposals.length ? "Regenerate 3 proposals" : `Ask agent for ≥${policyDraft.minimumProbability}%`}</button>
            <p className="human-gate-note"><UserRoundCheck size={14} /><span>Agents can propose and revise. <strong>Only you can approve.</strong></span></p>
          </aside>

          <main ref={workbenchRef} className="decision-workbench">
            <section className="proposal-strip" aria-labelledby="proposal-strip-heading">
              <div className="proposal-strip-heading"><div><p className="panel-kicker">SIMULATED OPTIONS</p><h3 id="proposal-strip-heading">Compare executable plans</h3></div>{firstProposal && <span>Same seed {firstProposal.simulationSeed.toLocaleString()} · {firstProposal.simulationIterations.toLocaleString()} runs</span>}</div>
              {proposals.length ? <div className="proposal-card-list">{proposals.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} selected={selectedProposal?.id === proposal.id} onSelect={() => setSelectedProposalId(proposal.id)} />)}</div> : <div className="proposal-empty"><span><Bot size={22} /></span><div><strong>The live plan stays untouched.</strong><p>Lock the human contract, then ask the agent to produce three deterministic proposals for comparison.</p></div><ArrowRight size={17} /></div>}
            </section>

            {selectedProposal ? <ProposalDiffGraph currentPlan={plan} proposal={selectedProposal} /> : <section className="proposal-graph-placeholder" aria-label="Proposal graph preview"><GitCompareArrows size={32} /><h3>Graph differences will appear here</h3><p>Added, removed, and modified work stays staged until explicit human approval.</p></section>}
          </main>

          <aside className="proposal-inspector" aria-labelledby="proposal-inspector-heading">
            {selectedProposal ? <>
              <div className="proposal-inspector-header">
                <div className={`proposal-agent-state status-${selectedProposal.status}`}><Bot size={14} /><span>Proposed by {selectedProposal.createdBy}</span><i />{statusLabel(selectedProposal)}</div>
                <h3 id="proposal-inspector-heading">{selectedProposal.name}</h3>
                <p>{selectedProposal.rationale}</p>
              </div>
              <div className="proposal-outcome">
                <div><span>Finish probability</span><strong>{beforeProbability}% <ArrowRight size={14} /> <em>{afterProbability}%</em></strong><small className={afterProbability >= beforeProbability ? "positive" : "negative"}>{signed(afterProbability - beforeProbability, " pts")}</small></div>
                <div><span>P80 schedule</span><strong>{selectedProposal.before.simulation.p80CompletionHours}h <ArrowRight size={14} /> <em>{selectedProposal.after.simulation.p80CompletionHours}h</em></strong><small className={selectedProposal.after.simulation.p80CompletionHours <= selectedProposal.before.simulation.p80CompletionHours ? "positive" : "negative"}>{signed(selectedProposal.after.simulation.p80CompletionHours - selectedProposal.before.simulation.p80CompletionHours, "h")}</small></div>
                <div><span>Cost maximum</span><strong>${selectedProposal.before.simulation.projectedCostRange.maximum} <ArrowRight size={14} /> <em>${selectedProposal.after.simulation.projectedCostRange.maximum}</em></strong><small>{signed(selectedProposal.after.simulation.projectedCostRange.maximum - selectedProposal.before.simulation.projectedCostRange.maximum, "")}</small></div>
              </div>
              <section className="constraint-checks"><h4><LockKeyhole size={13} /> Contract check <span className={allConstraintsPass ? "pass" : "fail"}>{selectedProposal.constraintChecks.filter((check) => check.passed).length}/{selectedProposal.constraintChecks.length}</span></h4>{selectedProposal.constraintChecks.map((check) => <div key={check.key} className={check.passed ? "passed" : "failed"} title={check.explanation}>{check.passed ? <CheckCircle2 size={13} /> : <XCircle size={13} />}<span><b>{check.label}</b><small>{check.actual} · required {check.required}</small></span></div>)}</section>
              {openDecision && <DecisionCard decision={openDecision} selectedOption={selectedDecisionOption} customResponse={customDecision} onSelect={setSelectedDecisionOption} onCustom={setCustomDecision} onSubmit={() => void answerDecision(openDecision)} busy={busy === "decision"} />}
              <details className="proposal-reasoning" open><summary><span><PencilLine size={13} /> Proposed operations</span><b>{selectedProposal.operations.length}</b></summary><div>{selectedProposal.operations.map((operation, index) => <article key={operation.id}><span>{index + 1}</span><div><b>{operation.type.replaceAll("_", " ")}</b><p>{operation.reason}</p></div></article>)}</div></details>
              <div className="proposal-tradeoffs"><div><h4><CheckCircle2 size={13} /> Expected upside</h4>{selectedProposal.expectedUpside.map((item) => <p key={item}>{item}</p>)}</div><div><h4><CircleAlert size={13} /> Tradeoffs</h4>{selectedProposal.tradeoffs.map((item) => <p key={item}>{item}</p>)}</div></div>
              <div className="revision-box"><label htmlFor="proposal-revision">Ask for a revision</label><textarea ref={revisionRef} id="proposal-revision" value={revisionRequest} onChange={(event) => setRevisionRequest(event.target.value)} placeholder="Preserve animations and recover the lost schedule margin…" maxLength={1_000} /><button type="button" className="secondary-button" disabled={Boolean(busy) || selectedProposal.status === "applied"} onClick={() => void revise()}><RefreshCw size={13} /> {busy === "revise" ? "Revising…" : "Request revision"}</button></div>
              {confirmation && <div className={`approval-confirmation ${confirmation}`} role="alertdialog" aria-labelledby="approval-confirmation-heading"><UserRoundCheck size={18} /><div><strong id="approval-confirmation-heading">{confirmation === "approve" ? "Enter this plan into shared reality?" : "Reject this proposal?"}</strong><p>{confirmation === "approve" ? `${selectedProposal.operations.length} operations will apply atomically. Probability changes ${beforeProbability}% → ${afterProbability}%.` : "The live plan will stay unchanged and the rejection will be recorded."}</p><div><button type="button" onClick={() => setConfirmation(null)}>Cancel</button><button type="button" disabled={Boolean(busy)} onClick={() => void (confirmation === "approve" ? approve() : reject())}>{confirmation === "approve" ? "Confirm approval" : "Confirm rejection"}</button></div></div></div>}
              <div className="human-approval-bar"><div><UserRoundCheck size={17} /><span><b>Human approval required</b><small>No agent tool can perform this step.</small></span></div><div><button type="button" className="reject-proposal-button" disabled={Boolean(busy) || selectedProposal.status === "applied" || selectedProposal.status === "rejected"} onClick={() => setConfirmation("reject")}><XCircle size={14} /> Reject</button><button type="button" className="approve-proposal-button" disabled={Boolean(busy) || !allConstraintsPass || !proposalReady} onClick={() => setConfirmation("approve")}><UserRoundCheck size={14} /> {openDecision ? "Answer decision first" : allConstraintsPass ? "Approve & apply" : "Resolve violations"}</button></div></div>
            </> : <div className="proposal-inspector-empty"><UserRoundCheck size={28} /><h3 id="proposal-inspector-heading">You remain in control</h3><p>Agent work appears here as evidence-backed proposals. Nothing changes until you approve one.</p></div>}
          </aside>
        </div>

        <footer className="decision-ledger-preview"><span><History size={14} /> Decision ledger</span><p>{state.activity[ state.activity.length - 1]?.message ?? "Every proposal, decision, result, and rollback is recorded."}</p><button type="button" onClick={onClose}>Open full ledger <ChevronRight size={13} /></button></footer>
      </div>
    </div>
  );
}

interface ContractToggleProps {
  label: string;
  value: string;
  checked: boolean;
  icon: ReactNode;
  children?: ReactNode;
  onChange(checked: boolean): void;
}

function ContractToggle({ label, value, checked, icon, children, onChange }: ContractToggleProps) {
  return <div className={`contract-row ${checked ? "locked" : ""}`}><label><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="contract-check">{checked ? <LockKeyhole size={10} /> : null}</span><i>{icon}</i><span><b>{label}</b><small>{checked ? "Inviolable" : "Flexible"}</small></span></label><div>{children ?? <strong>{value}</strong>}</div></div>;
}

function ProposalCard({ proposal, selected, onSelect }: { proposal: PlanProposal; selected: boolean; onSelect(): void }) {
  const probabilityDelta = proposal.after.simulation.onTimeProbability - proposal.before.simulation.onTimeProbability;
  const violations = proposal.constraintChecks.filter((check) => !check.passed).length;
  return <button type="button" className={`decision-proposal-card mode-${proposal.mode} ${selected ? "selected" : ""} status-${proposal.status}`} aria-pressed={selected} onClick={onSelect}><span className="proposal-mode-icon">{modeIcon(proposal.mode)}</span><span className="proposal-card-copy"><b>{proposal.name}</b><small>{violations ? `${violations} contract violation${violations === 1 ? "" : "s"}` : "All locks preserved"}</small></span><span className="proposal-card-score"><strong>{proposal.after.simulation.onTimeProbability}%</strong><small className={probabilityDelta >= 0 ? "positive" : "negative"}>{signed(probabilityDelta, " pts")}</small></span></button>;
}

function DecisionCard({ decision, selectedOption, customResponse, onSelect, onCustom, onSubmit, busy }: { decision: HumanDecision; selectedOption: string | null; customResponse: string; onSelect(value: string): void; onCustom(value: string): void; onSubmit(): void; busy: boolean }) {
  return <section className="human-decision-card" aria-labelledby={`decision-${decision.id}`}><div className="decision-card-label"><MessageSquareMore size={14} /> Agent needs your judgment</div><h4 id={`decision-${decision.id}`}>{decision.question}</h4><p>{decision.context}</p><div className="decision-options">{decision.options.map((option) => <label key={option.id} className={selectedOption === option.id ? "selected" : ""}><input type="radio" name={`decision-${decision.id}`} checked={selectedOption === option.id} onChange={() => onSelect(option.id)} /><span><b>{option.label}</b><small>{option.summary}</small><em>{option.predictedProbability}% finish · {option.predictedP80}h P80 · ${option.predictedCostMaximum} max</em></span></label>)}</div><label className="custom-decision">Custom response<textarea value={customResponse} onChange={(event) => onCustom(event.target.value)} placeholder="Describe the tradeoff you prefer…" maxLength={1_000} /></label><button type="button" className="decision-answer-button" disabled={busy} onClick={onSubmit}><UserRoundCheck size={13} /> {busy ? "Recording decision…" : "Record my decision"}</button></section>;
}
