# THREAD architecture

## System boundary

THREAD separates reasoning, computation, and authority. ChatGPT reasons about possible plans. The site owns validated structured state, deterministic calculations, persistence, visualization, and the decision ledger. The human owns the transition from a proposal into the live plan.

```text
Browser
  React UI ───────────────┐
  WebMCP tool callbacks ──┼─> WorkspaceService ─> planning engine
                         │          │
                         │          ├─> proposal snapshots and evidence
                         │          ├─> human-only approval boundary
                         │          ├─> localStorage (always first)
                         │          └─> /api/workspaces/:id
                         │                    │
                         └<─ subscriptions    └─> Cloudflare D1
```

## Domain model

`WorkspaceState` contains one normalized workspace and arrays of tasks, dependencies, constraints, resources, risks, scenarios, proposals, human decisions, and activity events. Stable UUIDs connect records. Scenarios and proposals hold immutable `PlanSnapshot` values and never include recursive history.

`DecisionPolicy` records the human's locked deadline, budget, minimum finish probability, capacity, protected task IDs, maximum risk, and optimization preference. A `PlanProposal` records its mode and revision, structured operations with reasons, immutable proposed plan, before/after evidence, graph diff, constraint checks, upside, tradeoffs, simulation seed and iterations, and the live plan revision from which it was derived. `HumanDecision` records a structured question, predicted effects, available options, and the human's selected or custom response.

The D1 schema mirrors the persisted collections. Indexes cover workspace foreign keys, task dependency ends, and reverse-chronological activity reads. Denormalized simulation and negotiation state lets the visible Decision Room survive refresh without replacing normalized task, dependency, constraint, resource, risk, and activity records.

## Live mutation flow

Direct manual and agent mutations call `WorkspaceService`:

1. Parse strict input with Zod.
2. Clone the last valid state.
3. Apply the operation to the clone.
4. Revalidate the complete state and graph invariants.
5. Write the clone to localStorage.
6. Attempt one normalized D1 transaction through the Worker API.
7. Publish the saved snapshot to React subscribers.
8. Record actor, action, reason, before/after evidence, and timestamp.
9. Return a compact structured result.

An exception before persistence leaves the visible state untouched. A D1 failure returns local mode and creates a visible fallback event. On load, THREAD compares timestamps; newer local work wins and is conservatively pushed upstream.

## Decision Room protocol

Proposal generation is isolated from the live mutation path:

1. Read the current plan revision and human-locked `DecisionPolicy`.
2. Clone the current `PlanSnapshot`.
3. Generate structured operations for Safest, Fastest, or Highest-impact mode through deterministic services.
4. Apply operations only to the clone; reject missing references, cycles, malformed values, and invariant failures.
5. Run the same critical-path and seeded Monte Carlo engines on the before and proposed snapshots.
6. Store the proposal, graph diff, per-constraint checks, reasons, and evidence without changing the live graph.

The agent may inspect context, create or revise proposals, compare them, request a structured human decision, and read the answer. It cannot approve or apply a proposal through WebMCP. Approval is an explicit UI action that checks the proposal's base revision, revalidates invariants and locked constraints, persists one complete state transition, and retains the prior snapshot for rollback. A stale proposal must be revised rather than silently rebased.

This boundary is product behavior, not presentation: a proposal can exist, be compared, answered, and rejected without any of its task or dependency operations entering shared reality.

## Planning engine

### Critical path

`calculateCriticalPath` rejects missing task references and cycles, topologically sorts tasks, performs forward and backward CPM passes, computes earliest/latest start and finish, calculates slack, and reconstructs an ordered longest path including zero-duration milestones.

### Conflicts and bottlenecks

Conflict detection covers cycles, missing task references, available hours, budget, resource capacity, deadline capacity, and completed milestones with unfinished prerequisites. Bottleneck scoring combines critical-path membership, transitive downstream count, estimate size, confidence, priority, and linked unresolved risk.

### Simulation, proposals, and feasibility

Monte Carlo sampling uses triangular task durations plus confidence and quantified risk. The documented Mulberry32 seed is `20,260,903`; iteration count is capped at 5,000. Each run returns on-time probability, median, P80, P95, cost range, failure frequencies, and variance contributors. Feasibility translates those results into a score, evidence, and structured recommendations.

Proposal modes use those same calculations. Safest emphasizes uncertainty and risk reduction while preserving scope. Fastest compresses the critical path and may remove only unprotected low-priority work. Highest-impact spends bounded budget headroom on the work with the strongest schedule influence. Proposal copy reports calculated evidence; it is not an LLM-generated substitute for engine output.

## WebMCP

`src/webmcp/registerTools.ts` is the only browser integration boundary. It feature-detects `document.modelContext`, registers after state is ready, passes an `AbortSignal` for lifecycle cleanup, verifies discovery with `getTools()`, and never manipulates the DOM. Tool output contains compact text and structured content.

All 46 tools call the same application services as the UI. The 8 Decision Room tools expose negotiation context, proposal generation and comparison, revision, and structured human questions. Read-only annotations match behavior, mutation schemas reject additional properties, and idempotency keys make proposal or decision retries safe. No tool bypasses validation or writes directly to React state.

Final proposal approval is intentionally absent from the registered tool catalog. This prevents an agent from converting its own recommendation into shared reality and makes consent visible, testable, and auditable.

## Decision ledger

Meaningful UI and tool actions record the actor and actor type, action, timestamp, reason, before/after summary, related proposal or decision, simulation evidence, result or error, and rollback availability. The ledger is an explanation and provenance surface; it excludes secrets and irrelevant implementation data.

## Worker and security

The module Worker uses generated `Env` binding types. `/api/health` and one workspace resource are the only public API routes; there is no workspace-list or public delete endpoint. Random anonymous workspace UUIDs are unlisted capability identifiers. Requests are rate-limited per Cloudflare location and client address, cross-site browser mutations are rejected, bodies are capped at 1 MiB, input is parsed with Zod, storage uses bound D1 statements, workspace IDs are redacted from logs, and errors use consistent non-sensitive JSON.

The Worker adds CSP, HSTS, anti-framing, MIME sniffing, referrer, opener, resource, and permissions headers to API and static assets. JSON responses are not cached and production source maps are disabled. No secrets or personal profile data are stored.

The approval boundary adds domain protections beyond HTTP hardening:

- Agent-authored proposals are inert snapshots until human approval.
- Locked requirements are structured checks, not prompt-only instructions.
- Proposal operations are strictly validated and cycle-checked before simulation and again before application.
- A base plan revision prevents applying evidence calculated against stale state.
- Idempotency keys prevent retried proposal and decision mutations from creating duplicates.
- Atomic application and retained prior state make a committed proposal reversible.

## Failure modes

| Failure | Behavior |
|---|---|
| WebMCP unsupported | Manual workspace and Decision Room remain functional; a precise support message is shown. |
| D1/API unavailable | Mutations remain in localStorage and are labeled `Local safe`. |
| Invalid/cyclic mutation | Operation is rejected before persistence or publication. |
| Duplicate create/dependency | Explicit IDs, idempotency keys, or edge uniqueness return the existing result. |
| Duplicate proposal/decision retry | The idempotency key returns the existing object without replaying the mutation. |
| Stale proposal | Approval is rejected; the agent must revise against the current plan revision. |
| Constraint violation | The violation stays visible on the proposal and cannot be silently ignored. |
| Agent attempts approval | No WebMCP approval tool exists; the Decision Room requires a human UI action. |
| UI render error | Error boundary preserves data and offers a clean reload. |
| Simulation overload | Strict input schema and the 5,000-iteration cap bound CPU work. |
