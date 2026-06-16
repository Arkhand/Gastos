---
name: claude-design
description: Proyecto design-system en claude.ai/design 'Gastos Design' y su bundle local sincronizable
metadata:
  type: project
---

El trabajo de diseño en Claude Design (claude.ai/design) vive en un proyecto **design-system** llamado **"Gastos Design"**, projectId `7d4d4a35-8597-4166-81b8-71587804f9b4`, en la cuenta `musiald@gmail.com`.

Se sincroniza con la herramienta DesignSync (flujo /design-sync) desde la carpeta local **`design-system/`** del repo. El bundle son previews HTML autocontenidas (cada una con marcador `<!-- @dsCard group="..." -->` en la primera línea) que linkean a `design-system/style.css` (copia de [public/style.css](public/style.css), la fuente de verdad del diseño "chibi"). Grupos: Fundamentos (colors/typography), Botones, Componentes (expense-row/sheet-form), Navegación (tabbar), Feedback (toasts), Mascota Chubi, Datos y gráficos (resumen), Pantallas (nosotros). La preview `nosotros.html` usa fotos reales del equipo, así que el bundle incluye copias de `mama.jpg`/`papa.jpg`/`nena.jpg` (de [public/](public/)) referenciadas relativamente. Ojo: las clases CSS `.chibi-mama/.chibi-nena/.chibi-papa` existen pero NO se usan en la app (la pantalla real usa fotos).

Para volver a sincronizar tras cambiar el CSS: copiar `public/style.css` → `design-system/style.css`, ajustar las previews, y correr finalize_plan + write_files contra ese projectId (localDir = `c:/Users/musia/Desktop/GastosVercel/design-system`).

SOPORTE DESKTOP: el diseño desktop se prototipó en este proyecto (archivos `Gastos Escritorio.html` con 3 variantes, `Gastos Cargar/Resumen/Movimientos/Nosotros.html`) — sidebar lateral + dashboards en grilla. Se implementó en el repo como **capa responsive** (no rewrite): partial `partials/sidebar.ejs` + bloque `@media (min-width:900px)` al final de [public/style.css](public/style.css) + wrapper `.app-shell` y clases `page-inicio/page-resumen/page-nosotros`. Los wrappers `.dk-cols/.dk-col-main` son `display:contents` en mobile (mobile intacto). En Inicio el sheet se ancla inline en desktop. **Movimientos NO es una sección propia** (se eliminó ruta/vista/nav). Su tabla detallada (KPIs + filtros búsqueda/persona/categoría/moneda/agrupar + totales) vive ahora **dentro de Resumen, vista "Gastos", SOLO en desktop** (`.gastos-desktop`); en mobile esa vista muestra la lista editable de siempre (`.gastos-mobile`). El controller `resumen` pasa `movs`/`movsJson` (vía helper `filaMovimiento`, lee `monto_ars`/`monto_usd` ya guardados, incluye `id`). El botón ✏️ de cada fila de la tabla dispara el lápiz `.exp-edit` de la lista mobile (oculta pero en el DOM), que app.js ya cablea → reusa toda la lógica de edición sin recargar. El sidebar/tabbar tienen 3 items (Cargar/Resumen/Nosotros).

OJO: existe **otro** proyecto viejo en claude.ai/design llamado **"Gastos"** (`0bc2489e-d563-4fb6-9c07-538e243322e0`) que es de tipo PROJECT_TYPE_PROJECT (proyecto normal, NO design-system), por eso no aparece en list_projects ni se puede sincronizar. El tipo es inmutable. Ver [vercel-deployment]].
