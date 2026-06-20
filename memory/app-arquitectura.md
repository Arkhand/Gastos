---
name: app-arquitectura
description: "Arquitectura funcional de la app Gastos (Next.js): pantallas, flujo de datos (API → React Query → Client), endpoints y reglas de negocio (libro compartido, soft-delete, edición in-situ, monedas/cotización, categorías, división, cierres, voz IA). Leer antes de tocar pantallas o lógica."
metadata:
  node_type: memory
  type: project
  originSessionId: 1f3c51ee-821e-4247-a3b3-e215857f855e
---

Mapa funcional de la app **Gastos** (stack y deploy en [[vercel-deployment]]; DB en [[supabase]]; diseño en [[claude-design]]). El código YA está comentado en español; este doc es el índice mental.

## Patrón general
- **Page server + `*Client.jsx`**: las pantallas con datos tienen una `page.jsx` server que valida sesión (`getUser`) y calcula `personaDefault` (`personaPorDefecto(user.email)`), y delegan el render a un componente cliente. Las páginas estáticas (Nosotros, índice de Config) son server directas.
- **Datos vía TanStack Query** (`lib/api.js`, `'use client'`): hooks `useGastos(mes)`, `useCategorias()`, `useDivision()`, `useMe()` + mutations (`useCrearGasto`, `useEditarGasto`, `useBorrarGasto`, `useCrear/Editar/Borrar/RevivirCategoria`, `useGuardarDivision`, `useCerrarMes`). Las cookies viajan solas (mismo origen). Errores: `req()` lanza `Error` con `.status` y `.code` (string corto tipo `'existe'`, `'division-suma'`) que la UI mapea a mensajes.
- **Endpoint central `GET /api/gastos?mes=YYYY-MM`**: devuelve TODO lo que el cliente necesita en una sola llamada — `{mes, mesActual, hoy, gastos (todos los activos, el cliente filtra por mes), categorias (activas), categoriasTodas (incl. archivadas para lookups), division, cierres, cotizacion, otrosId}`. El cliente hace los cálculos (con `lib/calculos.js`). `<Prefetch/>` (dentro de `AppShell`) ceba este cache en toda pantalla privada → navegar es instantáneo.
- **`config` global de catálogos con cache en memoria del servidor**: `categorias.js` y `division.js` mantienen una cache (TTL ~1 min, stale-on-fail) para poder leerse SÍNCRONA desde helpers; tras escribir se llama `recargarCategorias()`/`recargarDivision()`. Igual idea que `cotizacion.js` (dólar, TTL 30 min).

## Navegación
4 destinos (Sidebar en desktop + TabBar inferior en mobile, ambos con feedback "pending" optimista + `router.prefetch` al montar): **Cargar** `/inicio`, **Resumen** `/resumen`, **Nosotros** `/nosotros`, **Configuración** `/config` (con subrutas `/config/division` y `/config/categorias`). `AppShell` envuelve las privadas (Prefetch + CatColors + Sidebar/TabBar) y recibe `pageClass` (`page-inicio`/`page-resumen`/…). Mobile-first con capa responsive desktop por CSS.

## Pantallas
- **`/` (landing/login)** — `app/page.jsx` (server). Si hay sesión → `redirect('/inicio')`. Mascota Chubi + "Entrar con Google" (`/auth/google`). Muestra aviso si `?error=acceso|auth`.
- **`/inicio` (Cargar)** — `inicio/page.jsx` + `InicioClient.jsx`. Header con total de HOY (suma `monto_ars` de fecha=hoy) + botón Salir. **Micrófono** (`<Mic/>`): si la IA devuelve gasto completo → `guardarDirecto` (crea directo, toast con acción "Editar"); si falta algo → abre la hoja precargada. **FAB ＋** abre la hoja vacía. Lista "Últimos gastos" agrupada por día (`agruparPorDia`), filas `GastoRow` NO editables. Hoja (`<Sheet/>`) con `iaEnabled` (ofrece categoría "Automático").
- **`/resumen`** — `resumen/page.jsx` + `ResumenClient.jsx` (la pantalla más compleja). **Selector de mes** (meses con datos, marca 🤝 los cerrados). Toggle **Gastos | Gráficos**.
  - *Gastos*: mobile = filtros (texto/monto + persona) + lista por día con `GastoRow` editable (✏️ → abre la hoja). Desktop = tabla completa (`TablaDesktop`, subcomponente local) con KPIs (movimientos/total ARS/total USD/promedio), filtros (buscar/persona/categoría/moneda/agrupar) y totales al pie.
  - *Gráficos*: toggle 🤝 Compartidos / 👤 Mis gastos / Todos. Total del mes (ARS), **Ajuste de cuentas** (solo "compartidos": total compartido, % de división, saldo quién-debe-a-quién con `calcularSaldo`, estado abierto/cerrado, botón "Cerrar mes 🤝" en meses pasados), Total por persona, torta por categoría (`distribucionPorCategoria` → `conic-gradient`) + ranking de barras.
  - "Mis gastos" = todos los gastos a nombre del usuario logueado (incluye los compartidos suyos). "Compartidos" = `compartido !== false`.
