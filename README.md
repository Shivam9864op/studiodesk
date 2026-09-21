# StudioDesk

StudioDesk is a personal open-source demo for social-media teams. A client changes an offer, date or venue once, and the workspace identifies the affected captions, creatives and approvals. It also includes a small explainable report checker for Instagram and LinkedIn CSV exports.

**Personal project · Synthetic data · Not client work · No production claim**

## Why it exists

Campaign work is more than making a post. A venue, price or booking URL can appear in a poster, caption, story, ticket page and reminder. StudioDesk keeps those dependencies visible and makes approvals version-specific so a corrected asset cannot silently inherit an old approval.

## Demo flow

1. Open Overview for the fictional Café Monsoon launch.
2. Change Venue or Ticket price.
3. Open Change map to inspect affected assets. Overlapping dependencies are counted once.
4. Revise a copy asset, then approve the exact new version in Visual review or Client portal.
5. Paste a CSV in Reports and export a readable quality summary.

## Run locally

Requires Node.js 20+ and pnpm.

```bash
pnpm install
pnpm test
pnpm build
pnpm start
```

Then open `http://127.0.0.1:8789`. `pnpm dev` starts the Vite interface at port 5175 for UI work. `pnpm benchmark` runs a deterministic 10,000-record rule benchmark.

## HomeHost deployment

The included Compose file runs the Node service and PostgreSQL with persistent volumes. Keep the origin bound to localhost and expose it through an authenticated Cloudflare Tunnel. The service has a no-cache API policy, basic rate limiting, upload boundaries and a health endpoint. Review authentication, backups and privacy before accepting real client data.

```bash
docker compose up -d --build
curl http://127.0.0.1:8789/api/health
```

The public demo intentionally uses memory-backed synthetic state when no database is available. With `DATABASE_URL`, the demo state is persisted in PostgreSQL.

## Architecture

- `src/` — React + TypeScript interface with Overview, Calendar, Review, Change map, Reports and Client portal views.
- `server/domain.mjs` — pure, deterministic fact/dependency/version rules.
- `server/index.mjs` — small Node HTTP API, static serving, security headers and rate limit.
- `server/store.mjs` — memory fallback and PostgreSQL-backed state.
- `docs/` — recording notes and deployment boundaries.

## Boundaries

There is no social-platform login, scraper, publishing connection, payment flow or AI provider. Uploaded media is local and should be reviewed before production use. The fictional campaign must not be presented as a real café client or as evidence of customer results.

## License

MIT.
