# THREAD submission package

## Devpost title

**THREAD — Negotiate the plan before the agent changes it**

## Tagline

THREAD turns project planning into a negotiated, executable contract: agents propose and simulate changes; humans decide what enters shared reality.

## Ready-to-paste description

AI can generate a plan in seconds. The difficult part is deciding which changes are safe to trust when deadlines, budgets, scope, and risk collide.

THREAD is an agent-human plan negotiation system built on a live dependency graph. A person first locks what cannot change: deadline, budget, minimum finish probability, available capacity, protected work, maximum acceptable risk, and an optimization preference. Through WebMCP, an agent can inspect that decision context and develop three executable alternatives—Safest, Fastest, and Highest-impact—without mutating the live workspace.

Each proposal contains structured operations with a reason for every change, added and removed graph elements, task and risk changes, before-and-after critical paths, probability, median, P80, P95, cost, preserved and violated constraints, the exact simulation seed and iteration count, expected upside, and explicit tradeoffs. The numbers come from THREAD’s deterministic CPM and seeded Monte Carlo engines, not generated prose.

The human compares proposals side by side. If optimization reaches a subjective fork, the agent creates a structured decision card with predicted effects. The human’s answer becomes shared state the agent can read before revising its recommendation. Crucially, the agent cannot approve its own proposal. Only an explicit human action revalidates and atomically applies the selected plan. The decision ledger records actor, reason, before/after evidence, result, and rollback availability, and the applied proposal can be undone.

THREAD also remains a complete manual planning application: people can edit a pan-and-zoom dependency graph, manage tasks, milestones, constraints, resources, and risks, detect cycles and conflicts, inspect bottlenecks and critical work, run reproducible simulations, and explore immutable what-if scenarios. UI actions and all 46 WebMCP tools use the same validated domain services, so the page and agent always share one state.

The no-signup seeded workspace starts at 71.4% on-time probability using seed `20,260,903`. The Decision Room makes the path toward 90% inspectable before it is real. Cloudflare Workers serve the React application and validated API, D1 persists anonymous workspaces, and local browser recovery keeps the demo usable if the network fails. No external model API or judge-owned key is required.

THREAD demonstrates a specific future for the agent-native web: the page is not merely an artifact an agent can edit. It is a place where a person and an agent negotiate evidence-backed changes, with human authority over the final transition.

## Why WebMCP

Without WebMCP, an agent would have to infer a complex graph, hidden constraints, simulation settings, proposal state, and human decisions from pixels. THREAD exposes those semantics directly through strict tools. The agent can read current evidence, create and compare proposals, ask a structured question, retrieve the human answer, and revise its recommendation while the human watches the same state update on the page.

WebMCP is also part of the safety design. There is deliberately no agent-callable approval tool. The protocol ends at recommendation; final application belongs to the human UI.

## Safe originality statement

> Unlike the visible OpenAI showcase examples, which primarily let an agent manipulate a shared artifact, THREAD makes the negotiation itself inspectable: constraints, structured operations, simulation evidence, graph diffs, approval, provenance, and rollback are first-class product objects.

