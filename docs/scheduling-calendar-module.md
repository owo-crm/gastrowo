# Scheduling Calendar Module

## 1. Module Overview

**Purpose:** The Scheduling Calendar module lets managers generate a weekly schedule, edit it, and manually close staffing gaps (`Open Demand`) left after auto-generation.

**Core philosophy:** The generator strictly follows hard constraints. If a shift cannot be staffed without violating them, the shift remains open. The manager then resolves the gap manually and explicitly confirms any exception.

---

## 2. Schedule Generation Algorithm

**Type:** Greedy with post-filters.

### Step 1. Greedy assignment
For each shift:
1. Build candidate pool that satisfies hard constraints:
   - role matches `required_role`;
   - employee is available for day/time (`Availability`);
   - employee does not exceed weekly cap (`desired_hours` / max weekly limit).
2. Sort candidates by assigned hours ascending (`assigned_hours ASC`).
3. Assign first candidate.
4. If no valid candidate exists, shift remains `Open Demand`.

### Step 2. Post-filters
Applied sequentially to generated result:

1. **Gap Penalty (split-day protection)**  
   If employee has two same-day shifts with gap `< 4h`, remove lower-priority shift -> convert to `Open Demand`.

2. **Max Consecutive Days (overwork protection)**  
   If employee is assigned `7+` consecutive days, remove last shift in the streak -> `Open Demand`.

3. **Min Hours Guarantee (minimum coverage signal)**  
   If employee receives `< 50%` of desired hours, and there are `Open Demands` on days where they are available, mark such gaps as **amber attention** (no auto-assign).

---

## 3. Calendar UI

### Grid
- Columns: Mon-Sun with dates.
- Rows: employees (default mode).
- Sticky headers:
  - weekday row sticks on vertical scroll;
  - employee column sticks on horizontal scroll.

### Assignment block
- Dark fill + left accent border `3px solid var(--color-primary)`.
- Content: time range (`09:00-17:00`).
- Click opens time-edit modal (row-scoped to this employee).

### Open Demand block
- Background: `rgba(255, 107, 107, 0.12)`.
- Left border: `3px solid var(--color-danger)`.
- Content: `Missing: [Role]` with `AlertCircle` icon.
- Click opens **Fill Shift Wizard**.

---

## 4. Fill Shift Wizard (manual gap fill)

**Trigger:** click on `Missing: [Role]` block.

### Modal content
- Title: `Fill Shift - [Day], [Time]`.
- Optional search by employee name.
- Ranked candidates:
  1. Fully matching (role + availability + hours) - top, normal contrast.
  2. Partially matching (e.g. hours overflow / role conflict) - warning style + `AlertTriangle`.
  3. Unavailable - bottom, low opacity + `Unavailable` label.

### Candidate row fields
- Name, role.
- Weekly hours (`28 / 40h`).
- Conflict text when applicable (`Exceeds weekly limit by 2h`).
- `Assign` button.

### Assign behavior
- Fully valid candidate -> assign immediately, gap disappears.
- Partially valid candidate -> confirm dialog:
  `This will exceed weekly hours by Xh. Continue?` (`Yes/No`).

---

## 5. Views and Planning Modes

### A) By Employee (default)
Rows = employees. Best for individual load control.

### B) By Position (fast planning)
Rows = positions (`Cook`, `Waiter`, `Bartender`, `Manager`).

In one day cell, multiple mini-blocks can appear for multiple assigned employees (e.g. `Alex 11-17`).
If `required_count` > assigned count, remaining slots are shown as `Open Demand` blocks (`Missing: [Role]`).

### Switching
Toolbar pills: `By Employee | By Position`.

---

## 6. Day Quick Panel (slide-out)

**Trigger:** click day header (e.g. `Mon 20.4`) or empty cell in `By Position` view.

**Behavior:** right-side panel slides in (`~400px`), main area remains visible.
Close via `X` or outside click.

### Panel content
- Header: full day/date (`Monday, 20.04`).
- Day shifts grouped by position:
  - assigned entries: name + time + edit (`✏️`) + delete (`✕`);
  - open entries: `Missing: [Role]` + `+` to open Fill Shift Wizard.
- `+ Add Shift` per position group.
- `Fill All Open Demands` on top (auto-fill only for selected day).

### UX value
- Full-day operations without horizontal scanning.
- Fast gap-closing workflow.
- Same underlying data as calendar, instant sync across both views.

---

## 7. Data & API

### Endpoints
- `POST /schedule/generate/preview` — generate preview (`Assignments + Open Demands + rejection reasons`).
- `GET /schedule/preview/calendar` — calendar data model.
- `POST /schedule/assignments` — manual assignment to shift.

### Core entities
- `Assignment`: `id`, `user_id`, `shift_id`, `start_time`, `end_time`, `status` (`auto | manual`).
- `OpenDemand`: `shift_id`, `date`, `start_time`, `end_time`, `required_role`.

---

## 8. End-to-End User Flow

1. Manager clicks `Generate Schedule`.
2. System returns generated assignments + open gaps.
3. Manager sees calendar with filled shifts and red `Missing` markers.
4. Manager opens a gap (e.g. `Missing: Cook`) -> Fill Shift Wizard.
5. Manager chooses candidate:
   - confirm exception if needed;
   - or leave gap open intentionally.
6. After resolving critical gaps, manager clicks `Apply Schedule`.
7. Week becomes fixed and visible to workers.

---

## 9. Integration Rules

- Generation algorithm and post-filters stay unchanged between views.
- Fill Shift Wizard works identically from calendar cells and day panel.
- Day panel is an alternative UI layer on top of same scheduling API.
- Changes made in one view instantly appear in the other.
