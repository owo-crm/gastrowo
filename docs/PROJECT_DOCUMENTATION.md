# GastrOWO Project Documentation

## 1. What This Project Is
GastrOWO is a restaurant operations platform built for small and mid-sized hospitality teams.

The current product goal is practical day-to-day control of:
- staff scheduling,
- team setup and permissions,
- weekly availability,
- shift and timesheet reporting,
- task assignment,
- revenue reporting,
- owner/admin analytics.

The codebase is already beyond a static MVP. It contains working operational flows, live scheduling logic, role-based UI, notifications, and mobile-focused refinements. At the same time, some modules are still intentionally marked as preview-only.

Current target milestone:
- internal beta line: `Beta 0.1`
- target release for pilot use in a real restaurant: `Beta 1.0`

## 2. Product Scope
The system is organized around one business workspace and one team.

Core idea:
- one account belongs to one business,
- a business can have multiple locations,
- users work through role-based access,
- operational planning happens around weekly schedules,
- actual worked time is confirmed through timesheets,
- finance visibility is driven by revenue reports and labor cost.

Main operational personas:
- `ADMIN`: full business access
- `MANAGER`: operational access with business-controlled permissions
- `STAFF`: personal schedule, availability, tasks, and optional reporting access

## 3. Current Product Modules

### 3.1 Authentication and onboarding
Implemented:
- email-first auth
- OTP login
- OTP worker signup
- owner onboarding wizard
- owner password fallback login
- invite-based join flow
- one-account-one-business rule

Not used anymore:
- `public_uid`
- UID-based login
- old staff password-first registration flow

### 3.2 Schedule
Implemented:
- weekly schedule preview
- apply flow
- weekly overrides
- inline time editing in preview
- manager editing flow
- worker compact weekly/day agenda
- availability submission
- shift requests
- mobile-first worker schedule layout

### 3.3 Team and locations
Implemented:
- member directory
- worker setup modal
- location setup
- location managers
- hourly rate and priority by location
- shift template builder
- business-level permissions

### 3.4 Timesheets
Implemented:
- worker `Report hours`
- restricted extra-hours reporting
- manager/admin review
- approve / reject / correct
- compact approvals list
- delta against planned shift
- bulk approve visible items

### 3.5 Tasks
Implemented:
- create tasks
- assign tasks
- complete tasks
- attach photo proof
- role-filtered visibility

Current visibility rule:
- staff can create tasks
- staff can see only:
  - tasks assigned to them
  - tasks created by them

### 3.6 Revenue and overview
Implemented:
- revenue report submission
- owner/admin overview
- labor cost metrics
- revenue by location
- payroll modal
- notifications around reporting

### 3.7 Notifications
Implemented:
- in-app notification center
- delete notification
- event-driven notifications for:
  - schedule publish
  - invite accepted
  - timesheets
  - tasks
  - revenue events

### 3.8 Preview-only modules
Visible in UI but intentionally not active yet:
- `Notes & Documents`
- `Inventory`

These are frontend preview screens with an `In development` state.

## 4. Monorepo Structure

```text
C:\workdish
├─ apps
│  ├─ api
│  └─ web
├─ docs
├─ packages
│  ├─ types
│  └─ ui
├─ docker-compose.yml
└─ dev_redesign.db
```

### 4.1 `apps/api`
Backend API and business logic.

Important folders:
- [apps/api/app/main.py](C:\workdish\apps\api\app\main.py): FastAPI app entry
- [apps/api/app/models.py](C:\workdish\apps\api\app\models.py): SQLAlchemy models
- [apps/api/app/routers](C:\workdish\apps\api\app\routers): HTTP API routes
- [apps/api/app/services](C:\workdish\apps\api\app\services): scheduler and email services
- [apps/api/app/tests](C:\workdish\apps\api\app\tests): backend tests

### 4.2 `apps/web`
React/Vite frontend.

