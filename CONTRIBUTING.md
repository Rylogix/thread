# Contributing to THREAD

1. Create a focused branch.
2. Keep UI and WebMCP actions on `WorkspaceService`; do not duplicate mutation logic in components.
3. Add strict Zod validation and a tool-contract case for new operations.
4. Run `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e`.
5. If bindings change, run `pnpm cf:types` and commit configuration changes, not generated local secrets.

Changes to simulation formulas or seed data must preserve reproducibility and explain how the demo baseline is affected.
