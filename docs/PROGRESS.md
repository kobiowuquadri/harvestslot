# Progress log (resumable checkpoint)

## Environment facts (build machine)
- Windows 11, Node 24.16.0, pnpm 10.34.6, git 2.54. 4 CPU cores.
- **No Docker, no WSL distribution, no native PostgreSQL/Redis.** Real PostgreSQL 18 runs via `embedded-postgres` (verified: starts, `btree_gist` exclusion constraints work).
- Redis/MinIO/Mailpit are not available on this host → BullMQ, S3 and SMTP paths cannot be exercised here unless binaries are obtained; development fallbacks are used and labelled.

## Current phase
Phase 1 — Foundation (started 2026-10-23).

## Log
- 2026-10-23: Read spec. Audited repo (only the spec file). Checked toolchain and current package versions/peer deps. Wrote ARCHITECTURE.md, DOMAIN_AND_STATE_MACHINES.md, IMPLEMENTATION_STATUS.md, DECISIONS.md.

## Next concrete task
Scaffold workspace root (package.json, pnpm-workspace.yaml, tsconfig base, eslint), packages (config, contracts, db, core), install dependencies.
