-- Avisos push de Mercado Pago: una fila por dispositivo suscripto y la marca de
-- "ya avisado" en cada movimiento. RLS activado SIN políticas (solo el server).
create table if not exists public.mp_push (
  endpoint     text primary key,          -- URL del servicio push de un navegador/dispositivo
  owner        text not null,             -- email de la app (= mp_cuentas.owner)
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  creado_at    timestamptz not null default now(),
  ultimo_ok_at timestamptz
);
create index if not exists mp_push_owner on public.mp_push (owner);
alter table public.mp_push enable row level security;

alter table public.mp_movimientos add column if not exists notificado_at timestamptz;
