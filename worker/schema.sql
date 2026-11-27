-- Launch Tracker schema. Idempotent: safe to run on every start.

create table if not exists tokens (
  id serial primary key,
  chain_id int not null,
  address text not null,
  name text,
  symbol text,
  decimals int not null default 18,
  total_supply numeric,
  deploy_block bigint,
  ref_pool_id text,
  ref_pool_pinned boolean not null default false,
  status text not null default 'pending',      -- pending | backfill | live | error
  scanned_to bigint,                            -- last block fully indexed
  error text,
  logo text,
  created_at timestamptz not null default now(),
  unique (chain_id, address)
);

create table if not exists pools (
  token_id int not null references tokens(id) on delete cascade,
  pool_id text not null,
  manager text not null,
  currency0 text not null,
  currency1 text not null,
  fee int not null,
  tick_spacing int not null,
  hooks text not null,
  created_block bigint not null,
  created_at timestamptz,
  token_is0 boolean not null,
  quote_address text not null,
  quote_symbol text not null,
  quote_decimals int not null,
  quote_kind text not null,                    -- native | wrapped | stable | other
  sqrt_price numeric,
  liquidity numeric,
  lp_fee int,
  primary key (token_id, pool_id)
);

create table if not exists trades (
  token_id int not null references tokens(id) on delete cascade,
  pool_id text not null,
  block bigint not null,
  tx text not null,
  log_index int not null,
  ts timestamptz not null,
  wallet text not null,
  side text not null,                           -- buy | sell
  token_amount numeric not null,                -- raw units, positive
  quote_amount numeric not null,                -- raw units, positive
  price_quote double precision,                 -- quote per token (human units)
  price_hype double precision,                  -- HYPE per token
  price_usd double precision,
  value_usd double precision,
  primary key (token_id, tx, log_index)
);
create index if not exists trades_token_ts on trades (token_id, ts);
create index if not exists trades_token_wallet on trades (token_id, wallet);

create table if not exists liquidity (
  token_id int not null references tokens(id) on delete cascade,
  pool_id text not null,
  block bigint not null,
  tx text not null,
  log_index int not null,
  ts timestamptz not null,
  sender text not null,
  delta numeric not null,
  primary key (token_id, tx, log_index)
);
create index if not exists liquidity_token_ts on liquidity (token_id, ts);

create table if not exists transfers (
  token_id int not null references tokens(id) on delete cascade,
  block bigint not null,
  tx text not null,
  log_index int not null,
  ts timestamptz not null,
  "from" text not null,
  "to" text not null,
  amount numeric not null,
  primary key (token_id, tx, log_index)
);
create index if not exists transfers_token_from on transfers (token_id, "from");
create index if not exists transfers_token_to on transfers (token_id, "to");
create index if not exists transfers_token_ts on transfers (token_id, ts);

-- Running balance per holder, maintained by the indexer.
create table if not exists balances (
  token_id int not null references tokens(id) on delete cascade,
  address text not null,
  balance numeric not null default 0,
  received numeric not null default 0,
  sent numeric not null default 0,
  peak numeric not null default 0,
  last_ts timestamptz,
  primary key (token_id, address)
);
create index if not exists balances_token_balance on balances (token_id, balance desc);

create table if not exists groups (
  id serial primary key,
  token_id int not null references tokens(id) on delete cascade,
  name text not null,
  color text not null default '#7fb4ff'
);

-- Tagged wallets per token. category: owned | kol | watched | linked
create table if not exists wallets (
  token_id int not null references tokens(id) on delete cascade,
  address text not null,
  category text not null,
  name text,
  color text,
  notes text,
  group_id int references groups(id) on delete set null,
  linked_to text,
  auto boolean not null default false,
  hidden boolean not null default false,        -- auto tag removed by a user: never re-added
  added_at timestamptz not null default now(),
  primary key (token_id, address)
);

-- Per chain address facts.
create table if not exists addresses (
  chain_id int not null,
  address text not null,
  kind text,                                    -- eoa | contract | delegated
  native_balance numeric,
  native_updated_at timestamptz,
  primary key (chain_id, address)
);

create table if not exists token_state (
  token_id int primary key references tokens(id) on delete cascade,
  exit jsonb,
  exit_updated_at timestamptz
);

create table if not exists native_prices (
  chain_id int not null,
  ts timestamptz not null,
  usd double precision not null,
  primary key (chain_id, ts)
);

create table if not exists users (
  id serial primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  role text not null default 'operator',        -- owner | operator
  created_at timestamptz not null default now(),
  last_seen timestamptz
);

create table if not exists sessions (
  id text primary key,
  user_id int not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text
);

create table if not exists invites (
  id text primary key,
  role text not null default 'operator',
  created_by int references users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by int references users(id) on delete set null
);

create table if not exists audit (
  id serial primary key,
  user_id int references users(id) on delete set null,
  action text not null,
  detail jsonb,
  ts timestamptz not null default now()
);

-- Live events for the SSE stream (worker -> web). Trimmed by the worker.
create table if not exists events (
  id bigserial primary key,
  token_id int,
  kind text not null,
  payload jsonb,
  ts timestamptz not null default now()
);

alter table pools add column if not exists lp_fee int;