- **`/nosotros`** — estática: tarjetas de la familia con fotos (`/mama.jpg`,`/papa.jpg`,`/nena.jpg`) y rings de color.
- **`/config`** — índice con links a División (⚖️) y Categorías (🏷️).
- **`/config/categorias`** (client) — alta (emoji+nombre+hint para la IA), editar inline, quitar (archiva si tiene gastos, borra físico si no), restaurar archivadas. "Otros" es imborrable (🔒).
- **`/config/division`** (client) — % por integrante (deben sumar 100; con 2 personas hay auto-balanceo). Guardar (`pct_<email>`).

## Endpoints API (`app/api/...`, todos requieren sesión salvo aviso)
- `GET /api/gastos` (ver arriba) · `POST /api/gastos` (crear; valida descripción + monto≥0; calcula `monto_ars`/`monto_usd` con la cotización; normaliza persona/categoría/`compartido`).
- `PATCH /api/gastos/:id` (editar in-situ) · `DELETE /api/gastos/:id` (baja lógica) · `POST /api/gastos/:id/corregir` (solo descripción+categoría; lo usa la corrección de la IA / deshacer).
- `GET/POST /api/categorias`, `PATCH/DELETE /api/categorias/:id`, `POST /api/categorias/:id/revivir` (alta valida nombre ≤24 y duplicados → `'existe'`/`'existe-borrada'`; DELETE archiva o borra según tenga gastos).
- `GET /api/division` · `PUT /api/division` (exige sumar 100 ± 0.01 → `'division-suma'`).
- `POST /api/cierres` (cierra un mes pasado, congela la foto del % vigente; `'ya-cerrado'`/`'mes-invalido'`).
- `POST /api/voz/interpretar` (texto→gasto) · `POST /api/voz/revisar` (limpia desc+categoría). Error de IA → 502 amigable.
- `GET /api/me` (usuario logueado o 401; el middleware lo deja pasar sin cookie a propósito).

## Reglas de negocio (CLAVE — no romper)
- **Libro compartido**: la app es de la familia; `db.js` NO filtra por `user_id` — todas las queries operan sobre todos los gastos (el primer arg `_userId` se ignora). Cada gasto guarda `cargado_por` (quién lo cargó, displayName) y `a_nombre_de` (la persona del gasto, como **email**; ver [[supabase]] y `lib/personas.js`).
- **Borrado lógico**: nada se borra físico en `gastos`; `eliminarGasto` marca `eliminado=true`. `listarGastos` filtra `eliminado=false`.
- **Edición IN-SITU**: `actualizarGasto` es un UPDATE sobre la misma fila (conserva el `id`). Antes era baja+alta y un doble-submit duplicaba; ahora no.
- **Gasto compartido vs personal**: columna `compartido` (bool, default true). Personal (`false`) no entra en el ajuste de cuentas; en la fila aparece chip "👤 Personal".
- **Dos monedas**: cada gasto guarda `monto`+`moneda` (ARS/USD) y además `monto_ars`+`monto_usd` precalculados con el **dólar bolsa/MEP** (`lib/cotizacion.js`, promedio compra/venta de dolarapi.com, cache 30 min). ARS y USD nunca se suman entre sí en los totales.
- **Categorías en BD** (antes fijas): `gastos.categoria` guarda el **UUID** (texto) de la fila en `categorias`. A la IA se le pasan los NOMBRES y el server mapea nombre→UUID (`nombreCategoriaAId`, comparación sin acentos). "Otros" (`es_otros`) es el fallback e imborrable. Colores: las 8 seed están en `legacy.css`; las nuevas (UUID) se colorean con `<CatColors/>` que inyecta `--bg/--ink` por `.cat-<id>`.
- **Personas** (`lib/personas.js`): 2 integrantes, id = email (`musiald@gmail.com` = "Dani Hombre" 👨, `danielapaulacastelli@gmail.com` = "Dani Mujer" 👩). `normalizarPersona` mapea email/label/alias → email canónico; la IA puede devolver "Desconocido" → la UI pide elegir (o cae en el logueado).
- **Cierres mensuales**: cerrar un mes congela una "foto" jsonb del % de división en `cierres`. Es definitivo (no se reabre); el reparto de un mes cerrado usa esa foto, no el % global vigente.
- **Fechas**: siempre en horario AR (`lib/fecha.js`, `Intl` zona Buenos_Aires). "Hoy"/"Ayer" y la agrupación deben coincidir con lo que ve la IA.
