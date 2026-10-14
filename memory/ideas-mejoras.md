---
name: ideas-mejoras
description: "Backlog de ideas para mejorar la app Gastos (no implementadas). Usar cuando Dani pida ideas o mejoras. Incluye de dónde salió cada una y por qué conviene."
metadata:
  node_type: memory
  type: project
---

# Ideas para mejorar la app (backlog, sin implementar)

Cuando Dani pida ideas para mejorar la app, arrancar por esta lista (y sumar las nuevas acá).

## De mirar Mi Platita (2026-10-14)
Origen: https://www.producthunt.com/products/mi-platita (sitio https://miplatita.app). No resuelve lo de
Mercado Pago: solo importa CSV/PDF del home banking a mano, sin conexión a cuentas. Las ideas que sirven,
ordenadas por cuánto reusan lo que ya existe (push, categorías, datos de MP — ver [[mercadopago]]):

1. **Presupuesto por categoría + aviso push** ("Llevás $80.000 de $100.000 en Comida"). Recomendada:
   los avisos push ya andan.
2. **Detectar suscripciones**: MP ya marca `recurring_payment` (Meli+, débitos automáticos) → chip
   🔁 y total mensual de suscripciones. Recomendada.
3. **Gastos hormiga**: resumen mensual de compras chicas y frecuentes (kiosco, panadería).
4. **Comparación mes a mes por categoría** en Resumen.
5. **Importar el resumen de cuenta de MP (CSV)** como plan B para lo que el automático no ve a tiempo
   (QR interoperables, que llegan por el reporte con ~1–2 h de demora).

Otras de Mi Platita menos prioritarias: seguimiento de cuotas, detectar duplicados/cobros raros,
registro de ingresos y proyección de gasto, exportar a CSV (Resumen ya exporta a Excel).

## De mirar TomasJunor/registro-de-gastos (2026-10-14)
Origen: https://github.com/TomasJunor/registro-de-gastos (mismo release report de MP, 1 vez/día; lo
nuestro es más completo: tiempo real + push). Ideas útiles:

1. **Cuentas "internas" / no es gasto** (recomendada): marcar un contacto (`mp_contactos`) como "mía" o
   "para saldar la división" → las transferencias a esa cuenta se descartan solas. Riesgo real hoy:
   transferir a tu propio banco o a Dani Mujer para saldar aparece como gasto.
2. **Categoría aprendida por comercio sin IA**: si cargaste "Producto de panaderia" como Comida, la
   próxima vez del mismo comercio sugerir Comida directo (como hacemos con los contactos).
3. **Devoluciones de gastos ya cargados**: si MP devuelve un pago `agregado`, proponer borrar/ajustar.
4. **Diccionario de comercios AR → categoría** (CHINO→Super, RAPPI→Delivery, YPF→Combustible,
   EDENOR→Servicios; ver su `categorias.yaml`) como pista para la IA o primera pasada.

## Pendientes chicos conocidos (de las reviews de MP)
Ver la sección "Minors diferidos" de [[mercadopago]] (badge del push, logout no desuscribe, etc.).
