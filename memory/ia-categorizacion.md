---
name: ia-categorizacion
description: Categorización con IA (2026-10-18) — por qué había tantos "Otros", modelo Groq dado de baja, "Automático" resuelto en el server, avisos push de errores (tabla alertas) y badge del push. Leer antes de tocar lib/ia.js o los avisos.
metadata:
  type: project
---

# Categorización con IA y avisos de error (2026-10-18)

## Diagnóstico (semana 2026-10-04..18)
- ~25 gastos en "Otros". Causas, en orden de peso:
  1. "Automático" en la hoja manual guardaba "Otros" SIN llamar a la IA (nunca se implementó).
  2. Transferencias de MP no pasan por la IA: toman la categoría del contacto, y los contactos aprendieron "Otros".
  3. `groq:llama-3.3-70b-versatile` (1º de IA_MODELOS) fue dado de baja → 404 en cada llamada; todo caía a Gemini
     (2.5-flash con 429 por cuota) y terminaba en flash-lite, el más flojo. Nadie se enteró → por eso los avisos de error.
  4. Prompt: confundía Comida/Súper (carnicería, chino, verdulería → Comida), "Kaia" en la descripción → "Regalos Kaia",
     "Producto de Servicio" (MP) → Servicios.
- Groq disponibles al 2026-10-18: openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.8-27b. Límites gratis bajos
  (con el prompt de ~1300 tokens, ~6 llamadas/min antes de 429). IA_MODELOS vive en `.env` y en Vercel.

## Cambios
- Hoja: "✨ Automático" es el valor inicial (opción `hidden`, no aparece en la lista). El front manda `categoria: 'auto'`
  y `POST /api/gastos` llama `categoriaAutomatica()` (lib/ia.js): IA o "Otros" si falla. Si la persona elige otra, queda esa.
- Pendientes de MP abren en Automático, salvo contacto con categoría aprendida distinta de Otros.
- Prompt de revisión: sección "Cómo elegir la categoría" (Comida vs Súper, transferencias, "Producto de X", personas).

## Avisos push de errores
- `lib/alertas/` (`reportarError` en los catch de las rutas, `avisarError` en IA y sync MP). Solo a Dani Hombre
  (`DESTINO_ALERTAS`), máx. 1 aviso por clave cada 6 h (tabla `alertas`, migración `20261018120000_alertas.sql`).
- IA: avisa modelo caído (no 429, que es esperable) y "todos fallaron". Se manda con `after()` (no demora el request).
- Scripts fuera de Next: `next/server` no resuelve en Node plano → usar un hook de resolve (`next/server.js`).
- Badge del push: `public/badge-96.png` (silueta blanca sobre transparente). Android usa solo el alfa: con el ícono a color salía un círculo blanco.

Ver también [[mercadopago]], [[app-arquitectura]], [[vercel-deployment]].