Important folders:
- [apps/web/src/pages](C:\workdish\apps\web\src\pages): route pages
- [apps/web/src/lib](C:\workdish\apps\web\src\lib): API client, auth context, access logic, types, toast
- [apps/web/src/components](C:\workdish\apps\web\src\components): shared UI and layout
- [apps/web/src/styles.css](C:\workdish\apps\web\src\styles.css): global visual system

### 4.3 `docs`
Internal project documentation.

Current notable docs:
- [auth.md](C:\workdish\docs\auth.md)
- [scheduling-calendar-module.md](C:\workdish\docs\scheduling-calendar-module.md)
- [GASTROWO_ROADMAP_BETA_0_1_TO_1_0.md](C:\workdish\docs\GASTROWO_ROADMAP_BETA_0_1_TO_1_0.md)

## 5. Technology Stack

### Backend
- FastAPI
- SQLAlchemy 2.x
- Alembic
- SQLite for local default flow
- PostgreSQL in Docker flow
- JWT auth
- Pydantic v2

Backend dependencies are defined in:
- [requirements.txt](C:\workdish\apps\api\requirements.txt)

### Frontend
- React 18
- TypeScript
- Vite
- Tailwind CSS
- TanStack Query
- Radix primitives
- Lucide icons
- Recharts
- Sonner

Frontend dependencies are defined in:
- [apps/web/package.json](C:\workdish\apps\web\package.json)

## 6. Roles and Access Model

### `ADMIN`
Full access.

Current capabilities:
- overview/dashboard
- schedule preview/edit/apply
- team management
- business settings
- payroll visibility
- notes preview
- inventory preview
- billing page

### `MANAGER`
Operational access controlled by organization settings.

Possible permissions:
- full dashboard access
- payroll visibility
- team management
- business settings access
- notes access
- inventory access

Default manager experience:
- focused `Report` page
- schedule
- tasks
- optional team and preview tabs based on settings

### `STAFF`
Personal operational access.

Current capabilities:
- own schedule
- weekly availability
- own timesheets
- own/relevant tasks
- optional report access if business allows it

## 7. Authentication and Onboarding

## 7.1 Current auth rules
Locked product decisions already implemented:
- workers use OTP only
- owners can use OTP and password
- one account belongs to one business
- email delivery goes through an abstraction layer
- local development can expose OTP debug codes

## 7.2 Owner onboarding
Owner flow:
1. choose owner
2. enter name
3. verify email by OTP
4. set password
5. choose onboarding source
6. create business
7. create admin membership
8. create default location
9. log in

Important endpoint:
- `POST /auth/onboarding/owner/complete`

## 7.3 Worker onboarding
Worker flow:
1. choose worker
2. enter name
3. verify email by OTP
4. account is created
5. user is either:
   - linked into a business through invite flow
   - or left in `pending_link` state

## 7.4 Returning login
Default login:
- email
- OTP

Owner alternative:
- email + password

Worker password login is intentionally not supported anymore.

## 7.5 Invite and join flow
Invite logic is email-based.

Cases:
- existing user already in same business: reject as duplicate
- existing user in another business: reject
- existing user without membership: link immediately
- new email: create invite token, send invite, complete join by OTP

Important backend components:
- `InviteToken`
- `OtpChallenge`
- [apps/api/app/services/auth_email.py](C:\workdish\apps\api\app\services\auth_email.py)

## 8. Business Settings Model
Organization-level settings are stored on `Organization`.

Current flags:
- `staff_can_submit_revenue_reports`
- `manager_can_view_full_dashboard`
- `manager_can_view_payroll`
- `manager_can_manage_team`
- `manager_can_manage_business_settings`
- `manager_can_access_notes`
- `manager_can_access_inventory`

These settings affect both:
- route access
- frontend navigation

Relevant frontend access logic:
- [apps/web/src/lib/access.ts](C:\workdish\apps\web\src\lib\access.ts)
- [apps/web/src/lib/navigation.ts](C:\workdish\apps\web\src\lib\navigation.ts)

