# THREAD WebMCP contract

THREAD uses the current imperative browser API:

```ts
await document.modelContext.registerTool(tool, { signal });
const discovered = await document.modelContext.getTools();
```

It never uses deprecated `navigator.modelContext`. Registration occurs only after the active workspace is ready. Every input schema is an object with `additionalProperties: false`.

The complete catalog contains 46 tools: 38 workspace, graph, planning, simulation, mutation, and scenario tools plus 8 Decision Room tools. The negotiation tools create and inspect inert proposal snapshots; they do not provide an agent-callable path to final approval.

## Common result

Successful tools return:

```json
{
  "content": [{ "type": "text", "text": "compact JSON" }],
  "structuredContent": { "tool-specific": "result" }
}
```

Invalid input or an unknown ID rejects cleanly; the debug runner exposes the error as `{ "isError": true, "content": [...] }`. Read tools set `readOnlyHint: true`. All other tools set it to `false`. THREAD-generated output sets `untrustedContentHint: false`.

Proposal and human-decision mutations accept idempotency keys so a retried agent call returns the existing object rather than duplicating it. Proposal results include the base plan revision, recorded simulation seed and iteration count, exact operations and reasons, before/after evidence, graph diff, and structured constraint checks.

## Tool catalog

`uuid` means a canonical UUID string. Omitted optional fields use documented service defaults.

| Tool | Category | Annotation | Strict input | Structured output |
|---|---|---|---|---|
| `get_workspace` | read | read only | `{}` | workspace, collection counts, storage mode, feasibility |
| `get_goal` | read | read only | `{}` | objective, deadline, available hours, budget |
| `get_tasks` | read | read only | `{}` | `Task[]` |
| `get_task` | read | read only | `{ taskId: uuid }` | task, incoming edges, outgoing edges |
| `get_constraints` | read | read only | `{}` | `Constraint[]` |
| `get_dependencies` | read | read only | `{}` | `Dependency[]` |
| `get_resources` | read | read only | `{}` | `Resource[]` |
| `get_risks` | read | read only | `{}` | `Risk[]` |
| `get_timeline` | read | read only | `{}` | tasks with CPM timings and slack |
| `get_critical_path` | read | read only | `{}` | ordered IDs/titles, duration, timings |
| `get_simulation_summary` | read | read only | `{}` | last visible `SimulationResult` or `null` |
| `get_activity` | read | read only | `{ limit?: integer 1..200 }` | newest activity events |
| `get_decision_context` | decision | read only | `{}` | human-locked policy, live revision, protected tasks, baseline evidence |
| `create_plan_proposal` | decision | mutates proposal state | `{ mode: safest\|fastest\|highest-impact, name?, seed?, iterations?: integer 250..5000, idempotencyKey? }` | deterministic proposal with operations, diff, checks, and evidence |
| `get_plan_proposals` | decision | read only | `{ status? }` | proposal summaries and statuses |
| `get_plan_proposal` | decision | read only | `{ proposalId: uuid }` | complete proposal and inspectable evidence |
| `compare_plan_proposals` | decision | read only | `{ proposalIds: uuid[2..4] }` | aligned probability, P80/P95, cost, scope, risk, and constraint deltas |
| `revise_plan_proposal` | decision | mutates proposal state | `{ proposalId, preserveTaskIds?, preference?, customResponse?, idempotencyKey? }` | new deterministic revision against current decision context |
| `request_human_decision` | decision | mutates decision state | `{ question, proposalIds: uuid[2..4], context?, idempotencyKey? }` | structured decision card with predicted option effects |
| `get_human_decisions` | decision | read only | `{ status? }` | open and answered human decisions |
| `create_task` | create | mutates | `{ title, id?, description?, status?, priority?, estimatedHours?, minimumHours?, maximumHours?, confidence?, cost?, x?, y?, idempotencyKey? }` | created task |
| `create_milestone` | create | mutates | `{ title, description?, priority?, x?, y? }` | zero-duration milestone |
| `create_constraint` | create | mutates | `{ type, title, value, hard, description }` | created constraint |
| `create_dependency` | create | mutates | `{ fromTaskId, toTaskId, id? }` | cycle-safe dependency |
| `create_resource` | create | mutates | `{ name, type, capacity, cost }` | created resource |
| `create_risk` | create | mutates | `{ taskId: uuid|null, title, probability: 0..1, impact: 0..1, mitigation }` | created risk |
| `create_scenario` | create | mutates | `{ name, description? }` | immutable scenario snapshot |
| `update_task` | modify | mutates | `{ taskId, title?, description?, status?, priority?, estimatedHours?, minimumHours?, maximumHours?, confidence?, cost? }` | updated task |
| `move_task` | modify | mutates | `{ taskId, x, y }` | moved task |
| `prioritize_task` | modify | mutates | `{ taskId, priority }` | updated task |
| `update_constraint` | modify | mutates | `{ constraintId, type?, title?, value?, hard?, description? }` | updated constraint |
| `resolve_risk` | modify | mutates | `{ riskId, mitigation? }` | resolved risk |
| `complete_task` | modify | mutates | `{ taskId }` | completed task |
| `calculate_critical_path` | analysis | read only | `{}` | fresh CPM result |
| `detect_conflicts` | analysis | read only | `{}` | typed conflict list |
| `find_bottlenecks` | analysis | read only | `{}` | ranked tasks with scores and signals |
| `run_simulation` | analysis | mutates | `{ iterations?: integer 50..5000, scenarioId?: uuid, seed?: integer }` | simulation result; current runs publish to UI |
| `compare_scenarios` | analysis | read only | `{ scenarioIds?: uuid[] }` | scenario simulations and feasibility |
| `calculate_feasibility` | analysis | read only | `{}` | percentage, explanation, positives, failures, recommendations |
| `apply_plan` | high-level | mutates | `{ operations: PlanOperation[1..25] }` | applied count and final state |
| `optimize_plan` | high-level | mutates | `{ targetProbability?: 50..99, preserveTaskIds?: uuid[] }` | transparent changes and recalculated feasibility |
| `replan_remaining_work` | high-level | mutates | `{}` | topological order and critical path |
| `rollback_last_agent_action` | high-level | mutates | `{}` | restored workspace snapshot |
| `remove_low_priority_task` | modify | mutates | `{ taskId?: uuid }` | removed task and edge IDs; critical tasks rejected |
| `apply_scenario` | scenario | mutates | `{ scenarioId: uuid }` | live workspace using the snapshot |
| `discard_scenario` | scenario | mutates | `{ scenarioId: uuid }` | discarded scenario ID |

