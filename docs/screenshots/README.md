# Submission screenshots

Regenerate captures from the final production build with `UPDATE_SCREENSHOTS=1 pnpm exec playwright test tests/e2e/visual.spec.ts tests/e2e/decision-room.spec.ts`; normal test runs verify the views without rewriting tracked evidence. Do not submit images from an earlier build.

The final submission set should make the negotiation workflow understandable without the video:

1. Seeded graph and 71.4% baseline
2. Decision Room with locked human requirements
3. Safest, Fastest, and Highest-impact comparison
4. Proposed graph diff and constraint evidence
5. Human decision card
6. Applied proposal with decision-ledger detail and rollback
7. WebMCP debugger showing 46 discovered tools
8. Responsive mobile Decision Room

Use 1440×900 or larger for desktop captures. Keep browser chrome, personal data, credentials, and unrelated notifications out of frame. Verify every displayed metric against the recorded workspace state before publishing.
