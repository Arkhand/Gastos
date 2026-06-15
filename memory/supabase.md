---
name: supabase
description: "Supabase project for Gastos — ref, table schema, RLS approach"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1f3c51ee-821e-4247-a3b3-e215857f855e
---

Supabase provisionado vía integración de Vercel Marketplace. Proyecto: **supabase-aqua-fence**, ref/project_id **eagnsivzummrzqvzubkv**, región us-east-1, Postgres 17, org `vercel_icfg_UgvcFFULhYFvMtB9Uo8Chy7x`.

Tabla `public.gastos` (7 filas al 2026-06-15), esquema REAL confirmado vía MCP `list_tables`: `id`(uuid pk, `gen_random_uuid()`), `user_id`(text, Google id del que carga), `cargado_por`(text, displayName), `a_nombre_de`(text, **email** de la persona del gasto), `descripcion`(text), `monto`(numeric), `moneda`(text default `'ARS'`, check `ARS`/`USD`), `categoria`(text, nullable), `fecha`(date, nullable), `created_at`(timestamptz default `now()`), `eliminado`(bool default `false`), `monto_ars`(numeric, nullable), `monto_usd`(numeric, nullable). Las 3 últimas (`eliminado`, `monto_ars`, `monto_usd`) se agregaron después de la migración inicial `create_gastos_table`.

**RLS activado SIN políticas a propósito**: la app accede con la `service_role key` desde Express (omite RLS). **NO filtra por `user_id`: es un libro compartido familiar** — `db.js` opera sobre todos los gastos y solo filtra `eliminado=false` (ver [[vercel-deployment]]). El advisor "RLS Enabled No Policy" (INFO) es esperado, no es un bug. La `anon` key no puede leer nada — deseado.

El MCP de Supabase (`.mcp.json`, http https://mcp.supabase.com/mcp) está conectado y se puede usar para gestionar la DB desde Claude Code.
