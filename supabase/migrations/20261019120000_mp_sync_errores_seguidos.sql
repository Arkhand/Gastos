-- Consecutive failed sync runs per account: the error push waits until 4 in a row
-- (Mercado Pago throws one-off 500s that fix themselves on the next run).
alter table public.mp_sync add column if not exists errores_seguidos integer not null default 0;
