# Security policy

## Supported version

Security fixes are applied to the latest commit on `main`. Older commits and forks are not supported releases.

## Report a vulnerability privately

Do not open a public issue or pull request with vulnerability details, credentials, workspace identifiers, or reproduction data.

Use GitHub's **Security → Report a vulnerability** form for this repository. It creates a private vulnerability report visible only to repository maintainers. If that form is unavailable, contact the repository owner through their GitHub profile without including sensitive details in a public message.

Include the affected route or component, impact, minimal reproduction steps, and any suggested mitigation. Redact live secrets and personal data. Maintainers will acknowledge a report as soon as practical and coordinate disclosure after a fix is available.

## Scope and operational notes

- THREAD is a no-signup demonstration. Anonymous workspace UUIDs act as unlisted capability identifiers; do not share them when they contain private planning data.
- The API exposes no workspace-list operation and no public delete operation. Workspace requests are body-capped, schema-validated, cross-site browser mutations are rejected, and Worker rate limiting limits abuse.
- Production credentials, if added in the future, must be stored as Cloudflare encrypted secret bindings. Never commit `.env*`, `.dev.vars*`, authentication exports, database dumps, or browser storage.
- Do not test against data or infrastructure you do not own. Avoid denial-of-service testing against the production demonstration.
