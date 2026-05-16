# GastrOWO Product Spec (Repacked)

## Summary
This repacked spec is aligned with the current MVP codebase and keeps backward compatibility active.
It separates **MVP now** from **v2 later** and avoids breaking existing clients.
PL: Ten dokument porzadkuje specyfikacje pod aktualny kod MVP, zachowuje kompatybilnosc i rozdziela zakres na **MVP now** oraz **v2 later**.

## Compatibility Policy (Deprecated but Active)
- `POST /auth/login` keeps **email-first** auth with `public_uid` fallback.
- `POST /schedule/generate` stays active as a shortcut alias for apply flow.
- `packages/ui` and `packages/types` remain in monorepo as planned shared modules.

## MVP Now

### Scheduling flow
- Single manager flow: `templates + weekly overrides -> preview -> edits -> apply`.
- Preview UI language should stay plain:
  - `Missing staff`
  - `Why not assigned`
  - `Coverage`
  - `Labor cost`
- Existing preview/apply endpoints remain the source of truth.

### Shift end and attendance verification
- Add operational shift close endpoint: `POST /shifts/{shift_id}/end`.
- Add self-report timesheet layer with manager review:
  - `POST /timesheets` (staff submit),
  - `GET /timesheets` (role-based listing),
  - `PATCH /timesheets/{id}` (approve/reject/correct).
- Review lifecycle: `pending -> approved/rejected/corrected`.
- Scope rules:
  - assigned shift entry: normal path,
  - day without assigned shift: restricted entry, manager review required.
- Start/end timestamps stay operational. Timesheet is a verification layer.

### Team and access rules
- Priority matrix `0..5` is the assignment gate by location.
- UI may show readable labels while DB keeps numeric values.
- Role matrix remains explicit for:
  - availability,
  - preview edits,
  - shift requests,
  - timesheet review.

## v2 Later
- Hard removal of deprecated compat endpoints.
- Expanded payroll-grade attendance analytics.
- Advanced automation for template suggestion and attendance anomaly detection.

## API Additions in this repack
- `POST /shifts/{shift_id}/end`
- `POST /timesheets`
- `GET /timesheets`
- `PATCH /timesheets/{id}`

## API kept for compatibility
- `POST /auth/login` with `public_uid` fallback
- `POST /schedule/generate`

## Data Contracts (new)
- `ShiftEndPayload`
- `TimesheetEntry`
- `TimesheetReviewAction`
- `TimesheetStatus`
