# THREAD 90-second demo

The competition permits a public YouTube video under three minutes. This script tells the complete product story in **1:30**, leaving recording margin without diluting the core interaction.

## Before recording

Use a WebMCP-capable ChatGPT desktop browser or supported Chrome at 1440×900 or larger and 100% zoom.

1. Open [https://thread.rylogix.com](https://thread.rylogix.com).
2. Enter the seeded demo and reset it once.
3. Confirm the starting probability displays **71.4%** with seed `20,260,903`.
4. Confirm the graph is legible, the Decision Room is empty, and no decision is left answered from a prior take.
5. Confirm `/debug/webmcp` discovers 46 tools and the proposal workflow before recording; do not spend video time on the debugger unless the agent flow fails.
6. Close notifications, use only owned visuals, and do not add copyrighted music.

## Exact actions and narration

### 0:00–0:08 — The problem

**Action:** Show the hero, then click **Try the agent negotiation demo**.

**Narration:** “Agents can rewrite a task board. The harder problem is deciding which changes a human should trust.”

### 0:08–0:18 — Shared reality

**Action:** Land on the seeded graph. Point to the 71.4% finish probability, critical path, budget, and risks.

**Narration:** “THREAD is a live dependency graph with critical-path analysis and a reproducible Monte Carlo forecast. This plan has only a 71.4 percent chance of finishing on time.”

### 0:18–0:30 — Human guardrails

**Action:** Open the Decision Room. Lock the deadline, $50 budget, 90% minimum probability, available capacity, maximum risk, and the WebMCP tasks that must be preserved.

**Narration:** “First, I define the contract: deadline, budget, capacity, acceptable risk, target probability, and work the agent is not allowed to cut.”

### 0:30–0:43 — Agent proposals, not edits

**Action:** Give the agent this prompt while THREAD stays visible:

> Use THREAD's locked constraints to create Safest, Fastest, and Highest-impact proposals that target at least a 90% chance of finishing on time. Preserve all WebMCP functionality. Do not apply anything; ask me when a subjective tradeoff needs my decision.

Watch the three proposal cards appear. Keep the live graph visible and unchanged.

**Narration:** “Through WebMCP, the agent reads those locks and creates three executable proposals. Nothing has changed in the live plan.”

### 0:43–0:57 — Inspectable evidence

**Action:** Compare the proposal cards. Hover or select the changed graph, probability, P80/P95, cost, scope, critical path, and constraint checks. Briefly expose one operation reason.

**Narration:** “Every option contains exact operations and reasons, a graph diff, constraint checks, and before-and-after simulation using the recorded seed. These outcomes come from THREAD’s deterministic engine, not generated claims.”

### 0:57–1:07 — Negotiate the subjective choice

**Action:** Open the agent’s decision card—such as preserving polish versus maximizing schedule margin—and select one option or enter a short custom answer. Show the proposal revision.

**Narration:** “When the tradeoff is subjective, the agent has to ask. My answer becomes shared state it can read and use to revise the plan.”

### 1:07–1:20 — Human approval

**Action:** Select the best constraint-passing proposal and click **Approve and apply**. Show the live graph diff resolving and the feasibility update.

**Narration:** “The agent cannot approve its own recommendation. I choose. THREAD revalidates the proposal and applies it atomically; only now does it enter shared reality.”

### 1:20–1:27 — Provenance and reversal

**Action:** Open the newest decision-ledger record, expose its reason and simulation evidence, then click **Undo applied proposal**. Show the graph and probability return.

**Narration:** “The decision ledger records who did what, why, and with which evidence. The entire approved change is reversible.”

### 1:27–1:30 — Close

**Action:** End on the Decision Room and THREAD mark.

**Narration:** “THREAD turns planning into a negotiated, executable contract between a human and an agent.”

## What must be visible

- The 71.4% baseline and recorded seed
- Locked human requirements
- Three materially different proposals
- Unchanged live graph before approval
- At least one graph or metric difference with its reason
- A structured human decision and resulting revision
- An explicit human approval action
- Updated live state, ledger evidence, and rollback

## Recovery plan

| Problem | Recovery |
|---|---|
| Agent tools unavailable | Show the support message, use the manual **Generate proposals** action, and narrate that UI and WebMCP call the same service. |
| Proposal takes too long | Reset, regenerate with the documented seed, and restart the take; do not splice incompatible states. |
| D1/API issue | Point to `Local safe`; the demo can continue from browser persistence. |
| A proposal violates a lock | Use it as evidence that violations are visible, then select a passing proposal. |
| Graph is off-screen | Use React Flow fit view before continuing. |
| Agent attempts direct application | Stop the take; approval must remain a visible human action. |

Never claim a tool, deployment, probability, or verification result that is not visible during the recording.
