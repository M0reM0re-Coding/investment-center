-- 016 (2026-11-25): Portfolio page (design rounds 49-50, option P2 "trade ledger").
-- Run once in Supabase -> SQL Editor -> paste -> Run. Safe to run twice.
--
-- One row per Buy / Sell / Dividend / Opening balance. The website works out average cost (weighted average),
-- realised and unrealised P&L and dividends from these rows; nothing else is stored.
-- PRIVATE: row-level security means each login only ever sees its own rows. The robot (service role) may READ
-- them only to know which stocks you own (World Brief "You own ..." badges); it never changes them.

create table if not exists public.trades (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('buy', 'sell', 'div', 'open')),
  ticker      text not null,                 -- as the site shows it: NVDA, PTT, 7203.T ...
  day         date not null default current_date,
  shares      numeric not null check (shares > 0),
  price       numeric not null check (price >= 0),   -- per share, in the stock's own currency (dividend: per share paid)
  fee         numeric not null default 0 check (fee >= 0),   -- broker fee (buy/sell) or tax withheld (dividend)
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists trades_user_day on public.trades (user_id, day);

alter table public.trades enable row level security;
drop policy if exists "own trades" on public.trades;
create policy "own trades" on public.trades for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.trades to authenticated;
grant select on public.trades to service_role;
