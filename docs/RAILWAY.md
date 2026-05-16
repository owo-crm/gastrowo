# GastrOWO on Railway

This project is now prepared for a simple Railway deployment from GitHub.

## What is already in the repo
- API service config: [C:\workdish\apps\api\railway.toml](C:\workdish\apps\api\railway.toml)
- Web service config: [C:\workdish\apps\web\railway.toml](C:\workdish\apps\web\railway.toml)
- API production image: [C:\workdish\apps\api\Dockerfile.prod](C:\workdish\apps\api\Dockerfile.prod)
- Web production image: [C:\workdish\apps\web\Dockerfile.prod](C:\workdish\apps\web\Dockerfile.prod)

## Railway setup
Create one Railway project with 3 services:
- `Postgres`
- `api`
- `web`

Import the same GitHub repo for both `api` and `web`.

## Root directories
In Railway service settings:
- `api` root directory: `/apps/api`
- `web` root directory: `/apps/web`

Because this is a monorepo, set the config file path explicitly:
- `api`: `/apps/api/railway.toml`
- `web`: `/apps/web/railway.toml`

## Variables

### Shared project variables
Set these once at the project level:

```env
APP_ENV=production
ACCESS_TOKEN_EXPIRE_MINUTES=720
SECRET_KEY=replace-with-a-long-random-secret
RESEND_API_KEY=
```

`RESEND_API_KEY` can stay empty for now, but then real OTP/invite emails will not work outside logs.

### API service variables
Set these in the `api` service:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
FRONTEND_URL=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
CORS_ORIGINS=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
```

### Web service variables
Set this in the `web` service:

```env
VITE_API_URL=https://${{api.RAILWAY_PUBLIC_DOMAIN}}
```

This is important. Without `VITE_API_URL`, the frontend will try to talk to `localhost:8000`.

## Deployment result
After deploy:
- web app: `https://<web-domain>.up.railway.app`
- api: `https://<api-domain>.up.railway.app`

Use the Railway-generated domain first. You do not need a custom domain to get the app running.

## First deploy checklist
1. Create Railway project
2. Add `Postgres`
3. Add `api` service from GitHub repo
4. Set root directory `/apps/api`
5. Set config file path `/apps/api/railway.toml`
6. Add API variables
7. Add `web` service from GitHub repo
8. Set root directory `/apps/web`
9. Set config file path `/apps/web/railway.toml`
10. Add `VITE_API_URL`
11. Deploy both services

## After deploy
Check:
- `https://<api-domain>.up.railway.app/health`
- web login page opens
- password login works
- OTP works only if `RESEND_API_KEY` is configured

## Important
- Do not run seed data in production for the real restaurant workspace
- If you want a demo environment, create a second Railway environment or second Railway project for staging

