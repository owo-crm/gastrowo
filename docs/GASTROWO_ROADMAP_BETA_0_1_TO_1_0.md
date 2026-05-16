# GastrOWO Roadmap

## From Beta 0.1 to Beta 1.0

### Where we are now
`Beta 0.1` = working internal MVP.

Already working:
- login and roles
- team setup
- schedule
- availability
- timesheets
- revenue reports
- tasks
- overview/dashboard base

Still not ready enough for real pilot:
- some flows are rough
- mobile still needs tightening
- permissions and visibility need full consistency
- some tabs are still preview-only

## Final goal
`Beta 1.0` = stable enough to give for free live testing to `Chicken i Kimchi`.

That means:
- manager can plan and publish shifts without confusion
- workers clearly see shifts, coworkers, and tasks
- reports, payroll, and labor numbers are trustworthy
- phone experience works well during real shifts
- no daily developer fixing is needed

## Main plan

### 1. Stabilize core logic
Fix all permission, role, and visibility issues.

Must be true:
- enabled access always appears
- manager/admin/staff each see the correct screens
- refresh/relogin does not break state

### 2. Finish scheduling
Make schedule the strongest part of the product.

Focus:
- worker calendar clarity
- coworker visibility
- manager editing confidence
- no false apply errors
- clean daily use on desktop and mobile

### 3. Lock reporting and labor metrics
Make numbers consistent and believable.

Focus:
- revenue reports
- timesheet review
- payroll from confirmed hours
- labor cost clarity
- no mismatch between overview and dashboard

### 4. Finish mobile usability
Make the app comfortable on phone.

Focus:
- schedule
- report
- tasks
- profile/settings
- team basics

Goal:
- staff can use the app during a real shift without friction

### 5. Prepare pilot build
Prepare the app specifically for `Chicken i Kimchi`.

Focus:
- clean demo/live data
- final business settings
- basic onboarding
- clear labels for unfinished modules
- hide or mark prototype features properly

## What is not important before Beta 1.0
These should not slow down the pilot build:
- full billing integration
- real documents backend
- real inventory backend
- enterprise features
- advanced analytics

## Beta checkpoints
- `Beta 0.3` = permissions and schedule baseline stable
- `Beta 0.5` = reporting and payroll trustworthy
- `Beta 0.7` = mobile-ready for daily use
- `Beta 0.9` = pilot-prep build
- `Beta 1.0` = ready for real restaurant testing

## Definition of Beta 1.0
We are at `Beta 1.0` when:
- one restaurant can run a full test week inside GastrOWO
- workers and manager can use it mainly from phone
- owner/admin can trust revenue and labor numbers
- there are no critical blockers in daily operation

## Simple rule for priorities
Before `Beta 1.0`, every decision should answer one question:

`Does this help real restaurant daily operation right now?`

If not, it should not be more important than:
- schedule
- reporting
- permissions
- mobile
- tasks
