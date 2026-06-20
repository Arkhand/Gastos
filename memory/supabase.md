---
name: supabase
description: "Supabase de Gastos — ref del proyecto, esquema real de las 4 tablas (gastos/categorias/division/cierres) y enfoque de RLS. Cómo se usa la DB en [[app-arquitectura]]."
metadata:
  node_type: memory
  type: project
  originSessionId: 1f3c51ee-821e-4247-a3b3-e215857f855e
---

Supabase provisionado vía integración de Vercel Marketplace. Proyecto **supabase-aqua-fence**, ref/project_id **eagnsivzummrzqvzubkv**, región us-east-1, Postgres 17, org `vercel_icfg_UgvcFFULhYFvMtB9Uo8Chy7x`. La app accede SIEMPRE con la `service_role key` desde el servidor (`lib/db.js`); la `anon` key no se usa en el cliente. El MCP de Supabase (`.mcp.json`) está conectado y sirve para gestionar la DB desde Claude Code.

Esquema REAL al 2026-06-20 (confirmado vía MCP `list_tables`). **4 tablas**:

**`public.gastos`** (pk `id` uuid `gen_random_uuid()`, 27 filas):
- `user_id` (text, Google id del que carga) · `cargado_por` (text, displayName) · `a_nombre_de` (text, **email** de la persona del gasto)
- `descripcion` (text) · `monto` (numeric) · `moneda` (text default `'ARS'`, check `ARS`/`USD`)
- `categoria` (text, nullable — guarda el **UUID** de `categorias` como string) · `fecha` (date, nullable)
- `created_at` (timestamptz `now()`) · `eliminado` (bool default false, borrado lógico)
- `monto_ars` / `monto_usd` (numeric, nullable — precalculados con la cotización)
- `compartido` (bool default true — false = gasto personal, fuera del ajuste de cuentas). **Columna nueva**; junto con `categoria` ahora apuntando a UUID son los cambios desde el esquema viejo.

**`public.categorias`** (pk `id` uuid, 9 filas): `nombre` (text) · `emoji` (text default ✨) · `color_bg` (text default `#e3e0ea`) · `color_ink` (text default `#5a5570`) · `hint` (text nullable, pista para la IA) · `orden` (int default 100) · `es_otros` (bool, la categoría fallback imborrable) · `eliminado` (bool, soft-delete/archivar) · `created_at`. Los gastos referencian su `id` por texto (no hay FK declarada).

**`public.division`** (pk `persona`, 2 filas): `persona` (text = email del integrante) · `porcentaje` (numeric default 50) · `updated_at`. Es el % global vigente del reparto compartido.

**`public.cierres`** (pk `mes`, 0 filas al 2026-06-20): `mes` (text `YYYY-MM`) · `division` (**jsonb**, foto congelada `{email: pct}`) · `cerrado_por` (text nullable) · `created_at`. Si existe la fila, el mes está cerrado (🤝) y su reparto usa esa foto.

**RLS / seguridad**:
- `gastos` y `categorias`: RLS **activado SIN políticas** a propósito → solo el `service_role` (servidor) accede; la `anon` key no lee nada. El advisor "RLS Enabled No Policy" (INFO) es esperado.
- `division` y `cierres`: RLS **DESHABILITADO** (advisor `rls_disabled`, CRITICAL). En la práctica el riesgo es bajo porque la app no expone la `anon` key al cliente, pero idealmente deberían tener RLS activado igual que las otras. SQL de remediación (NO aplicado, pedir al usuario antes): `ALTER TABLE public.division ENABLE ROW LEVEL SECURITY; ALTER TABLE public.cierres ENABLE ROW LEVEL SECURITY;` (sin políticas, igual que gastos/categorias — el service_role las omite).

**No filtra por `user_id`: es un libro compartido familiar** — `db.js` opera sobre todos los gastos (ver [[app-arquitectura]]).
