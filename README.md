# GitHub AI Usage Dashboard

A minimal full-screen Node.js and TypeScript dashboard for the GitHub organization AI credits widget. It shows the current month's included credits, daily usage, model breakdown, and additional usage cost.

## Data source

The server calls GitHub's billing usage endpoints from the backend so the token never reaches the browser.

- Organization usage: `GET /organizations/{org}/settings/billing/ai_credit/usage`
- Enterprise usage: `GET /enterprises/{enterprise}/settings/billing/ai_credit/usage?organization={org}`
- Copilot billing seats: `GET /orgs/{org}/copilot/billing`

Set `INCLUDED_CREDITS_OVERRIDE=33000` when you want the denominator to match the GitHub billing UI exactly.

## Setup

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` and set `GITHUB_TOKEN`. The token needs access to the organization's billing usage. For fine-grained personal access tokens, GitHub documents the required org permission as Administration with read access. For classic personal access tokens, the org billing usage endpoints expect the `admin:org` scope; `read:org` is not enough. For enterprise billing endpoints, use a token from an enterprise admin or billing manager.

If the dashboard shows a 404 for `/organizations/{org}/settings/billing/ai_credit/usage`, the org is often billed through an enterprise instead of directly at org scope. In that case, set `GITHUB_ENTERPRISE` in `.env` to the enterprise slug and restart `npm run dev`.

## Development

```powershell
npm run dev
```

Open `http://localhost:5173`. The Vite client proxies `/api` to the Fastify server on port `8787`.

## Production

```powershell
npm run build
npm start
```

The production server serves the built client and API from `http://localhost:8787`.

## Checks

```powershell
npm run type-check
npm test
npm run build
```

No database is used for v1. The server keeps a small JSON cache at `data/cache.json` so the dashboard can keep showing stale data if GitHub is temporarily unavailable.