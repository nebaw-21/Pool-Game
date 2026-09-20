# Poolroom — Between the Cards

A casino-themed betting game built with Next.js (App Router) and Supabase. Register an account, invite another registered player, agree on the bet deposit and money limit, and play "Between the Cards": deal two cards, bet that the third lands strictly between them, and win or lose against a shared pool. Chips are virtual — no real money is involved.

## Prerequisites

- Node.js `>=22.13.0`
- A [Supabase](https://supabase.com) project (free tier is fine)

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. In the SQL editor, run each file in [`supabase/migrations/`](supabase/migrations) **in order**: `0001_init.sql` (tables, RLS, Realtime), then `0002_multiplayer.sql` (multi-invite batches, N-player sessions), then `0003_fix_rls_recursion.sql` (fixes recursive RLS policies from 0002).
3. If an `alter publication` statement in those files fails because your project doesn't have a `supabase_realtime` publication yet, enable Realtime for `game_sessions`, `invitations`, and `invite_batches` from **Database → Replication** in the dashboard instead.
4. Under **Project Settings → API**, copy the Project URL, `anon` public key, and `service_role` secret key.
5. Copy [`.env.local.example`](.env.local.example) to `.env.local` and fill in those three values.
6. (Optional) Under **Authentication → Providers → Email**, decide whether to require email confirmation before sign-in.

## Getting started

```sh
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), register two separate accounts (e.g. one in a normal window, one in an incognito window), and send an invite from one to the other from the lobby.

## Scripts

- `npm run dev` — start the local development server
- `npm run build` — production build
- `npm run start` — run the production build locally
- `npm run lint` — run ESLint

## Project structure

- `app/page.tsx` — landing page (sign in / register / go to lobby)
- `app/(auth)/login`, `app/(auth)/register` — email/password auth pages
- `app/lobby` — send invites, respond to incoming invites (Realtime-updated)
- `app/table/[id]` — the live game UI, synced across both players via Supabase Realtime
- `app/api/create-invitation`, `app/api/respond-to-invitation`, `app/api/game-action` — server-side route handlers that own all writes (clients only ever read via RLS)
- `app/game.ts` — game state, reducer, and rules (deck, shuffle, betting, turns, settlement) — unchanged, and reused verbatim by `app/api/game-action`
- `app/sounds.ts` — Web Audio API sound effects
- `app/globals.css` — all styling (casino theme, card animations, layout)
- `lib/supabase/` — browser, server, and admin (service-role) Supabase clients
- `middleware.ts` — refreshes the auth session and redirects signed-out users away from `/lobby` and `/table/*`
- `supabase/migrations/0001_init.sql` — database schema and RLS policies

## How a game gets started

1. Both players register accounts.
2. One player opens their lobby, enters the other player's username, sets the bet deposit and (optionally) a money limit, and sends the invite.
3. The invitee sees the invite live in their lobby and accepts or declines it.
4. On accept, both players are dropped into the same `/table/[id]`, where all game actions (deal, bet, reveal, undo, etc.) go through `/api/game-action`, which enforces turn order and persists the result — both browsers stay in sync via Realtime.

Money limit and bet deposit are set once, at invite time, per the current design — there's no mid-table UI to add more opponents (v1 is 1-vs-1). Multi-invite tables are a natural fast-follow given `session_participants` already supports more than two rows per session.

## Deploying to Vercel

This is a standard Next.js app, so it deploys to Vercel with no extra configuration beyond environment variables:

1. Push this repository to GitHub (or GitLab/Bitbucket).
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Vercel auto-detects the Next.js framework — leave the default build settings (`next build`) as-is.
4. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as environment variables.
5. Click **Deploy**.

Every subsequent push to the connected branch will trigger a new deployment automatically.
