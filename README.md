# Tracker UI

Frontend prototype of an in-house ad click tracker (a Keitaro analogue) for a media-buying team: campaigns and streams, offers with caps, landings, traffic sources, postbacks, reports, Facebook ad accounts, problems monitoring. Russian UI.

There is **no backend yet**: the app runs on a fake API inside the browser (`src/api` over `src/mock`). The API contract, the domain model and the business rules are written down so the backend can be built from this repo:

- [docs/backend.md](docs/backend.md) — what to build: endpoints, conventions, what the mock simplifies
- [docs/domain.md](docs/domain.md) — business rules
- [docs/data-architecture.md](docs/data-architecture.md) — data architecture for the data engineer (RU): sources, PostgreSQL / ClickHouse / Valkey / Temporal, report math
- [docs/sprint-plan.md](docs/sprint-plan.md) — sprint plan from prototype to production (RU)
- [CONVENTIONS.md](CONVENTIONS.md) — frontend structure and design rules

Live demo: https://tracker-ui.lowiedollekamp-28f.workers.dev

## Run

Node 22+.

```bash
npm ci
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run lint
```

`dist/` is static: any static hosting works (hash routing, no server rewrites needed).

## Demo controls (user menu, top right)

- **Смотреть как роль** — see the tracker as a team lead, buyer, finance or intern (permissions demo).
- **Данные** — «Демо-данные» (a generated company with 45 days of traffic and planted problems) or «Пустой трекер» (a fresh install: admin, roles and settings only). Data lives in memory and resets on reload.
- **Справка для IT** — business rules per feature; «Пометки для IT на страницах» shows them next to the features.

## Layout

```
src/
  api/        types.ts (domain model), meta.ts (dictionaries), client.ts (the `api` object = contract), client-*.ts (its groups), mock-util.ts
  mock/       seed.ts (demo data), report.ts (report math), scope.ts (who sees what) — fake backend
  app/        shell, router, app state (period, permissions, URL params)
  components/ shared blocks; components/ui = shadcn
  features/   one folder per section
  lib/        dates, number formats
```

Stack: React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Radix), TanStack Query and Table, react-router (hash), recharts.
