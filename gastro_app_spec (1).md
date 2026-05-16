# Gastro Team Management App (MVP)

## 🎯 Goal
Build MVP web app for restaurant team management with scheduling and task system.

---

# 🎨 UX Structure

## 🔐 0. Onboarding / Login
- Login via email / Telegram
- Role selection:
  - Owner
  - Manager
  - Staff

---

## 🏠 1. Home

### Owner
- Today revenue
- Revenue per location
- Open dashboard button

### Manager
- Today shift
- Tasks
- Team status

### Staff
- My shift
- Start shift button
- My tasks

---

## 📅 2. Scheduling
- Calendar view
- Shift cards
- Drag & drop employees
- Button: Generate Schedule

---

## 👥 3. Team
- Employee list
- Role filter
- Employee card:
  - name
  - role
  - weekly hours

---

## ✅ 4. Tasks
- Task list
- Status: pending / done
- Add task
- Photo attachment

---

## 📊 5. Dashboard (Owner only)
- Daily revenue
- Revenue per location
- Photo report
- Add report button

---

## ⚙️ 6. Settings
- Roles
- Locations
- Shift settings

---

## 📱 Navigation
Bottom Tab Bar:
- Home
- Schedule
- Tasks
- Team
- Profile

---

# 🧩 Data Models

## Users
- id
- name
- role (OWNER | MANAGER | STAFF)
- max_hours_per_week

## Availability
- id
- user_id
- day_of_week (0-6)
- is_available

## Shifts
- id
- date
- start_time
- end_time
- required_role
- required_count

## Assignments
- id
- user_id
- shift_id

## Tasks
- id
- title
- description
- assigned_to
- status (pending | done)
- photo_url

## Reports
- id
- date
- location_id
- revenue
- photo_url

---

# ⚙️ Scheduling Logic

```
for each shift:
  find users where:
    available == true
    role matches
    hours < max

  sort users by least assigned hours

  assign first N users
```

---

# 🌐 API (FastAPI)

## Auth
- POST /login

## Users
- GET /users
- POST /users

## Schedule
- GET /shifts
- POST /generate-schedule

## Tasks
- GET /tasks
- POST /tasks
- PATCH /tasks/{id}

## Reports
- POST /reports
- GET /reports

---

# 💻 Frontend (React)

Pages:
- /login
- /home
- /schedule
- /tasks
- /team
- /dashboard

---

# 🎨 UI Requirements
- Mobile-first
- Simple UI
- Fast
- Minimal clicks
