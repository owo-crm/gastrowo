# GastrOWO Deployment

## What is already prepared
- `docker-compose.prod.yml`: production stack
- `Caddyfile`: automatic HTTPS
- `apps/api/Dockerfile.prod`: production API image
- `apps/web/Dockerfile.prod`: production web image
- `apps/web/nginx.conf`: SPA fallback + `/api` reverse proxy

This setup is designed for **one public domain**:
- web app on `https://your-domain`
- API behind `https://your-domain/api`

That is the simplest way to make the app work without separate frontend/backend domains.

## Important constraints
- Do **not** deploy the current `docker-compose.yml` to production.
- That file is development-only:
  - bind mounts
  - `uvicorn --reload`
  - `npm run dev`
  - localhost-oriented CORS
- Production should use `docker-compose.prod.yml`.

## Minimum server
- Ubuntu 22.04 or 24.04
- 2 vCPU
- 4 GB RAM
- 30+ GB disk

For a real restaurant pilot, PostgreSQL is required. Do not run production on the default SQLite fallback.

## 1. Prepare DNS
Point your domain to the VPS public IP.

Example:
- `app.example.com -> your server IP`

Use the same domain value later in `.env.production`.

## 2. Install Docker
On the VPS:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out and log back in once.

## 3. Copy the project to the server
Example:

```bash
git clone <your-repo-url> gastrowo
cd gastrowo
```

## 4. Create production env file
Copy:

```bash
cp .env.production.example .env.production
```

Then edit `.env.production`.

Required values:
- `DOMAIN`
- `ACME_EMAIL`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `SECRET_KEY`
- `CORS_ORIGINS`
- `FRONTEND_URL`
- optional `RESEND_API_KEY`

Example:

```env
DOMAIN=app.example.com
ACME_EMAIL=ops@example.com

POSTGRES_DB=gastrowo
POSTGRES_USER=gastrowo
POSTGRES_PASSWORD=super-long-db-password

DATABASE_URL=postgresql+psycopg://gastrowo:super-long-db-password@db:5432/gastrowo
SECRET_KEY=put-a-long-random-secret-here
ACCESS_TOKEN_EXPIRE_MINUTES=720

CORS_ORIGINS=https://app.example.com
FRONTEND_URL=https://app.example.com

RESEND_API_KEY=
```

## 5. Start the stack
Run:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

What happens:
- PostgreSQL starts
- FastAPI runs migrations with `alembic upgrade head`
- Vite app is built into static files
- Nginx serves the frontend
- Caddy attaches HTTPS automatically

## 6. Check health
Use:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f caddy
```

Then open:
- `https://your-domain`
- `https://your-domain/api/health`

Expected API response:
- `status: ok`

## 7. Create first real account
For production/pilot:
- use the normal onboarding flow on `/login`
- do **not** seed demo data into the live restaurant workspace unless that is an intentional demo environment

If you want a demo/staging environment, run:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec api python -m app.seed
```

Do this only on staging/demo, not on a real pilot workspace with live data.

## 8. Updating the app
After pulling new code:

```bash
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

## 9. Backup
At minimum, back up PostgreSQL data volume.

Quick backup example:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql
```

For the pilot, set up regular backups before giving access to the restaurant.

## 10. What still matters before real pilot
- set a real `RESEND_API_KEY` if email OTP/invites must work outside dev logs
- keep `SECRET_KEY` private and strong
- never commit `.env.production`
- do not expose PostgreSQL directly to the public internet

## Recommended deployment model
Use 2 environments:
- `staging`: seeded demo data, internal testing
- `production`: clean business data for Chicken i Kimchi

That keeps your restaurant pilot free from fake tasks, fake reports, and fake timesheets.
