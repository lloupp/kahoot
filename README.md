# QuizArena

A live, multiplayer educational quiz platform: teachers build quizzes and host
real-time games; students join from any device with a PIN and no account.

## Architecture

- **Backend** (`server/`): Node.js + TypeScript + Express + Socket.IO, Prisma
  ORM over SQLite.
  - REST API (`src/routes/`): teacher auth (JWT + bcrypt), quiz CRUD, session
    history/reports.
  - Real-time game engine (`src/game/GameManager.ts`): the single
    authoritative, in-memory source of truth for a live game — question
    timing (server timestamps, not client clocks), answer validation,
    deduplication, and speed-weighted scoring (`src/lib/scoring.ts`). A
    client can never set its own score, and every answer is checked against
    the socket actually bound to that participant, not just an id in the
    payload — otherwise one student's id (visible to classmates in lobby/
    leaderboard payloads) would let anyone answer on their behalf.
    Correctness is withheld from a submitting client until the question
    closes for everyone, so an early answer can't leak the right choice.
  - Socket.IO layer (`src/socket/index.ts`) wires client events to the
    `GameManager` and broadcasts state to each game's room (keyed by PIN).
  - Finished games are persisted (`src/game/persist.ts`) for the teacher's
    history and per-question reports.
- **Frontend** (`client/`): React + TypeScript + Vite + Tailwind CSS SPA.
  Teacher pages talk to the REST API with a JWT; both teacher and student
  live-game screens talk to the server over a single shared Socket.IO
  connection.
- **Data**: SQLite via Prisma (`server/prisma/schema.prisma`) — zero external
  services to run locally; swap the `DATABASE_URL` for Postgres/MySQL in
  production without touching application code, since Prisma abstracts the
  driver.

## Local development

Requires Node.js 18+.

```bash
npm install                       # installs both workspaces

cp server/.env.example server/.env
cd server && npx prisma migrate deploy && cd ..

cp client/.env.example client/.env

npm run dev:server                # http://localhost:4000
npm run dev:client                # http://localhost:5173 (separate terminal)
```

Open http://localhost:5173, register a teacher account, build a quiz, and
start a game. Students join at `/join` with the PIN shown on the host screen
— no account needed.

## Environment variables

**`server/.env`**

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma connection string (`file:./dev.db` for local SQLite) |
| `JWT_SECRET` | Signing secret for teacher auth tokens — set a real secret in production |
| `PORT` | HTTP/Socket.IO port (default 4000) |
| `CLIENT_ORIGIN` | Allowed CORS origin for the frontend |

**`client/.env`**

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Base URL of the backend (REST + Socket.IO) |

## Testing

```bash
cd server && npm test        # unit + integration + multiplayer simulation
npm run lint                 # both workspaces
npm run typecheck            # both workspaces
npm run build                # production build, both workspaces
```

The server test suite (`server/tests/`) covers: scoring math and PIN
generation (unit), auth and quiz-ownership REST behavior (integration via
supertest), and a multiplayer simulation over real Socket.IO connections
(`game.integration.test.ts`) exercising PIN-not-found, duplicate names, late
join, late/duplicate/invalid/stale answers, answer-impersonation rejection,
the no-correctness-leak contract, disconnect/reconnect for both students and
the host (including a host reload mid-question/mid-leaderboard), idempotent
game-ending, a lobby-cancel that skips writing history, and an empty-quiz
rejection. There is currently no client-side (React component) test suite —
the client is covered by manual browser verification (Playwright) plus
lint/typecheck/build, not automated component or e2e tests.

## Production notes

- Run `npm run build` in each workspace, then `node server/dist/index.js` to
  serve the API, and serve `client/dist/` as static files (e.g. behind
  Nginx or a CDN) with `VITE_API_URL` pointed at the deployed backend origin.
  Set `CLIENT_ORIGIN` on the server accordingly for CORS.
- Socket.IO requires sticky sessions (or a single backend instance) unless a
  shared adapter (e.g. Redis) is added — live game state currently lives in
  the process memory of `GameManager`, so horizontal scaling beyond one
  server instance is not yet supported.
- Swap SQLite for Postgres/MySQL by changing `datasource.provider` and
  `DATABASE_URL` in `server/prisma/schema.prisma` and re-running
  `prisma migrate`.

## Known limitations

- Question images are a URL field (http/https only), not a file upload —
  avoids needing object storage for this scope. A teacher hosts the image
  elsewhere and pastes the link.
- Live game state is in-memory per server process; a crash mid-game loses
  that game's *live* state (already-finished games are persisted, and a game
  idle for 30+ minutes is auto-persisted as "abandoned" before being dropped,
  but a crash between those points still loses it).
- No mid-question host control (skip/pause) and no automatic early-end when
  every connected player has answered — a question always runs its full
  configured timer.
- Reports are per-student, not per-question: `GameAnswer` doesn't carry a
  `questionId`, so there's no "which question did the class struggle with"
  view yet, only each student's own list of answers.
- Socket.IO is configured for WebSocket transport only; a network that blocks
  the WS upgrade (some school proxies) will fail to connect rather than
  falling back to polling.
- The join/answer rate limiter is per-socket, a mitigation against casual PIN
  guessing rather than a hard guarantee — a determined attacker opening many
  sockets isn't blocked by it (PIN error responses stay generic and games
  auto-expire as a backstop).
- No profanity/impersonation filtering on student display names beyond
  length trimming and per-session case-insensitive uniqueness.
