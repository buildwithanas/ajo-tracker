# Ajo Ledger — Community Contribution & Rotating Savings Tracker

A web app for tracking group savings/contributions the way Nigerian "ajo" groups (and any shared-expense group — roommates, event committees,
market associations) actually run them: a group of people contributing a
fixed amount on a schedule, with one member collecting the pot each cycle.

Built to replace the WhatsApp-chat-and-notebook method with something that
shows, at a glance, who has paid, who hasn't, and who collects next.

## Stack

- **Backend:** Node.js, Express, MySQL (via `mysql2`), JWT auth, bcrypt
- **Frontend:** React + Vite, React Router, plain CSS (no framework)

## Project structure

```
ajo-tracker/
├── backend/
│   ├── config/db.js          # MySQL connection pool
│   ├── controllers/          # auth, groups, cycles, contributions
│   ├── middleware/auth.js    # JWT verification
│   ├── routes/                # authRoutes.js, groupRoutes.js
│   ├── schema.sql             # database schema
│   ├── server.js              # Express app entry point
│   ├── test_api.sh            # 30-check end-to-end API test suite
│   └── frontend_integration_check.js  # verifies API response shapes match what the UI reads
└── frontend/
    └── src/
        ├── api/client.js      # fetch wrapper (attaches JWT, normalizes errors)
        ├── context/AuthContext.jsx
        ├── pages/AuthPage.jsx, Dashboard.jsx, GroupDetail.jsx
        └── index.css           # design tokens + all styling
```

## How it works

- **Groups** have a contribution amount, frequency, and an invite code.
  Anyone with the code can join (`POST /groups/join`).
- **Cycles** are opened by the group admin (e.g. "October's round," due Oct 1).
  Opening a cycle auto-creates a pending contribution row for every member.
- **Contributions**: each member marks their own contribution as paid; the
  admin can also mark on a member's behalf (for cash payments, etc.). A
  contribution can't be paid twice.
- **Rotating payout**: for `rotating` groups, each new cycle auto-assigns the
  next member (by join order) who hasn't collected a payout yet. Closing a
  cycle flags that member as having received their payout, so the rotation
  naturally advances.
- **Dashboard**: total collected, total outstanding, and who's up next —
  per group.

## Setup

### 1. Database

You need a MySQL or MariaDB server running locally.

```bash
mysql -u root -e "
  CREATE DATABASE ajo_tracker;
  CREATE USER 'ajo_app'@'localhost' IDENTIFIED BY 'your_password_here';
  GRANT ALL PRIVILEGES ON ajo_tracker.* TO 'ajo_app'@'localhost';
  FLUSH PRIVILEGES;
"
mysql -u root ajo_tracker < backend/schema.sql
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env   # then edit DB_PASSWORD and JWT_SECRET
npm start               # or: npm run dev (auto-restarts on changes)
```

The API runs on `http://localhost:4000`. Check it's up:

```bash
curl http://localhost:4000/api/health
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). It's already
configured (via `.env`) to talk to the backend at `http://localhost:4000/api`
— change `VITE_API_URL` if your backend runs elsewhere.

## Testing — what was actually verified

Every claim below was run, not just written:

1. **`backend/test_api.sh`** — 30 automated checks against a live MySQL
   database and a running server: registration, login, duplicate-email and
   wrong-password rejection, group creation, joining by invite code,
   duplicate-join and bad-code rejection, membership-gated access (403 for
   non-members, 403 for non-admins trying admin actions), cycle creation
   with auto-generated per-member contributions, paying your own
   contribution, being blocked from paying someone else's, admin override,
   blocking a double-pay, dashboard totals math, closing a cycle and
   confirming the payout rotation advances to a *different* member next
   cycle, and auth-token enforcement.

   **Result: 30/30 passing.**

   Run it yourself: start the backend, then `bash backend/test_api.sh`.

2. **`backend/frontend_integration_check.js`** — replays the exact sequence
   of API calls the React UI makes and checks that every field each
   component reads (`group.contribution_amount`, `member.has_received_payout`,
   `contribution.member_id`, etc.) is actually present, with the right type,
   in live responses. This caught one real bug during development: MySQL was
   returning `has_received_payout` as `1`/`0` instead of a JSON boolean,
   which would have silently broken the "received/waiting" stamps in the UI.
   Fixed in `groupController.js` by casting with `!!` before responding.

   **Result: 11/11 passing** after the fix.

3. **Frontend build** — `npm run build` compiles cleanly with no errors;
   `npm run dev` was started and every page module was fetched from the dev
   server to confirm there are no import/syntax errors.

What wasn't verified: actual pixel-level rendering in a real browser (this
sandbox couldn't download a headless Chromium — network access here is
locked to package registries). The component logic itself was traced
field-by-field against live API responses instead, which is the part most
likely to silently break.

## Design notes

The UI leans on a "passbook" (the little paper booklet Nigerian ajo/esusu
groups traditionally used to record contributions) as its visual metaphor —
indigo and ochre stamp accents, a stitched left margin on each card, and
literal rubber-stamp badges for "paid." Deliberately not another generic
SaaS-card dashboard.

## Known limitations / next steps

- No SMS/email reminders yet (the original pitch mentioned these — v1 here
  is the tracking core; reminders would be a good next feature, probably via
  a cron job checking `cycles.due_date`).
- No payment-proof image upload.
- Currency is stored per-group but the frontend only formats `NGN` specially;
  other currencies still work, just render as `"USD 100"` rather than `$100`.
- No password-reset flow.
