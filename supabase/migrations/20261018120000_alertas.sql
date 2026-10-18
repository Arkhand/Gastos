-- Avisos de error por push: una fila por tipo de error (clave) con el último aviso,
-- para no mandar el mismo más de una vez cada 6 h. RLS activado SIN políticas (solo el server).
create table if not exists public.alertas (
  clave           text primary key,      -- p. ej. 'ia:groq/llama-3.3-70b-versatile', 'api/gastos POST'
  ultimo_aviso_at timestamptz not null,
  ultimo_error    text,
  veces           integer not null default 0  -- repeticiones sin avisar desde el último aviso
);
alter table public.alertas enable row level security;
