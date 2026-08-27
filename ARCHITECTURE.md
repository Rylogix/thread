# THREAD architecture

## System boundary

THREAD deliberately separates reasoning from computation. ChatGPT reasons about the plan. The site owns validated structured state, deterministic calculations, persistence, visualization, and activity history.

```text
Browser
  React UI ───────────────┐
  WebMCP tool callbacks ──┼─> WorkspaceService ─> planning engine
                         │          │
                         │          ├─> localStorage (always first)
                         │          └─> /api/workspaces/:id
                         │                    │
                         └<─ subscriptions    └─> Cloudflare D1
```

## Domain model

`WorkspaceState` contains one normalized workspace and arrays of tasks, dependencies, constraints, resources, risks, scenarios, and activity events. Stable UUIDs connect records. Scenarios hold immutable `PlanSnapshot` values and never include scenario or activity history recursively.

The D1 schema mirrors those collections in eight tables. Indexes cover workspace foreign keys, task dependency ends, and reverse-chronological activity reads. `last_simulation_json` is an intentionally denormalized workspace field so a visible forecast survives refresh.

## Atomic mutation flow

All manual and agent mutations call `WorkspaceService`:

1. Parse strict input with Zod.
2. Clone the last valid state.
3. Apply the operation to the clone.
4. Revalidate the complete state and graph invariants.
5. Write the clone to localStorage.
6. Attempt one normalized D1 transaction through the Worker API.
7. Publish the saved snapshot to React subscribers.
8. Record actor, action, before/after payload, and timestamp.
9. Return a compact structured tool result.

An exception before step 5 leaves the visible state untouched. A D1 failure returns local mode and creates a visible fallback event. On load, THREAD compares `workspace.updatedAt`; newer local work wins and is conservatively pushed upstream.

## Planning engine

### Critical path

`calculateCriticalPath` rejects missing task references and cycles, topologically sorts tasks, performs forward and backward CPM passes, computes earliest/latest start and finish, calculates slack, and reconstructs an ordered longest path including zero-duration milestones.

### Conflicts and bottlenecks

Conflict detection covers cycles, missing task references, available hours, budget, resource capacity, deadline capacity, and completed milestones with unfinished prerequisites. Bottleneck scoring combines critical-path membership, transitive downstream count, estimate size, confidence, priority, and linked unresolved risk.

### Simulation and feasibility

Monte Carlo sampling uses triangular task durations plus confidence and quantified risk. The documented Mulberry32 seed is `20,260,903`; iteration count is capped at 5,000. Each run returns on-time probability, median, P80, P95, cost range, failure frequencies, and variance contributors. Feasibility translates those results into a score, evidence, and structured recommendations.

## WebMCP

`src/webmcp/registerTools.ts` is the only browser integration boundary. It feature-detects `document.modelContext`, registers after state is ready, passes an `AbortSignal` for lifecycle cleanup, verifies discovery with `getTools()`, and never manipulates the DOM. Tool output contains compact text and structured content.

## Worker and security

The module Worker uses generated `Env` binding types. `/api/health` and one workspace resource are the only public API routes; there is no workspace-list endpoint. Requests are body-capped at 1 MiB, parsed with Zod, stored with bound D1 statements, and returned through consistent JSON errors.

The Worker adds CSP, anti-framing, MIME sniffing, referrer, opener, and permissions headers to API and static assets. No secrets or personal profile data are stored.

## Failure modes

| Failure | Behavior |
|---|---|
| WebMCP unsupported | Manual workspace stays fully functional; a precise support message is shown. |
| D1/API unavailable | Mutations remain in localStorage and are labeled `Local safe`. |
| Invalid/cyclic mutation | Operation is rejected before persistence or publication. |
| Duplicate create/dependency | Explicit IDs/idempotency keys or edge uniqueness return the existing result. |
| UI render error | Error boundary preserves data and offers a clean reload. |
| Simulation overload | Strict input schema and 5,000-iteration cap bound CPU work. |