### Approval boundary

`approve_plan_proposal` is deliberately **not** a WebMCP tool. Creating, comparing, revising, or rejecting a recommendation is distinct from committing it. Only the human Decision Room UI can approve a proposal; application then rechecks its base plan revision, graph invariants, and locked requirements before one atomic persisted transition. The retained prior snapshot powers rollback.

## Example chain

After the person locks deadline, budget, minimum probability, capacity, protected WebMCP tasks, and maximum risk, the agent request is:

> Use THREAD's locked constraints to create Safest, Fastest, and Highest-impact proposals that target at least a 90% chance of finishing on time. Preserve all WebMCP functionality. Do not apply anything; ask me when a subjective tradeoff needs my decision.

Representative calls:

```json
{"tool":"get_decision_context","arguments":{}}
{"tool":"create_plan_proposal","arguments":{"mode":"safest","seed":20260903,"iterations":1000,"idempotencyKey":"demo-safest-v1"}}
{"tool":"create_plan_proposal","arguments":{"mode":"fastest","seed":20260903,"iterations":1000,"idempotencyKey":"demo-fastest-v1"}}
{"tool":"create_plan_proposal","arguments":{"mode":"highest-impact","seed":20260903,"iterations":1000,"idempotencyKey":"demo-impact-v1"}}
{"tool":"compare_plan_proposals","arguments":{"proposalIds":["<safest-id>","<fastest-id>","<highest-impact-id>"]}}
{"tool":"request_human_decision","arguments":{"proposalIds":["<safest-id>","<fastest-id>"],"question":"Preserve all polish or maximize deadline probability?","idempotencyKey":"demo-decision-v1"}}
```

Proposal creation is not a fake AI call. Each mode applies deterministic, validated operations to a cloned plan and runs the same CPM and Monte Carlo engines used by the live workspace. The agent reasons over that evidence; it does not invent the outcome. After the human answers any tradeoff, the agent may revise a proposal. Only the human can approve it.

## Debugging

Open `/debug/webmcp` to see support, planned/native counts, all 46 tools, categories, schemas, annotations, registration errors, read tests, malformed-input rejection, proposal mutations, UI synchronization, rollback, the full test chain, and reset. Native discovery uses `document.modelContext.getTools()` when available.
