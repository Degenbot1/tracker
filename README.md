# Launch Tracker

Team dashboard for our token launches on Elysium (chain 99901): live trades, holders, pools,
our wallets with exit value, KOL wallets and their linked wallets. Rebuilt from the structure of
MTLabz's Railway tracker. No private keys on the server, no selling, no market making.

## What runs

One service, two processes (`npm start` starts both):

- **worker** (`worker/main.ts`): reads Uniswap v4 Initialize / Swap / HookSwap / ModifyLiquidity and
  ERC-20 Transfer logs from the Elysium RPC into Postgres every 3 s. Backfill of a token takes about a
  minute. Every 30-120 s it refreshes pool state, the exit simulation, HYPE balances and KOL auto-tags.
  HYPE/USD comes from CoinGecko (hourly history + spot every 2 min). It creates the schema on start.
- **web** (Next.js 16): pages and `/api/*`, cookie sessions, roles owner/operator.

## Run locally

```bash
# Postgres 16 running, an empty database
cp .env.example .env    # set DATABASE_URL
npm install
npm run build
npm start               # worker + web on $PORT (default 3000)
```

Open `/setup` once to create the first owner and team. After that `/setup` redirects to `/login`;
more people join through an invite link from the Team page (one use, 7 days).

## Deploy on Railway (same as theirs)

1. New project, add the **PostgreSQL** plugin.
2. Add a service from this folder or repo. Build `npm run build`, start `npm start`.
3. Variables: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, optional `ELYSIUM_RPCS`, `COINGECKO_API_KEY`.
4. Open the public URL and go to `/setup`.

Only one copy of the worker may run per database. Keep the service at one replica.

## Rules worth knowing

- **Ref pool**: the pool with the most swaps, unless pinned from the Pool tab. Price, chart, ATH and exit use it.
- **Exit**: constant-product sell on the ref pool's virtual reserves (from liquidity and sqrtPrice, LP fee
  applied). A group's exit is all its wallets sold in one go, so it is lower than the sum of single exits.
- **Wallet of a trade**: whoever's token balance moved in that tx (routers, hooks and pool managers are skipped),
  falling back to the tx signer.
- **KOL auto-tag**: an EOA (or 7702-delegated EOA) that received tokens directly from one of our wallets.
  **Linked**: an EOA that received tokens from a KOL. **Exited**: less than 5% of its peak left, linked wallets
  included; **selling**: has sells; otherwise **holding**.
- **Circulating supply**: total supply minus the dead-address balance.
- Custom-curve hooks emit Swap with zero amounts; the real amounts come from the hook's HookSwap event.

## Layout

```
app/            pages (overview, token, team, account, login, setup, invite) and app/api routes
components/     Shell, charts and tables of the token page
lib/            db, rpc, chains, auth, queries, format
worker/         schema.sql, indexer, wallets/exit, prices, main loop
scripts/start.mjs   starts worker + web together
```