## 9. Data Model Summary
Main entities:
- `User`
- `Organization`
- `OrganizationMembership`
- `Location`
- `LocationMembership`
- `AvailabilityWeek`
- `AvailabilitySlot`
- `ShiftTemplate`
- `ScheduleWeeklyOverride`
- `Shift`
- `Assignment`
- `ShiftRequest`
- `Timesheet`
- `Task`
- `TaskPhoto`
- `RevenueReport`
- `InAppNotification`
- `InviteToken`
- `OtpChallenge`

Important modeling rules:
- one membership per user
- one business per account
- rates and assignment priority are location-specific
- availability is week-based
- applied auto schedules lock that week’s availability

## 10. Scheduling Engine

Main code:
- [apps/api/app/services/scheduler.py](C:\workdish\apps\api\app\services\scheduler.py)

## 10.1 Inputs
The scheduler uses:
- active shift templates
- weekly overrides
- weekly availability
- location membership priority
- hourly labor rate
- current existing manual assignments

## 10.2 Output
The preview/apply flow produces:
- candidate assignments
- open shifts
- rejected candidates
- labor cost summary
- fairness summary
- coverage summary
- start-time alerts

## 10.3 Current scheduling behavior
Current planner characteristics:
- greedy ranking by:
  - preferred user
  - location priority
  - fewer assigned hours
  - stable tie-break
- staff position matching for staff templates
- overlap protection
- location membership requirement

Important recent behavior:
- partial availability can still be considered if there is no better choice
- `desired_hours` now behaves more like a soft limit during fallback selection
- `apply` is blocked only when real start-time coverage is missing in the preview state

## 10.4 Preview and regenerate semantics
Manager flow currently supports:
- generate preview
- inline edit preview
- create preview shifts
- delete preview shifts
- clear by day
- regenerate

Important rule:
- `Regenerate` now resets preview overrides for the selected location/week and rebuilds preview from base templates
- this is intentionally different from `Generate`, which just computes current preview state

## 11. Timesheets

Main logic:
- [apps/api/app/routers/timesheets.py](C:\workdish\apps\api\app\routers\timesheets.py)
- [apps/web/src/pages/schedule-page.tsx](C:\workdish\apps\web\src\pages\schedule-page.tsx)

Implemented flows:
- staff submit hours for a shift
- staff submit restricted extra entry
- manager/admin approve
- manager/admin reject
- manager/admin correct
- bulk approve visible list

Current review UX:
- planned vs actual delta
- compact review list
- internal scroll to avoid oversized screens

Payroll uses only:
- `approved`
- `corrected`

timesheets.

## 12. Tasks

Main files:
- [apps/api/app/routers/tasks.py](C:\workdish\apps\api\app\routers\tasks.py)
- [apps/web/src/pages/tasks-page.tsx](C:\workdish\apps\web\src\pages\tasks-page.tsx)

Implemented:
- create task
- assign task
- complete task
- upload photo proof
- delete task
- notification stream updates

Current design rule:
- staff can create tasks
- staff do not see the whole business task board

## 13. Revenue Reporting and Dashboard

Main files:
- [apps/api/app/routers/reports.py](C:\workdish\apps\api\app\routers\reports.py)
- [apps/api/app/routers/dashboard.py](C:\workdish\apps\api\app\routers\dashboard.py)
- [apps/web/src/pages/dashboard-page.tsx](C:\workdish\apps\web\src\pages\dashboard-page.tsx)
- [apps/web/src/pages/report-page.tsx](C:\workdish\apps\web\src\pages\report-page.tsx)

Current reporting model:
- manager/admin submit revenue reports by location/date
- overview emphasizes:
  - revenue
  - labor cost
  - revenue efficiency
- payroll is shown through a dedicated modal

Current split:
- `ADMIN`: merged overview/dashboard
- `MANAGER`: focused report workflow by default
- `STAFF`: optional report access if business enables it

## 14. Frontend Route Map

