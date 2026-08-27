# THREAD submission package

## Devpost title

**THREAD - Turn chaos into a plan you can actually finish**

## Tagline

An agent-native execution graph where humans and AI manipulate the same plan, simulate its future, and continuously replan.

## Ready-to-paste description

AI can generate a plan in seconds. The problem is that reality changes in minutes.

THREAD turns a plan into a shared computational workspace. A person edits a live dependency graph while ChatGPT inspects and changes the exact same structured state through 38 WebMCP tools. Both call one validated domain-service layer, so agent actions immediately appear in the graph, inspector, feasibility score, and activity timeline.

THREAD is not a chatbot or an AI wrapper. ChatGPT supplies reasoning; THREAD supplies persistent structured reality. Its deterministic engine rejects dependency cycles, computes CPM timing and slack, detects schedule/resource/budget conflicts, ranks bottlenecks, and runs a reproducible Monte Carlo forecast with median, P80, P95, cost range, failure sources, and variance drivers.

The one-click judge demo starts at 71.4% on-time probability from real task uncertainty and quantified risk. A transparent optimization sequence can raise the same seeded model above 90% without removing WebMCP functionality or breaking the $50 budget. Scenario snapshots compare futures side by side.

The application runs entirely on Cloudflare: one Worker serves the React/Vite SPA and a Zod-validated API backed by normalized D1 tables. No signup, external AI API, or judge-owned key is required. If D1 is unreachable, localStorage preserves the workspace, labels the fallback, and reconciles newer local work conservatively.

The result demonstrates the WebMCP thesis directly: the web page itself becomes the shared interface for human and agent collaboration.

## Feature bullets

- 38 interconnected imperative WebMCP tools on `document.modelContext`
- One shared service layer for human and agent operations
- Interactive pan/zoom/drag/connect dependency graph
- Real critical path, slack, conflicts, bottlenecks, and feasibility
- Seeded Monte Carlo simulation with P80/P95 and failure analysis
- Immutable What If? scenarios with side-by-side comparison
- Visible agent presence, node pulse, and timestamped activity
- Anonymous D1 persistence with browser-local failure fallback
- One-click judge seed, exact prompt copy, dependable reset
- Built-in WebMCP registration and operation debugger
- Responsive, keyboard-focused, reduced-motion visual system

## Links

- Live application: <https://thread.rylogix.com>
- WebMCP debugger: <https://thread.rylogix.com/debug/webmcp>
- Source repository: **add public GitHub URL after publishing**
- Demo video: **add final under-three-minute video URL**

## Judging criteria mapping

| Criterion | Evidence |
|---|---|
| WebMCP leverage | 38 discoverable tools share current page state, strict schemas, real mutations, read annotations, visible updates, activity, rollback, and debugger verification. |
| Execution | Polished graph workspace, responsive inspector, deterministic engine, D1/local fallback, Worker security, unit/tool/E2E coverage, seeded reset. |
| Potential impact | Constraint-aware replanning applies to hackathons, launches, research, events, coursework, and any deadline-driven project. |
| Creativity and ambition | Human and agent operate one computational dependency graph and compare simulated futures rather than exchange static chat plans. |

## Technical highlights

- React, TypeScript, Vite, Tailwind CSS, React Flow, Zod
- Cloudflare Worker static assets and D1
- 8 normalized tables plus versioned migrations and indexes
- 1 MiB API body cap, prepared statements, CSP and anti-framing headers
- Mulberry32 seed `20,260,903`; maximum 5,000 iterations
- No Next.js, separate backend, external AI API, or auth wall

## Final submission checklist

- [ ] Public GitHub repository URL added
- [x] MIT license included and detectable
- [x] Live `https://thread.rylogix.com` verified from a clean browser
- [x] `/api/health` and `/debug/webmcp` verified in production
- [x] Remote D1 migrations applied
- [x] Seeded demo loads without login
- [x] All 38 tool contracts covered by automated tests
- [x] Playwright judge journey passes locally
- [x] Playwright judge journey, forced-offline fallback, and isolated D1 round trip pass against production
- [ ] Demo video is 2:20-2:40 and under three minutes
- [ ] Captions and readable 1440p capture verified
- [ ] Devpost copy pasted and links checked
- [ ] Final frame uses the THREAD closing line

Only check production, repository, and video items after direct verification.

## Verified deployment record

Verified on August 27, 2026:

- Cloudflare Worker custom domain responds at `https://thread.rylogix.com`.
- `/`, `/debug/webmcp`, and `/api/health` return HTTP 200.
- Production responses include CSP, `X-Frame-Options: DENY`, and the configured security headers.
- All three D1 migrations are applied; Wrangler reports no pending migrations.
- An isolated workspace was created in D1, read back, deleted, and confirmed absent with HTTP 404.
- The complete judge path and browser-local fallback pass against the deployed application.
