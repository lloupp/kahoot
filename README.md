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
npm test                     # both workspaces (server + client)
npm run lint                 # both workspaces
npm run typecheck            # both workspaces
npm run build                # production build, both workspaces
```

The server test suite (`server/tests/`, vitest + supertest + socket.io-client,
54 tests) covers: scoring math, PIN generation, and the name filter (unit),
auth and quiz-ownership REST behavior (integration), and a multiplayer
simulation over real Socket.IO connections (`game.integration.test.ts`)
exercising PIN-not-found, duplicate names (and that a disconnected holder's
name frees up rather than locking out forever), late join, late/duplicate/
invalid/stale answers, answer-impersonation rejection, the
no-correctness-leak contract, disconnect/reconnect for both students and the
host (including a host reload mid-question/mid-leaderboard), idempotent
game-ending, early-close-when-everyone's-answered (including on the last
holdout disconnecting, not just answering), host-skip as a genuine no-op
outside an active question, per-question analytics (including a
never-reached question reported as "unscored" rather than silently
renumbering the rest), a lobby-cancel that skips writing history, a
35-student-one-IP classroom join+answer regression test, a host-side PIN-scan
throttling test, and an empty-quiz rejection.

The client test suite (`client/src/**/*.test.{ts,tsx}`, vitest + React
Testing Library + jsdom, 65 tests) covers the quiz-draft validation logic,
the countdown hook, `AuthContext` (login/register/logout, localStorage
persistence, restoring a session), page-level behavior for Login,
StudentJoin (including PIN format validation and server-error handling),
Dashboard (loading/empty/error states, start/delete actions), and the two
most stateful screens — `HostSession` and `StudentSession` — against a fake
socket double: the host-reload-mid-question/mid-leaderboard regression, that
the reveal screen never marks a correct choice before the reveal event
arrives, and that a student rejoining mid-question after already answering
is shown "answer locked in" rather than the answer buttons or any
correctness. There is no full browser e2e suite for the client — that's
covered by manual Playwright verification instead (see the session notes for
what was run).

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
  that game's *live* state (already-finished games are persisted, an idle
  game is auto-persisted as "abandoned" after 30 minutes, and a graceful
  shutdown (SIGTERM/SIGINT) persists every in-progress game before exiting —
  but an actual crash, as opposed to a clean stop or restart, between those
  points still loses it). Horizontal scaling beyond one server process would
  need a shared adapter (e.g. Redis) for Socket.IO plus moving `GameManager`'s
  state out of process memory — not implemented.
- The host can skip a question early and it also auto-closes once every
  connected player has answered, but there's no pause/resume control.
- Two separate rate limiters exist: a strict per-socket+per-IP one on the
  actual PIN-guessing surface (student:join, student:rejoin, and host:join —
  reachable by any registered account, since registration is open) and a
  generous one on already-authenticated in-game actions (student:answer,
  host controls) so real gameplay pacing never collides with anti-guessing
  limits. Both are a mitigation, not a hard guarantee — a patient attacker
  distributed across many IPs isn't blocked by them (PIN error responses
  stay generic and games auto-expire as a backstop).
- Student names are checked against a small, generic blocklist
  (`server/src/lib/nameFilter.ts`) plus length trimming and per-session
  case-insensitive uniqueness — a basic first line of defense, not a
  comprehensive profanity filter, and it has the classic substring-matching
  false-positive risk (e.g. it would also reject "Scunthorpe"). A teacher
  has no way to remove or rename a participant who slips past it or gets a
  false positive mid-game.
- Client tests cover logic and page-level behavior in isolation (mocked
  API/socket), not a full rendered browser flow end to end — that gap is
  covered by manual Playwright verification instead, not an automated
  e2e suite.