This comparison is limited to the public descriptions visible in the [OpenAI WebMCP showcase](https://developers.openai.com/showcase) on August 27, 2026. The nearest published planning examples are [WanderNote](https://developers.openai.com/showcase/wandernote) and [Sunday Table](https://developers.openai.com/showcase/sunday-table); [Margin Editor](https://developers.openai.com/showcase/margin-editor) demonstrates distinct agent identity. The [Devpost entrant gallery](https://webmcp.devpost.com/project-gallery) was not yet published at audit time. THREAD makes no unsupported “first” claim. See [docs/COMPETITIVE_AUDIT.md](./docs/COMPETITIVE_AUDIT.md).

## Feature bullets

- Decision Room with human-locked deadline, budget, probability, capacity, scope, risk, and preference
- Deterministic Safest, Fastest, and Highest-impact proposals that do not mutate the live plan
- Structured operations, reasons, graph diffs, critical-path changes, simulation evidence, and constraint checks
- Side-by-side comparison and structured human decision cards
- Explicit human-only approval, atomic application, decision ledger, and rollback
- 46 imperative WebMCP tools registered on `document.modelContext`
- Shared application services for every UI and tool operation
- Interactive dependency graph with tasks, milestones, risks, resources, and constraints
- Seeded Monte Carlo simulation with probability, median, P80/P95, cost, and failure analysis
- Anonymous D1 persistence with browser-local recovery
- One-click judge seed, contextual guidance, manual fallback, reset, and WebMCP debugger

## Links

- Production domain: <https://thread.rylogix.com>
- WebMCP debugger: <https://thread.rylogix.com/debug/webmcp>
- Source repository: <https://github.com/rylogix/thread>
- Demo video: **add the public YouTube URL**

## Judging criteria mapping

The [official rules](https://webmcp.devpost.com/rules) weight all four criteria equally. WebMCP Leverage is also the first tie-breaker.

| Criterion | Judge-visible evidence |
|---|---|
| WebMCP Leverage | A coherent multi-step protocol over real page state: context → three deterministic proposals → comparison → structured human question → answer → revision. Forty-six strict tools use shared services, annotations and idempotency match behavior, and approval is intentionally outside agent authority. |
| Execution | A complete no-signup graph workspace and Decision Room, deterministic engines, explicit loading/error/offline states, atomic application and rollback, D1/local persistence, debugger, responsive UI, and automated verification commands. |
| Potential Impact | Project leads and delivery teams can let an agent explore schedule, cost, scope, capacity, and risk without surrendering control of the committed plan. Exact operations, evidence, provenance, and reversal address the practical trust barrier to agent-assisted planning. |
| Creativity & Ambition | The core object is not an AI-generated plan or an agent-editable board. It is an executable proposal evaluated against a human-defined contract, negotiated through structured decisions, and committed only with consent. |

## What was built during the challenge period

Keep dated commits beginning August 25, 2026 visible. The repository should make the challenge-period work easy to audit:

- WebMCP registration and strict tool contracts
- Shared UI/tool application-service boundary
- Dependency graph, planning engines, scenarios, and seeded judge workspace
- Cloudflare Worker, D1 persistence, and local recovery
- DecisionPolicy, proposal snapshots, deterministic proposal generation, graph diffing, and constraint evaluation
- Decision Room comparison, human decision cards, approval boundary, decision ledger, and rollback
- Eight negotiation tools added to the original 38-tool workspace surface
- Tests, debugger cases, accessibility work, documentation, and submission assets

If any component predates August 25, describe that component and its dated WebMCP extension explicitly rather than implying the entire project is new.

## Technical highlights

- React, TypeScript, Vite, Tailwind CSS, React Flow, and Zod
- Cloudflare Worker static assets, validated API, D1, and versioned migrations
- Bound D1 statements, body-size limit, CSP, anti-framing, and browser security headers
- Strict state and tool schemas; missing references and cyclic graphs rejected
- Mulberry32 simulation seed `20,260,903`; maximum 5,000 iterations
- Plan revision checks, idempotent proposal/decision mutations, atomic apply, and full rollback
- No built-in chatbot, separate backend server, external AI API, auth wall, or judge-owned key

## Official submission constraints

- **Conservative deadline:** September 3, 2026 at **1:00 p.m. PT / 4:00 p.m. ET**. The OpenAI landing page displays a later time, but the Devpost Official Rules specify 1:00 p.m. PT and state that the rules control conflicts.
- Working live URL accessible in ChatGPT’s in-app browser or supported Chrome
- Public GitHub, GitLab, or Bitbucket repository containing all required source, assets, and instructions
- Open-source license visible and detected in the repository’s About area
- Public YouTube video under three minutes, with audio, showing the functioning project and WebMCP use
- English submission materials, or English translations
- Free, unrestricted judge access through the judging period, which ends September 21 at 5:00 p.m. PT
- Clear dated evidence for meaningful WebMCP work completed after August 25 at 11:00 a.m. PT

Judges are not required to test the app; the description, images, video, and repository must communicate the complete case independently.

## Final judging checklist

Do not check an item until it has been verified against the final submission commit and deployment.

Local verification on August 27, 2026: the complete gate passed 36 unit/integration tests and four local browser journeys. Reverify the production-only D1 journey after the final deployment.

### Compliance

- [ ] Devpost registration and submission completed before September 3 at 1:00 p.m. PT
- [ ] Public repository opens in a signed-out browser
- [ ] MIT license is detected and visible in the repository About section
- [x] README documents setup, architecture, tools, tests, and challenge-period work
- [x] Repository history clearly dates challenge-period implementation
- [x] All submission copy is in English
- [ ] App will remain free and accessible through September 21 at 5:00 p.m. PT

### Final product verification

- [x] Final commit passes typecheck, unit/integration tests, production build, and browser tests
- [ ] Production deployment is built from the final public commit
- [x] `https://thread.rylogix.com`, `/api/health`, and `/debug/webmcp` respond from a clean browser
- [ ] Final D1 migrations are applied and an isolated create/read round trip plus delete rejection passes
- [x] WebMCP discovery reports exactly 46 intended tools with correct annotations
- [x] Malformed proposal input and idempotent retries behave as documented
- [x] UI and WebMCP proposal state remain synchronized after refresh
- [x] No proposal changes the live graph before explicit human approval
- [x] Atomic apply, decision ledger, and rollback pass in the final browser build
- [x] Forced-offline local recovery and seeded reset pass
- [x] Desktop and mobile layouts, keyboard focus, labels, contrast, and reduced motion are visually inspected

### Demo and submission assets

- [ ] Public YouTube video is under three minutes, has clear audio, and contains no unlicensed media
- [x] The 90-second script in [DEMO.md](./DEMO.md) shows baseline, locks, three proposals, a human answer, approval, ledger, and rollback
- [x] Text and metrics remain readable at normal playback size
- [x] Screenshots show the Decision Room, proposal comparison, changed graph, and decision ledger
- [x] Devpost description is mapped to all four criteria
- [ ] Live, source, video, and debugger links are tested after pasting
