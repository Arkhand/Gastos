-- Mercado Pago → gastos pendientes de cargar. RLS activado SIN políticas (como
-- gastos/categorias): solo el server con service_role accede.

create table if not exists public.mp_cuentas (
  owner               text primary key,            -- email de login (= gastos.a_nombre_de)
  mp_user_id          bigint not null,
  mp_nickname         text,
  metodo              text not null check (metodo in ('oauth', 'token')),
  access_token_enc    text not null,               -- AES-256-GCM (lib/mp/cripto.js)
  refresh_token_enc   text,                        -- solo oauth
  expira_at           timestamptz,                 -- solo oauth
  necesita_reconectar boolean not null default false,
  conectado_at        timestamptz not null default now()
);

create table if not exists public.mp_sync (
  owner                text primary key references public.mp_cuentas(owner) on delete cascade,
  desde                timestamptz,
  payments_sync_at     timestamptz,
  reporte_configurado  boolean not null default false,
  report_requested_at  timestamptz,
  report_downloaded_at timestamptz,
  last_error           text,
  last_error_at        timestamptz
);

create table if not exists public.mp_contactos (
  owner          text not null,
  id             text not null,                    -- 'mp:<collector_id>' | 'cbu:<22 dígitos>'
  nombre         text,
  sugerido       text,
  categoria      text,
  compartido     boolean,
  actualizado_at timestamptz not null default now(),
  primary key (owner, id)
);

create table if not exists public.mp_movimientos (
  id                 text primary key,             -- 'pay:<id>' | 'payout:<id>'
  owner              text not null,
  fuente             text not null,
  medio              text not null,
  mp_status          text,
  fecha_hora         timestamptz not null,
  fecha              date not null,
  monto              numeric not null,
  moneda             text not null default 'ARS',
  descripcion_mp     text,
  descripcion        text,
  categoria_sugerida text,
  contacto_id        text,
  estado             text not null check (estado in ('esperando', 'pendiente', 'agregado', 'descartado')),
  motivo             text,
  gasto_id           uuid,
  raw                jsonb,
  detectado_at       timestamptz not null default now(),
  actualizado_at     timestamptz not null default now(),
  foreign key (owner, contacto_id) references public.mp_contactos(owner, id)
);

create index if not exists mp_movimientos_owner_estado on public.mp_movimientos (owner, estado);
create index if not exists mp_movimientos_gasto on public.mp_movimientos (gasto_id) where gasto_id is not null;

alter table public.mp_cuentas enable row level security;
alter table public.mp_sync enable row level security;
alter table public.mp_contactos enable row level security;
alter table public.mp_movimientos enable row level security;
