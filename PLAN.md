# Project roadmap

## Implemented

- Per-component attendance requirements and exact server calculations.
- Calendar, cross-course backlog, course tiles and quick brushes.
- Atomic bulk attendance, optimistic concurrency, retry and undo.
- Weekly insights with unknown marks kept separate.
- iCalendar preview/import, guarded USOS sync and preserved overrides.
- Owner-only Telegram authentication, theme/viewport integration and polling bot.
- Validated JSON restore, consistent SQLite backups and persistent-volume deployment.
- Unit/API tests, browser checks and a CI workflow.

## Possible next steps

- Device-level Telegram regression checks on the chosen production host.
- Optional single-instance scheduled calendar synchronisation.
- Automated backup delivery and retention configured by the owner.
- More calendar-provider adapters based on real, documented formats.

The app remains focused on personal attendance. Grades, teams, subscriptions and social features are outside the current scope.
