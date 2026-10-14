# Credentials and personal records

Keep bot tokens, Telegram IDs, private calendar URLs, database files and exports outside Git. `.env.example` contains empty fields; `.env`, runtime state, SQLite files and personal exports are ignored.

Production validates Telegram `initData` on the backend and accepts one configured numeric Telegram user ID. Development authentication is explicit, loopback-only and forbidden in production. All attendance APIs require a short-lived bearer session.

Never include a token, raw `initData`, private URL or personal attendance export in an issue. When reporting an access-control or data-exposure problem, start with a minimal description and synthetic reproduction without credentials.
