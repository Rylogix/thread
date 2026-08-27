# THREAD demo runbook

Target duration: **2:30**. Keep the browser at 1440x900 or larger and zoom at 100%.

## Before recording

1. Open [https://thread.rylogix.com](https://thread.rylogix.com) in a WebMCP-capable ChatGPT desktop browser or supported Chrome.
2. Click **Try the Hackathon Demo**.
3. Click **Reset Demo** once to guarantee the seed.
4. Confirm the graph shows 14 tasks, the debugger shows 38 planned tools, budget is $50, and the starting feasibility is approximately 71-72%.
5. Copy the built-in agent prompt.

## Timed story

### 0:00-0:15 - The problem

Voiceover: “AI can give you a plan. But the moment reality changes, that plan becomes another piece of text.”

Show the hero for three seconds, then enter the seeded workspace.

### 0:15-0:30 - The shared workspace

Voiceover: “THREAD gives humans and agents the same structured workspace.”

Point out the objective, 71-72% feasibility, $50 budget, critical path, graph, inspector, and live activity.

### 0:30-0:45 - Human control

Drag **Demo script**, change an estimate, and connect or edit a task. Show the activity event and automatic persistence.

### 0:45-1:45 - The money shot

Ask ChatGPT exactly:

> Open THREAD and optimize this project so I have at least a 90% chance of submitting on time. Keep the budget under $50 and don't remove WebMCP functionality.

Keep THREAD visible while the agent calls `get_workspace`, `run_simulation`, `find_bottlenecks`, `optimize_plan`, and `run_simulation` again. Narrate the visible node pulse, activity events, changed estimates/confidence, and the probability crossing 90%.

### 1:45-2:10 - Reality changes

Change **Available hours** to `24` in the left panel. Say: “I just lost time. Save the project.” Show conflict/feasibility changes and the agent using `replan_remaining_work` or explicit `apply_plan` operations.

### 2:10-2:25 - Verifiable tools

Open `/debug/webmcp`. Show the support card, 38-tool catalog, strict schemas, and **Run Full Test** result.

### 2:25-2:30 - Close

Final frame:

> THREAD  
> The web doesn't need agents that click better.  
> It needs websites that agents understand.

## Recovery plan

| Problem | Recovery |
|---|---|
| Agent tools unavailable | Show the precise fallback message, continue the manual demo, then use the debugger catalog. |
| D1/API issue | Point to `Local safe`; refresh to prove browser persistence, then continue. |
| Agent takes an unwanted action | Call `rollback_last_agent_action` or use Reset Demo. |
| Graph is off-screen | Use React Flow fit-view control. |
| Simulation result differs | Reset Demo and rerun with seed `20,260,903`; do not improvise input changes. |
| Time is running long | Skip scenario cards; keep the optimization chain and debugger. |

Never claim a production or tool verification result that is not visible during the recording.
