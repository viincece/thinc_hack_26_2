# Manex Quality Co-Pilot — Web

Next.js 16 (App Router, Turbopack) frontend for the interactive quality
co-pilot. Connects live to the Manex Hackathon PostgREST API.

## Stack

- **Next.js 16** + React 19 + TypeScript
- **Tailwind v4** with a small shadcn-style component layer (`src/components/ui/`)
- **Recharts** for Pareto, time-series, and control charts
- **@xyflow/react** for fault tree + BOM graph (not yet wired)
- **@anthropic-ai/sdk** for the agent loop (not yet wired)
- **lucide-react** icons

## Getting started

```bash
cd web
cp .env.example .env.local
# fill in MANEX_API_KEY and ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000.

## Layout

```
src/
  app/
    layout.tsx            root layout + Nav
    page.tsx              Overview (Pareto + recent defects)
    incidents/            list + detail
    initiatives/          Kanban over product_action
    report/new/           8D draft (agent stub)
    wiki/                 placeholder
    api/
      defects/route.ts    /v_defect_detail proxy
      pareto/route.ts     defect-code Pareto aggregation
  components/
    nav.tsx
    pareto-chart.tsx
    ui/                   card, button, badge
  lib/
    env.ts                typed env reader
    manex.ts              PostgREST fetch wrapper + row types
    anthropic.ts          SDK client
    utils.ts              cn(), imageUrl()
```

## Env vars

| Key | Purpose |
|---|---|
| `MANEX_API_URL` | PostgREST base URL from your handout |
| `MANEX_API_KEY` | JWT for the `team_writer` role |
| `MANEX_IMAGE_BASE` | Image server base (`http://<vm>:9000`) |
| `MANEX_PG_URL` | Direct Postgres DSN (only needed for SQL agent / pgvector) |
| `ANTHROPIC_API_KEY` | Claude API key for the agent |
| `ANTHROPIC_MODEL` | Default: `claude-sonnet-4-6` |
| `NEXT_PUBLIC_MANEX_IMAGE_BASE` | Exposed to the browser for `<img>` tags |

## What's wired

- Overview dashboard pulls `/v_defect_detail` server-side and shows a Pareto
  + recent defects list.
- Incident list + detail render defect rows with severity badges and
  inspection images.
- Initiatives Kanban groups `/product_action` by status.

## What's next

1. **Agent route** (`/api/agent`, SSE) with tool-use loop.
2. **Fault tree** + **BOM trace** using React Flow.
3. **Sankey**: supplier -> batch -> part -> defect.
4. **Wiki**: pgvector store + hybrid retrieval + page rendering.
5. **8D editor** with per-section citation chips and one-click initiative creation.
6. **FMEA draft** seeded from historical defects on a BOM.
