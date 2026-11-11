# Tracker UI

Frontend prototype of the team's own click tracker (Keitaro analogue). Mock API in the browser, no backend.
Stack: React 19, TypeScript, Vite, Tailwind v4, shadcn (radix), TanStack Query / Table, react-router (hash), recharts.

- `npm run dev` — dev server
- `npm run build` — typecheck + build into `dist/`
- `npm run lint` — oxlint
- Live demo: https://tracker-ui.lowiedollekamp-28f.workers.dev (static build, any static hosting works: `dist/` + SPA fallback to `index.html`)

Layout: `src/features/<section>` — pages; `src/components` — shared blocks and shadcn `ui/`; `src/api` — types (the contract for the backend) and the in-browser fake server `client.ts`; `src/mock` — seed data, report math, access scope; `src/app` — shell, router, app state.
Design rules: [CONVENTIONS.md](CONVENTIONS.md).
