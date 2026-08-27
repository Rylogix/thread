# THREAD WebMCP contract

THREAD uses the current imperative browser API:

```ts
await document.modelContext.registerTool(tool, { signal });
const discovered = await document.modelContext.getTools();
```

It never uses deprecated `navigator.modelContext`. Registration occurs only after the active workspace is ready. Every input schema is an object with `additionalProperties: false`.

## Common result

Successful tools return:

```json
{
  "content": [{ "type": "text", "text": "compact JSON" }],
  "structuredContent": { "tool-specific": "result" }
}
```

Invalid input or an unknown ID rejects cleanly; the debug runner exposes the error as `{ "isError": true, "content": [...] }`. Read tools set `readOnlyHint: true`. All other tools set it to `false`. THREAD-generated output sets `untrustedContentHint: false`.

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

## Example chain

Agent request:

> Optimize this project so I have at least a 90% chance of submitting on time. Keep the budget under $50 and don't remove WebMCP functionality.

Representative calls:

```json
{"tool":"get_workspace","arguments":{}}
{"tool":"run_simulation","arguments":{"iterations":1000,"seed":20260903}}
{"tool":"find_bottlenecks","arguments":{}}
{"tool":"optimize_plan","arguments":{"targetProbability":90,"preserveTaskIds":["<read-tools-id>","<mutation-tools-id>"]}}
{"tool":"run_simulation","arguments":{"iterations":1500,"seed":20260903}}
```

`optimize_plan` is not a fake AI call. It applies a deterministic heuristic: reduce estimates and upper bounds for ranked bottlenecks, raise confidence, lower quantified mitigated-risk probability, then run the same simulation again. The agent remains responsible for deciding whether those structured changes match the user's intent.

## Debugging

Open `/debug/webmcp` to see support, planned/native counts, categories, schemas, annotations, registration errors, read tests, mutation tests, the full test chain, and reset. Native discovery uses `document.modelContext.getTools()` when available.
