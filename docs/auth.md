FULL AUTH & ONBOARDING REFACTOR FOR GASTROWO

Remove old email/password and UID logic entirely. Replace with a modern onboarding wizard and a magic link / OTP code login system.

I will describe the full flow. Implement exactly this.

---

## 1. ONBOARDING WIZARD (New User Registration)

The registration is a 4-step wizard with smooth transitions. No more "Sign in / Sign up" on one screen(safe the  Stay on top of shifts, staff, and restaurant operations without friction. block during this process).

### Step 1: Choose name and Role
- Question: "Are you an Owner or a Worker?"
- name input
- Two large, styled buttons: "I’m an Owner" | "I’m a Worker"
- Below them, a small text link: "Already have an account? Sign in"

### Step 2: Email
- One field: Email
- One button: "Send Code" (we will connect resend)
- System sends a 6-digit code to the email (valid 5 minutes)
- User enters the code on this screen
- If the code is correct:
  - If Owner → proceed to Step 3
  - If Worker → account created immediately, logged in, redirected to waiting screen. Skip Step 3 and 4.

### Step 3: Set Password (Owner ONLY)
- Only for Owners.
- Two fields: Password, Confirm Password
- Minimum 8 characters, no other complexity rules.
- After setting → proceed to Step 4.

### Step 4: Source (Owner ONLY)
- Question: "How did you hear about us?"
- Options (selectable buttons): Google, Instagram, TikTok, Recommendation, firends, Other
- After selecting → account created, logged in, redirected to dashboard with onboarding guide.

---

## 2. LOGIN (Returning User)

- One field: Email
- One button: "Send Code"
- System sends a 6-digit code (valid 5 minutes)
- User enters the code
- If correct → logged in, redirected to dashboard.
- No passwords for Workers. Owners can alternatively use their password.

---

## 3. REMOVE UID ENTIRELY

- Delete the `public_uid` field from the User model.
- Delete all endpoints and logic related to UID.
- UID no longer exists in the system.

---

## 4. INVITING WORKERS TO A BUSINESS

### Case A: Worker already registered in the system
- Owner enters the Worker's email on the Team page.
- System checks: is this email already registered?
- If YES:
  - Check if this Worker is already a member of THIS business.
  - If already a member → system just adds the worker to the system
  - If NOT a member → immediately add the Worker to the business. Show success message "User added to your team".
- A Worker CANNOT be a member of two businesses simultaneously. If the Worker wants to join another business, they must register a new account with a different email.

### Case B: Worker does NOT exist in the system
- Owner enters the Worker's email.
- System checks: is this email registered?
- If NO:
  - Send an invitation email to this address.
  - The email contains a magic link: `https://gastrowo.pl/join?email=worker@example.com&token=INVITE_TOKEN`
  - The link leads to a pre-filled registration page (the email field is already filled and locked).
  - The Worker only needs to click "Get Code", enter the received 6-digit code, and they are automatically:
    1. Registered in the system.
    2. Added to the inviting Owner's business.
    3. Logged in and redirected to the dashboard.
- The invite token is single-use, valid 48 hours. After use, it's deleted.

---

## 5. SECURITY REQUIREMENTS

- 6-digit OTP code: valid 5 minutes, stored in Redis (or memory store), deleted after use.
- Passwords (for Owners only): hashed.
- Invite token: random UUID, single-use, 48 hours TTL, deleted after use.
- Worker cannot be a member of two businesses at once. Enforce this at the database level (unique constraint on `user_id` in `organization_members`).

---

## 6. UI/UX REQUIREMENTS

- Smooth transitions between wizard steps (fade or slide).
- Show which step the user is on (e.g., "Step 2 of 4").
- Back button on each step (except Step 1).
- Clean, minimal design. Mobile-first.
- Empty state for Owner dashboard after first login: a short onboarding guide.

for code emails create a beatufil minimalistic design