Current main route pages:
- [login-page.tsx](C:\workdish\apps\web\src\pages\login-page.tsx)
- [dashboard-page.tsx](C:\workdish\apps\web\src\pages\dashboard-page.tsx)
- [report-page.tsx](C:\workdish\apps\web\src\pages\report-page.tsx)
- [schedule-page.tsx](C:\workdish\apps\web\src\pages\schedule-page.tsx)
- [tasks-page.tsx](C:\workdish\apps\web\src\pages\tasks-page.tsx)
- [team-page.tsx](C:\workdish\apps\web\src\pages\team-page.tsx)
- [profile-page.tsx](C:\workdish\apps\web\src\pages\profile-page.tsx)
- [billing-page.tsx](C:\workdish\apps\web\src\pages\billing-page.tsx)
- [notes-documents-page.tsx](C:\workdish\apps\web\src\pages\notes-documents-page.tsx)
- [inventory-page.tsx](C:\workdish\apps\web\src\pages\inventory-page.tsx)

Notes:
- `Notes & Documents` is preview-only
- `Inventory` is preview-only
- `Billing` is frontend-only placeholder data

## 15. Mobile and Responsive Direction
The frontend has already been pushed through a phone-first pass.

Current design direction:
- desktop sidebar
- mobile bottom nav
- compact topbar
- worker-first mobile schedule flow
- full-screen mobile sheets for heavy forms

Still actively refined:
- worker schedule overflow edge cases
- compact manager editing on smaller widths
- mobile density tuning

## 16. API Surface Overview

### Authentication
- `POST /auth/otp/send`
- `POST /auth/otp/verify`
- `POST /auth/login`
- `POST /auth/login/password`
- `POST /auth/onboarding/owner/complete`
- `POST /auth/invites/join/verify`
- `GET /auth/me`

### Organizations
- `PATCH /organizations/current`
- `PATCH /organizations/current/settings`
- `POST /organizations/members/link-by-email`

### Locations and workers
- `GET /locations`
- `POST /locations`
- `PATCH /locations/{location_id}`
- `DELETE /locations/{location_id}`
- `GET /locations/{location_id}/members`
- `PATCH /locations/{location_id}/members/{user_id}`
- `GET /workers/{user_id}/setup`
- `PATCH /workers/{user_id}/setup`

### Availability
- `GET /availability/weeks/{week_start}`
- `PUT /availability/weeks/{week_start}`
- `GET /availability/weeks/{week_start}/team-summary`

### Schedule
- `POST /schedule/generate/preview`
- `GET /schedule/preview/calendar`
- `PATCH /schedule/preview/edits`
- `GET /schedule/overrides`
- `PUT /schedule/overrides`
- `POST /schedule/generate/apply`
- `GET /schedule/shifts`
- `GET /schedule/shifts/staff`
- `PATCH /schedule/assignments/{assignment_id}`
- `POST /schedule/requests`
- `GET /schedule/requests`
- `PATCH /schedule/requests/{request_id}`

### Timesheets
- `POST /timesheets`
- `GET /timesheets`
- `PATCH /timesheets/{id}`
- `POST /shifts/{shift_id}/end`

### Tasks
- `GET /tasks`
- `POST /tasks`
- `PATCH /tasks/{task_id}`
- `DELETE /tasks/{task_id}`
- `POST /tasks/{task_id}/photos`

### Reporting and dashboard
- `POST /reports/revenue`
- `GET /reports/revenue`
- `GET /dashboard/owner`
- `GET /notifications`
- `DELETE /notifications/{id}`

## 17. Local Development

## 17.1 Backend
Working directory:
- `C:\workdish\apps\api`

