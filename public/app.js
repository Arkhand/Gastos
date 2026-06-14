/* app.js — lógica del navegador para la pantalla de inicio:
   - abrir/cerrar la hoja inferior (sheet) para cargar o editar un gasto
   - chips de categoría, toggle de moneda y selector de fecha
   - micrófono: voz -> texto (Web Speech API) -> /api/interpretar (Gemini) -> hoja
   Todo es defensivo: si una pantalla no tiene estos elementos, no hace nada. */
(function () {
  'use strict'

  var MIC_IDLE = 'Tocá y contame un gasto'

  // --- Elementos (pueden no existir en resumen/nosotros/landing) ---
  var sheet = document.getElementById('sheet')
  var form = document.getElementById('sheet-form')
  var deleteForm = document.getElementById('sheet-delete-form')
  var sheetTitle = document.getElementById('sheet-title')
  var heard = document.getElementById('sheet-heard')

  var desc = document.getElementById('f-descripcion')
  var monto = document.getElementById('f-monto')
  var fMoneda = document.getElementById('f-moneda')
  var moneySign = document.getElementById('money-sign')
  var monedaToggle = document.getElementById('moneda-toggle')
  var fCategoria = document.getElementById('f-categoria')
  var catChips = document.getElementById('cat-chips')
  var fFecha = document.getElementById('f-fecha')
  var fechaInput = document.getElementById('f-fecha-input')
  var datePills = document.getElementById('date-pills')

  var fab = document.getElementById('fab')
  var micBtn = document.getElementById('mic-btn')
  var micLabel = document.getElementById('mic-label')
  var bubble = document.getElementById('bubble')
  var chubi = document.getElementById('chubi')

  // ============ Helpers ============
  function ymdLocal(d) {
    // YYYY-MM-DD en horario local (sin desfase por UTC).
    var off = d.getTimezoneOffset() * 60000
    return new Date(d.getTime() - off).toISOString().slice(0, 10)
  }
  function hoyStr() { return ymdLocal(new Date()) }
  function ayerStr() { return ymdLocal(new Date(Date.now() - 86400000)) }

  function setChubi(state) { if (chubi) chubi.className = 'chubi chubi-' + state }

  function setBubble(text, listening) {
    if (!bubble) return
    bubble.textContent = text
    bubble.classList.remove('bubble-hint', 'bubble-listening')
    bubble.classList.add(listening ? 'bubble-listening' : 'bubble-hint')
  }

  // ============ Sheet (hoja inferior) ============
  function openSheet() { document.body.classList.add('sheet-open') }
  function closeSheet() { document.body.classList.remove('sheet-open') }

  function selectChip(catId) {
    if (!catChips) return
    var btns = catChips.querySelectorAll('.chip')
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('is-on', btns[i].getAttribute('data-cat') === catId)
    }
    if (fCategoria) fCategoria.value = catId
  }

  function selectMoneda(m) {
    m = m === 'USD' ? 'USD' : 'ARS'
    if (fMoneda) fMoneda.value = m
    if (moneySign) moneySign.textContent = m === 'USD' ? 'US$' : '$'
    if (monedaToggle) {
      var opts = monedaToggle.querySelectorAll('.moneda-opt')
      for (var i = 0; i < opts.length; i++) {
        opts[i].classList.toggle('is-on', opts[i].getAttribute('data-moneda') === m)
      }
    }
  }

  function selectDatePill(kind) {
    if (datePills) {
      var pills = datePills.querySelectorAll('.date-pill')
      for (var i = 0; i < pills.length; i++) {
        pills[i].classList.toggle('is-on', pills[i].getAttribute('data-date') === kind)
      }
    }
    if (fechaInput) fechaInput.style.display = kind === 'otro' ? 'inline-block' : 'none'
    if (!fFecha) return
    if (kind === 'hoy') fFecha.value = hoyStr()
    else if (kind === 'ayer') fFecha.value = ayerStr()
    else fFecha.value = fechaInput && fechaInput.value ? fechaInput.value : ''
  }

  function setFecha(f) {
    if (!f || f === hoyStr()) { selectDatePill('hoy'); return }
    if (f === ayerStr()) { selectDatePill('ayer'); return }
    selectDatePill('otro')
    if (fechaInput) fechaInput.value = f
    if (fFecha) fFecha.value = f
  }

  function resetForm() {
    if (desc) desc.value = ''
    if (monto) monto.value = ''
    selectMoneda('ARS')
    selectChip('otros')
    selectDatePill('hoy')
  }

  function fillForm(g) {
    if (!g) return
    if (desc && g.descripcion) desc.value = g.descripcion
    if (monto && g.monto != null) monto.value = g.monto
    selectMoneda(g.moneda)
    selectChip(g.categoria || 'otros')
    setFecha(g.fecha)
  }

  // Abrir en modo "nuevo"
  function openNew() {
    if (!sheet) return
    resetForm()
    if (form) form.action = '/nuevo'
    if (sheetTitle) sheetTitle.textContent = 'Nuevo gasto'
    if (heard) heard.textContent = ''
    if (deleteForm) deleteForm.style.display = 'none'
    openSheet()
  }

  // Abrir en modo "editar" (desde una fila de la lista)
  function openEdit(row) {
    if (!sheet) return
    var id = row.getAttribute('data-id')
    resetForm()
    if (desc) desc.value = row.getAttribute('data-descripcion') || ''
    if (monto) monto.value = row.getAttribute('data-monto') || ''
    selectMoneda(row.getAttribute('data-moneda'))
    selectChip(row.getAttribute('data-categoria') || 'otros')
    setFecha(row.getAttribute('data-fecha'))
    if (form) form.action = '/gastos/' + id + '/editar'
    if (sheetTitle) sheetTitle.textContent = 'Editar gasto'
    if (heard) heard.textContent = ''
    if (deleteForm) {
      deleteForm.action = '/gastos/' + id + '/eliminar'
      deleteForm.style.display = 'block'
    }
    openSheet()
  }

  // ============ Cableado de la hoja ============
  if (sheet) {
    resetForm()

    if (fab) fab.addEventListener('click', openNew)

    if (catChips) catChips.addEventListener('click', function (e) {
      var b = e.target.closest('.chip')
      if (b) selectChip(b.getAttribute('data-cat'))
    })
    if (monedaToggle) monedaToggle.addEventListener('click', function (e) {
      var b = e.target.closest('.moneda-opt')
      if (b) selectMoneda(b.getAttribute('data-moneda'))
    })
    if (datePills) datePills.addEventListener('click', function (e) {
      var b = e.target.closest('.date-pill')
      if (!b) return
      var kind = b.getAttribute('data-date')
      selectDatePill(kind)
      if (kind === 'otro' && fechaInput) fechaInput.focus()
    })
    if (fechaInput) fechaInput.addEventListener('change', function () {
      if (fFecha) fFecha.value = fechaInput.value
    })

    // Cerrar (scrim, botón cancelar)
    var closers = document.querySelectorAll('[data-close-sheet]')
    for (var i = 0; i < closers.length; i++) closers[i].addEventListener('click', closeSheet)
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet() })

    // Filas de la lista -> editar
    var rows = document.querySelectorAll('.exp-row-btn')
    for (var j = 0; j < rows.length; j++) {
      rows[j].addEventListener('click', function () { openEdit(this) })
    }
  }

  // ============ Micrófono (voz) ============
  var recognition = null
  var listening = false
  var finalText = ''

  function getRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return null
    if (recognition) return recognition
    recognition = new SR()
    recognition.lang = 'es-AR'
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1

    recognition.onresult = function (e) {
      var interim = '', fin = ''
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var t = e.results[i][0].transcript
        if (e.results[i].isFinal) fin += t; else interim += t
      }
      if (fin) { finalText = fin.trim(); setBubble(finalText, true) }
      else if (interim) setBubble(interim, true)
    }
    recognition.onerror = function (e) {
      listening = false
      if (micBtn) micBtn.classList.remove('mic-listening')
      setChubi('idle')
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        if (micLabel) micLabel.textContent = 'Permití el micrófono para usar la voz'
      } else {
        if (micLabel) micLabel.textContent = 'No te escuché, probá de nuevo'
      }
    }
    recognition.onend = function () {
      listening = false
      if (micBtn) micBtn.classList.remove('mic-listening')
      if (finalText) procesar(finalText)
      else { setChubi('idle'); if (micLabel) micLabel.textContent = MIC_IDLE }
    }
    return recognition
  }

  function startListening() {
    var r = getRecognition()
    if (!r) {
      // El navegador no soporta voz -> cargar a mano
      if (micLabel) micLabel.textContent = 'Tu navegador no soporta voz, cargá a mano 👇'
      openNew()
      return
    }
    finalText = ''
    listening = true
    setChubi('listening')
    if (micBtn) micBtn.classList.add('mic-listening')
    if (micLabel) micLabel.textContent = 'Te escucho… tocá para terminar'
    setBubble('Escuchando…', true)
    try { r.start() } catch (_) { /* ya estaba activo */ }
  }

  async function procesar(texto) {
    setChubi('thinking')
    if (micLabel) micLabel.textContent = 'Pensando…'
    setBubble(texto, true)
    try {
      var res = await fetch('/api/interpretar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: texto }),
      })
      if (!res.ok) throw new Error('status ' + res.status)
      var data = await res.json()
      setChubi('happy')
      setTimeout(function () { setChubi('idle') }, 1600)
      if (micLabel) micLabel.textContent = MIC_IDLE
      openNew()
      fillForm(data.gasto)
      if (sheetTitle) sheetTitle.textContent = '¿Lo anoté bien?'
      if (heard) heard.textContent = '«' + texto + '»'
    } catch (err) {
      // Fallback: abrir la hoja con lo dicho en la descripción para cargar a mano.
      setChubi('idle')
      if (micLabel) micLabel.textContent = MIC_IDLE
      openNew()
      if (desc) desc.value = texto
      if (sheetTitle) sheetTitle.textContent = 'Revisá el gasto'
      if (heard) heard.textContent = '«' + texto + '» — completá lo que falte'
    }
  }

  if (micBtn) {
    micBtn.addEventListener('click', function () {
      if (listening && recognition) { try { recognition.stop() } catch (_) {} return }
      startListening()
    })
  }
})()
