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
  var personaSeg = document.getElementById('persona-seg')
  var fPersona = document.getElementById('f-persona')
  // Persona preseleccionada según el usuario logueado (la define el servidor).
  var personaDefault = (personaSeg && personaSeg.getAttribute('data-default')) || 'Daniel'
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

  // ============ Sonidos (WebAudio, sin archivos) ============
  // Tono característico por tipo: success agudo-alegre, warning doble medio,
  // error grave descendente. Se crea el contexto recién al primer uso (política
  // de autoplay) y si el navegador lo bloquea, simplemente no suena.
  var audioCtx = null
  function beep(type) {
    try {
      var AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      if (!audioCtx) audioCtx = new AC()
      if (audioCtx.state === 'suspended') audioCtx.resume()
      var notas = {
        success: [[660, 0, 0.10], [990, 0.10, 0.16]],
        warning: [[540, 0, 0.11], [540, 0.17, 0.13]],
        error: [[320, 0, 0.16], [200, 0.17, 0.24]],
      }[type] || []
      var t0 = audioCtx.currentTime
      for (var i = 0; i < notas.length; i++) {
        var n = notas[i]
        var osc = audioCtx.createOscillator()
        var gain = audioCtx.createGain()
        osc.type = type === 'error' ? 'triangle' : 'sine'
        osc.frequency.value = n[0]
        osc.connect(gain)
        gain.connect(audioCtx.destination)
        var st = t0 + n[1]
        var en = st + n[2]
        gain.gain.setValueAtTime(0.0001, st)
        gain.gain.exponentialRampToValueAtTime(0.22, st + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, en)
        osc.start(st)
        osc.stop(en + 0.03)
      }
    } catch (_) { /* sin audio, no pasa nada */ }
  }

  // ============ Toasts (arriba, ~2s) ============
  function toastHost() {
    var h = document.getElementById('toast-host')
    if (!h) {
      h = document.createElement('div')
      h.id = 'toast-host'
      document.body.appendChild(h)
    }
    return h
  }

  // type: 'success' | 'warning' | 'error'. action opcional: { label, onClick }.
  function toast(type, msg, action) {
    var host = toastHost()
    var el = document.createElement('div')
    el.className = 'toast toast-' + type
    var ico = document.createElement('span')
    ico.className = 'toast-ico'
    ico.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : '!'
    var txt = document.createElement('span')
    txt.className = 'toast-msg'
    txt.textContent = msg
    el.appendChild(ico)
    el.appendChild(txt)
    var dismissed = false
    function dismiss() {
      if (dismissed) return
      dismissed = true
      clearTimeout(timer)
      el.classList.remove('is-in')
      el.classList.add('is-out')
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el) }, 240)
    }
    if (action && action.label) {
      var btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'toast-act'
      btn.textContent = action.label
      btn.addEventListener('click', function () {
        if (action.onClick) action.onClick()
        dismiss()
      })
      el.appendChild(btn)
    }
    host.appendChild(el)
    beep(type)
    requestAnimationFrame(function () { el.classList.add('is-in') })
    // Los toasts duran ~2s; los que traen botón (Editar) un poco más para poder tocarlo.
    var timer = setTimeout(dismiss, action ? 4000 : 2000)
    return el
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

  function selectPersona(p) {
    var val = p === 'Daniel' || p === 'Daniela' ? p : ''
    if (fPersona) fPersona.value = val
    if (personaSeg) {
      var opts = personaSeg.querySelectorAll('.seg-opt')
      for (var i = 0; i < opts.length; i++) {
        opts[i].classList.toggle('is-on', opts[i].getAttribute('data-persona') === val)
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
    selectPersona(personaDefault)
    selectChip('otros')
    selectDatePill('hoy')
  }

  function fillForm(g) {
    if (!g) return
    if (desc && g.descripcion) desc.value = g.descripcion
    if (monto && g.monto) monto.value = g.monto
    selectMoneda(g.moneda)
    // Si Gemini no detectó a la persona, dejamos la preseleccionada por defecto.
    if (g.persona) selectPersona(g.persona)
    selectChip(g.categoria || 'otros')
    setFecha(g.fecha)
  }

  // Qué campos obligatorios faltan en la hoja (para warnings). Devuelve etiquetas.
  function camposFaltantes() {
    var f = []
    if (!desc || !desc.value.trim()) f.push('qué')
    if (!monto || !(Number(monto.value) > 0)) f.push('cuánto')
    if (!fPersona || !fPersona.value) f.push('quién')
    return f
  }

  function focoEn(label) {
    if (label === 'qué' && desc) desc.focus()
    else if (label === 'cuánto' && monto) monto.focus()
    else if (label === 'quién' && personaSeg) {
      var first = personaSeg.querySelector('.seg-opt')
      if (first) first.focus()
    }
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
    selectPersona(row.getAttribute('data-nombre'))
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
    if (personaSeg) personaSeg.addEventListener('click', function (e) {
      var b = e.target.closest('.seg-opt')
      if (b) selectPersona(b.getAttribute('data-persona'))
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

    // Validación al guardar: descripción, monto y persona son obligatorios.
    // Si falta algo, no enviamos y mostramos un warning (en vez del popup nativo).
    if (form) form.addEventListener('submit', function (e) {
      var faltan = camposFaltantes()
      if (faltan.length) {
        e.preventDefault()
        toast('warning', 'Te falta: ' + faltan.join(', '))
        focoEn(faltan[0])
      }
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
      if (micLabel) micLabel.textContent = MIC_IDLE
      // Abrimos "nuevo gasto" con lo que Gemini pudo parsear (fecha=hoy y
      // moneda=ARS ya vienen por defecto; persona cae en la del usuario).
      openNew()
      fillForm(data.gasto)
      if (heard) heard.textContent = '«' + texto + '»'
      var faltan = camposFaltantes()
      if (faltan.length) {
        // Mapeo incompleto: warning y a completar a mano lo que falta.
        setChubi('idle')
        if (sheetTitle) sheetTitle.textContent = 'Revisá el gasto'
        toast('warning', 'Me faltó: ' + faltan.join(', ') + '. Completalo 👇')
        focoEn(faltan[0])
      } else {
        setChubi('happy')
        setTimeout(function () { setChubi('idle') }, 1600)
        if (sheetTitle) sheetTitle.textContent = '¿Lo anoté bien?'
      }
    } catch (err) {
      // Error real (request falló / IA caída): toast de error y a cargar a mano.
      setChubi('idle')
      if (micLabel) micLabel.textContent = MIC_IDLE
      openNew()
      if (desc) desc.value = texto
      if (sheetTitle) sheetTitle.textContent = 'Revisá el gasto'
      if (heard) heard.textContent = '«' + texto + '»'
      toast('error', 'No pude interpretar lo que dijiste. Probá de nuevo o cargalo a mano.')
    }
  }

  if (micBtn) {
    micBtn.addEventListener('click', function () {
      if (listening && recognition) { try { recognition.stop() } catch (_) {} return }
      startListening()
    })
  }

  // ============ Toast de éxito tras guardar (viene de /inicio?ok=<id>) ============
  var flash = document.getElementById('flash-creado')
  if (flash) {
    var fid = flash.getAttribute('data-id')
    var fnombre = flash.getAttribute('data-nombre') || ''
    var fmonto = flash.getAttribute('data-monto') || ''
    toast('success', 'Cargado a nombre de ' + fnombre + ' · ' + fmonto, {
      label: 'Editar',
      onClick: function () {
        var row = document.querySelector('.exp-row-btn[data-id="' + fid + '"]')
        if (row) openEdit(row)
      },
    })
    // Limpiamos ?ok= de la URL para que un refresh no repita el toast.
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, '', '/inicio')
    }
  }
})()