Typical local run:
```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Health endpoint:
- [http://localhost:8000/health](http://localhost:8000/health)

Default config:
- local SQLite database
- file usually used in this workspace: `dev_redesign.db`

## 17.2 Frontend
Working directory:
- `C:\workdish\apps\web`

Typical run:
```bash
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Frontend URL:
- [http://localhost:5173](http://localhost:5173)

## 17.3 Docker
Docker Compose is available via:
- [docker-compose.yml](C:\workdish\docker-compose.yml)

It starts:
- PostgreSQL
- API
- web app

## 18. Seed and Demo Accounts

Known seeded passwords from current seed logic:
- admin bootstrap account: `ADMIN123!`
- most seeded non-admin demo accounts: `Staff123!`

Common demo emails seen in current seed:
- `owner@workdish.app`
- `staff@workdish.app`
- `manager.one@workdish.app`
- `manager.two@workdish.app`
- `staff.alpha@workdish.app`
- `cook.alpha@workdish.app`
- `bartender.alpha@workdish.app`
- `waiter.alpha@workdish.app`

Important:
- seed data evolves during development
- live local DB may already contain extra manual test users and organizations

## 19. Testing

### Backend
Run:
```bash
cd apps/api
pytest
```

Important test areas already present:
- scheduler unit tests
- auth flow tests
- integration API flow tests

### Frontend
Build sanity:
```bash
npm --workspace apps/web run build
```

Unit tests:
```bash
npm --workspace apps/web run test
```

E2E:
```bash
npm --workspace apps/web run test:e2e
```

## 20. Current Known Limitations

These are known product limitations, not necessarily bugs:
- billing is frontend-only placeholder data
- notes/documents is preview-only
- inventory is preview-only
- no real production email provider yet; current flow is abstraction + dev fallback
- some mobile schedule layouts still need tightening
- frontend bundle is still large and would benefit from code splitting

## 21. Current High-Risk Areas
Areas that deserve extra care before restaurant pilot:
- schedule generate/apply correctness
- mobile schedule usability for staff
- timesheet accuracy and review workflow
- task/report reliability under real usage
- notification clarity
- auth stability during onboarding and invites

## 22. Most Important Code Entry Points

Backend:
- [main.py](C:\workdish\apps\api\app\main.py)
- [models.py](C:\workdish\apps\api\app\models.py)
- [auth.py](C:\workdish\apps\api\app\routers\auth.py)
- [schedule.py](C:\workdish\apps\api\app\routers\schedule.py)
- [scheduler.py](C:\workdish\apps\api\app\services\scheduler.py)
- [dashboard.py](C:\workdish\apps\api\app\routers\dashboard.py)

Frontend:
- [login-page.tsx](C:\workdish\apps\web\src\pages\login-page.tsx)
- [schedule-page.tsx](C:\workdish\apps\web\src\pages\schedule-page.tsx)
- [team-page.tsx](C:\workdish\apps\web\src\pages\team-page.tsx)
- [dashboard-page.tsx](C:\workdish\apps\web\src\pages\dashboard-page.tsx)
- [profile-page.tsx](C:\workdish\apps\web\src\pages\profile-page.tsx)
- [api.ts](C:\workdish\apps\web\src\lib\api.ts)
- [auth.tsx](C:\workdish\apps\web\src\lib\auth.tsx)

## 23. Recommended Reading Order for a New Developer
If someone new joins the project, the fastest onboarding path is:
1. this document
2. [auth.md](C:\workdish\docs\auth.md)
3. [scheduling-calendar-module.md](C:\workdish\docs\scheduling-calendar-module.md)
4. [GASTROWO_ROADMAP_BETA_0_1_TO_1_0.md](C:\workdish\docs\GASTROWO_ROADMAP_BETA_0_1_TO_1_0.md)
5. backend `models -> auth router -> schedule router -> scheduler service`
6. frontend `auth context -> navigation/access -> login -> schedule -> team -> dashboard`

## 24. Short Project Summary
GastrOWO is a restaurant operations workspace focused on making weekly staffing, availability, labor tracking, and day-to-day coordination usable in real life.

The codebase is already capable of:
- authenticating real users by email,
- linking them into a single business,
- planning and applying weekly schedules,
- collecting actual worked hours,
- managing task assignments,
- collecting revenue reports,
- showing owner/admin labor and revenue insights.

The next phase is not inventing the product from scratch. The next phase is stabilizing it, polishing the operational edges, and making it reliable enough for live free testing inside a real restaurant.
