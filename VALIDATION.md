# Verification

## Automated checks

The backend suite covers exact attendance arithmetic, incomplete histories and academic units; optimistic-concurrency API writes; atomic batches and undo; Telegram signatures and owner access; calendar parsing, recurrence identity and overrides; validated JSON restore; and a real process restart against persistent SQLite.

The frontend passes TypeScript checking and a Vite production build. CI runs tests/migrations and frontend typecheck/build on clean Ubuntu runners.

## Browser checks

Actual Chrome checks at 360×800 and 1280×900 cover both themes, sticky table geometry, cross-course backlog, direct and batch marks, undo, simulated network failure and retry, month/day navigation, context-preserving details, future-session protection and updated charts after reload.

- `frontend/qa-calendar.mjs`: isolated synthetic fixture started with `scripts/qa_schedule.py`.
- `frontend/qa.mjs`: explicit demo fixture and single-client/reload checks.
- `frontend/qa-onboarding.mjs`: a fresh empty local test server on port 8001.
- `frontend/screenshots.mjs`: captures only an explicitly verified demo fixture. Published images contain fictional records.

## Scope of verification

Docker and HTTPS reverse-proxy deployment are prepared but were not built in the original development environment. Browser tests do not claim device-level Telegram verification. A real Telegram bot, owner ID and permanent HTTPS environment must be configured by each owner.

An imported calendar does not automatically confirm a complete semester. USOS formats and identities remain explicit; suspicious/all-day entries are not silently converted into lessons.
