# Poolroom — Between the Cards

A casino-themed betting game built with Next.js (App Router). Add opponents to a table, deposit into a shared pool, and play "Between the Cards": deal two cards, bet that the third lands strictly between them, and win or lose against the pool.

## Prerequisites

- Node.js `>=22.13.0`

## Getting started

```sh
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` — start the local development server
- `npm run build` — production build
- `npm run start` — run the production build locally
- `npm run lint` — run ESLint

## Project structure

- `app/page.tsx` — the game UI
- `app/game.ts` — game state, reducer, and rules (deck, shuffle, betting, turns, settlement)
- `app/sounds.ts` — Web Audio API sound effects
- `app/globals.css` — all styling (casino theme, card animations, layout)

## Deploying to Vercel

This is a standard Next.js app, so it deploys to Vercel with no extra configuration:

1. Push this repository to GitHub (or GitLab/Bitbucket).
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Vercel auto-detects the Next.js framework — leave the default build settings (`next build`) as-is.
4. Click **Deploy**.

Every subsequent push to the connected branch will trigger a new deployment automatically.
