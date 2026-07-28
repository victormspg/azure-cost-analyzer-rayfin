
# `app/` — Azure Cost Analyzer (Fabric App)

The deployable **RayFin** app (React + Vite + TypeScript) that reads the Azure Cost Analyzer
semantic model and renders the FinOps views: Executive Summary, Explorer, Unusual Spend,
Chargeback, Action Center, and FinOps Assistant.

> This app is **already built** — you extend it; you do **not** scaffold it from a prompt.

## Start here

- **Deploy end-to-end:** [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)
- **Architecture:** [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- **Semantic model contract:** [../docs/SEMANTIC-MODEL.md](../docs/SEMANTIC-MODEL.md)

## Layout

- `src/components/*` — the views.
- `src/queries/cfo/builders.ts` — DAX builders (pure functions returning DAX strings).
- `src/lib/*` — roles, chat, period, data-agent client.
- `functions/*` — Azure Function backend (data-agent proxy).
- `fabric.yaml`, `.env.local`, `rayfin/rayfin.yml` — **git-ignored** local config, created from the
  `*.example` files by `../scripts/bootstrap.ps1`.

## Common commands

```powershell
npm install
npm run dev          # then open via the Fabric portal app URL with &devUri=http://localhost:5173
npx fabric-app-data query aca --file src/queries/_discovery/months.dax   # validate DAX
npm run lint
npm run build
```

> To publish, run `npx rayfin up` from `app/` after setting `fabric.yaml` + `.env.local`
> (see [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)).

## Need help?

Check the docs above, then ask the maintainer or open an issue.