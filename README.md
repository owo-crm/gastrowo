# GastrOWO MVP Monorepo

Full project documentation: [docs/PROJECT_DOCUMENTATION.md](docs/PROJECT_DOCUMENTATION.md)
Compatibility-safe spec repack: [docs/WORKDISH_SPEC_REPACK.md](docs/WORKDISH_SPEC_REPACK.md)

## Stack
- Backend: FastAPI + SQLAlchemy + Alembic + PostgreSQL/SQLite
- Frontend: React + Vite + TypeScript + Tailwind + shadcn/ui + Framer Motion + Recharts
- Local dev: Docker Compose

## Structure
- `apps/api` - FastAPI backend
- `apps/web` - React web client
- `packages/ui` - shared UI primitives placeholder
- `packages/types` - shared TypeScript types placeholder

## Quick start
```bash
docker compose up --build
```

- API docs: `http://localhost:8000/docs`
- API health: `http://localhost:8000/health`
- Web app: `http://localhost:5173`

## Railway
- Railway setup guide: [docs/RAILWAY.md](docs/RAILWAY.md)
- Repo is prepared for:
  - `apps/api/railway.toml`
  - `apps/web/railway.toml`
  - separate `api` and `web` services from the same monorepo

## Seed credentials
- Owner: `owner@GastrOWO.app` / `Owner123!`
- Demo staff/managers: password `Staff123!`
