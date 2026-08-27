# Local setup and deployment

## Fresh clone

Requirements: Node.js 24 and pnpm 11.19.0.

```bash
git clone <public-repository-url>
cd thread
corepack install
corepack pnpm install --frozen-lockfile
corepack pnpm cf:types
corepack pnpm exec playwright install --with-deps chromium
corepack pnpm test:all
```

For the Vite-only browser experience, run `pnpm dev` and open `http://localhost:5173`. This mode deliberately uses browser-local persistence.

For the complete Worker and local D1 path:

```bash
pnpm build
pnpm db:migrate:local
pnpm cf:dev
```

Open `http://localhost:8787`. Local development requires no credentials or environment variables.

## Deploy a fork to Cloudflare

1. Authenticate Wrangler with the Cloudflare account that will own the deployment.
2. Create a D1 database with `pnpm exec wrangler d1 create thread-production`.
3. Replace the non-secret D1 binding ID and custom domain in `wrangler.jsonc` with resources owned by that account.
4. Keep non-secret configuration in `vars`. Add any future secret interactively with `pnpm exec wrangler secret put NAME`; never store a secret value in Git or Wrangler plaintext variables.
5. Run the complete local gate and dry run.
6. Apply migrations, then deploy.

```bash
pnpm test:all
pnpm cf:dry-run
pnpm exec wrangler d1 migrations apply thread-production --remote
pnpm exec wrangler deploy
```

The production configuration in this repository uses the canonical host `thread.rylogix.com` (singular). It does not configure or alter the plural `threads.rylogix.com` hostname.

## Post-deploy verification

```bash
curl --fail --show-error --include https://thread.rylogix.com/api/health
curl --fail --show-error --include https://thread.rylogix.com/debug/webmcp
```

Confirm that JSON responses have `Cache-Control: no-store`, static and API responses have the documented security headers, production assets contain no `.map` files, and WebMCP discovery reports the intended 46 tools.

The Worker currently requires no secret bindings. `pnpm exec wrangler secret list` should therefore return an empty list unless a fork deliberately adds a documented server-side integration.
