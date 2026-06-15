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
  var saveBtn = form ? form.querySelector('.btn-save') : null
  // Marca que el guardado vino de la voz (ya categorizado por la IA): así NO se
  // dispara la corrección manual "de fondo" al recargar.
  var revisadoParaGuardar = false

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
  var personaDefault = (personaSeg && personaSeg.getAttribute('data-default')) || ''
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
      // Lectores de pantalla: como el guardado por voz no abre ninguna hoja, el
      // toast es la única confirmación; lo anunciamos al vuelo.
      h.setAttribute('role', 'status')
      h.setAttribute('aria-live', 'polite')
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
    var btn = null
    function dismiss() {
      if (dismissed) return
      dismissed = true
      clearTimeout(timer)
      el.classList.remove('is-in')
      el.classList.add('is-out')
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el) }, 240)
    }
    if (action && action.label) {
      btn = document.createElement('button')
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
    // Vibración corta al confirmar (guardado por voz = manos/ojos ocupados).
    if (type === 'success' && navigator.vibrate) { try { navigator.vibrate(12) } catch (_) {} }
    requestAnimationFrame(function () { el.classList.add('is-in') })
    // Los normales duran ~2.5s; los que traen acción (Editar) 6s, para leer lo que
    // hizo la IA y tocar el botón con calma.
    var timer = setTimeout(dismiss, action ? 6000 : 2500)
    // Tocar el cuerpo del toast lo cierra antes (el botón de acción tiene el suyo).
    el.addEventListener('click', function (e) {
      if (e.target === btn) return
      dismiss()
    })
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
    // Validamos contra las opciones presentes (los data-persona son emails).
    var val = ''
    if (personaSeg) {
      var opts = personaSeg.querySelectorAll('.seg-opt')
      for (var i = 0; i < opts.length; i++) {
        var on = !!p && opts[i].getAttribute('data-persona') === p
        opts[i].classList.toggle('is-on', on)
        if (on) val = p
      }
    }
    if (fPersona) fPersona.value = val
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

  // Pulido local instantáneo (sin IA): recorta espacios y capitaliza la inicial.
  function polishLocal(s) {
    s = (s || '').trim().replace(/\s+/g, ' ')
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
  }

  // Actualiza una fila ya guardada con la corrección de la IA, SIN recargar. Lee el
  // emoji/etiqueta de la categoría de los chips que ya están en la hoja.
  function actualizarFila(id, descripcion, catId) {
    var row = document.querySelector('.exp-row[data-id="' + id + '"]')
    if (!row) return
    var chip = catChips ? catChips.querySelector('.chip[data-cat="' + catId + '"]') : null
    var emojiEl = chip ? chip.querySelector('.chip-emoji') : null
    var emoji = emojiEl ? emojiEl.textContent : ''
    var catLabel = chip ? chip.textContent.replace(emoji, '').trim() : catId
    var dEl = row.querySelector('.exp-desc')
    if (dEl) dEl.textContent = descripcion
    var eEl = row.querySelector('.exp-emoji')
    if (eEl) { eEl.textContent = emoji; eEl.className = 'exp-emoji cat-' + catId }
    var cEl = row.querySelector('.exp-cat')
    if (cEl) {
      var t = cEl.textContent
      var persona = t.indexOf(' · ') > -1 ? t.split(' · ')[0] : ''
      cEl.textContent = (persona ? persona + ' · ' : '') + catLabel
    }
    row.setAttribute('data-descripcion', descripcion)
    row.setAttribute('data-categoria', catId)
  }

  // POST de la corrección puntual (aplicar o deshacer). Devuelve true si quedó ok.
  function aplicarCorreccion(id, descripcion, categoria) {
    return fetch('/api/gastos/' + id + '/corregir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descripcion: descripcion, categoria: categoria }),
    }).then(function (r) { return r.ok }).catch(function () { return false })
  }

  // Corrección "de fondo": el gasto ya se guardó. Le pedimos a la IA que revise la
  // descripción/categoría y, si cambia algo, lo aplicamos sin recargar y avisamos con
  // opción de Deshacer. Nunca molesta: si la IA falla/tarda, queda lo guardado.
  var corrigiendo = false
  async function corregirEnFondo(id) {
    if (corrigiendo) return
    var row = document.querySelector('.exp-row[data-id="' + id + '"]')
    if (!row) return
    var origDesc = row.getAttribute('data-descripcion') || ''
    var origCat = row.getAttribute('data-categoria') || 'otros'
    if (origDesc.trim().length < 3) return
    corrigiendo = true
    var ctrl = new AbortController()
    var to = setTimeout(function () { try { ctrl.abort() } catch (_) {} }, 6000)
    try {
      var res = await fetch('/api/revisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descripcion: origDesc, categoria: origCat }),
        signal: ctrl.signal,
      })
      clearTimeout(to)
      if (!res.ok) return
      var data = await res.json()
      if (!data || !data.ok) return
      var nuevaDesc = (data.descripcion && data.descripcion.trim()) || origDesc
      var nuevaCat = data.categoria || origCat
      if (nuevaDesc === origDesc && nuevaCat === origCat) return // nada que corregir
      if (!(await aplicarCorreccion(id, nuevaDesc, nuevaCat))) return
      actualizarFila(id, nuevaDesc, nuevaCat)
      var msg = nuevaDesc !== origDesc
        ? '✨ Corregí: «' + origDesc + '» → «' + nuevaDesc + '»'
        : '✨ Ajusté la categoría'
      toast('success', msg, {
        label: 'Deshacer',
        onClick: function () {
          aplicarCorreccion(id, origDesc, origCat).then(function (ok) {
            if (ok) { actualizarFila(id, origDesc, origCat); toast('success', 'Lo dejé como estaba') }
          })
        },
      })
    } catch (_) {
      clearTimeout(to)
    } finally {
      corrigiendo = false
    }
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
    revisadoParaGuardar = false
    resetForm()
    if (form) form.action = '/nuevo'
    if (sheetTitle) sheetTitle.textContent = 'Nuevo gasto'
    if (saveBtn) saveBtn.textContent = 'Guardar gasto'
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
    if (saveBtn) saveBtn.textContent = 'Guardar edición'
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
        return
      }
      // Carga manual NUEVA con IA activa (no voz, no edición): dejamos una marca para
      // que, ya guardado y recargado, la IA revise typos/categoría "de fondo".
      var iaOn = form.getAttribute('data-ia') === 'true'
      if (!revisadoParaGuardar && iaOn && form.action.indexOf('/nuevo') !== -1) {
        // Timestamp para que la marca no quede colgada si este guardado falla.
        try { sessionStorage.setItem('ia-revisar-pending', String(Date.now())) } catch (_) {}
      }
      // No interceptamos: el gasto se guarda ya (y recarga).
    })

    // Pulido local instantáneo al salir del campo descripción (sin red).
    if (desc) desc.addEventListener('blur', function () { desc.value = polishLocal(desc.value) })

    // Cerrar (scrim, botón cancelar)
    var closers = document.querySelectorAll('[data-close-sheet]')
    for (var i = 0; i < closers.length; i++) closers[i].addEventListener('click', closeSheet)
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet() })

    // Lápiz de cada fila -> editar (la fila NO es clickeable, solo el lápiz)
    var editBtns = document.querySelectorAll('.exp-edit')
    for (var j = 0; j < editBtns.length; j++) {
      editBtns[j].addEventListener('click', function () {
        var row = this.closest('.exp-row')
        if (row) openEdit(row)
      })
    }
  }

  // ============ Micrófono (voz) ============
  var recognition = null
  var listening = false
  // Mientras guardamos un gasto de la IA (ventana de festejo + submit) bloqueamos
  // el micrófono: si no, un segundo toque arranca una escucha que la recarga corta.
  var guardando = false
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
    if (guardando) return
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
      // Cargamos el form (oculto) con lo que entendió la IA para ver si quedó
      // completo. resetForm pone los defaults: fecha=hoy, moneda=ARS, persona=la
      // del usuario logueado.
      resetForm()
      fillForm(data.gasto)
      var faltan = camposFaltantes()
      if (faltan.length) {
        // Mapeo incompleto: abrimos la hoja pre-cargada para completar a mano.
        openNew()
        fillForm(data.gasto)
        if (heard) heard.textContent = '«' + texto + '»'
        setChubi('idle')
        if (sheetTitle) sheetTitle.textContent = 'Revisá el gasto'
        toast('warning', 'Me faltó: ' + faltan.join(', ') + '. Completalo 👇')
        focoEn(faltan[0])
      } else {
        // Completo: lo guardamos directo, SIN abrir la hoja. El toast de éxito
        // (con «Editar») en /inicio?ok= deja revisar y corregir lo que hizo la IA.
        if (form) form.action = '/nuevo'
        guardando = true
        revisadoParaGuardar = true // la voz ya categorizó: no re-revisar al enviar
        setChubi('happy')
        setBubble('¡Anotado! 📝', false)
        // Dejamos lo escuchado (para el globo de Chubi) y si la IA NO detectó a la
        // persona (cayó en la del usuario por defecto) para avisarlo en el toast.
        // Con timestamp: solo lo mostramos si es reciente, así nunca aparece pegado
        // a un guardado posterior si este submit no llegara a /inicio?ok=.
        try {
          sessionStorage.setItem('ia-save', JSON.stringify({
            t: Date.now(),
            heard: texto,
            personaIncierta: !(data.gasto && data.gasto.persona),
          }))
        } catch (_) {}
        // Pequeño respiro para que se vea el festejo y recién ahí guardamos.
        setTimeout(function () {
          if (form) { form.requestSubmit ? form.requestSubmit() : form.submit() }
        }, 650)
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
      if (guardando) return
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
    var fdesc = flash.getAttribute('data-desc') || ''
    var femoji = flash.getAttribute('data-emoji') || ''
    var ffecha = flash.getAttribute('data-fecha-label') || '' // vacío si es hoy

    // Contexto de la voz (si el gasto vino del micrófono): qué escuchó y si tuvo
    // que adivinar a la persona. Solo lo usamos si es reciente (este mismo guardado).
    var save = null
    try {
      var raw = sessionStorage.getItem('ia-save')
      sessionStorage.removeItem('ia-save')
      if (raw) {
        var parsed = JSON.parse(raw)
        if (parsed && (Date.now() - parsed.t) < 15000) save = parsed
      }
    } catch (_) {}

    // Mensaje rico: deja VERIFICAR de un vistazo lo que entendió la IA
    // (qué · cuánto · a nombre de quién [· fecha si no es hoy]), sin abrir el gasto.
    var msg = (femoji ? femoji + ' ' : '') + (fdesc ? fdesc + ' · ' : '') + fmonto + ' · ' + fnombre
    if (ffecha) msg += ' · ' + ffecha
    // Si la IA NO entendió a nombre de quién, lo cargó a nombre del usuario por
    // defecto: lo marcamos como aviso (no éxito liso) para que se revise.
    var tipo = 'success'
    if (save && save.personaIncierta) {
      tipo = 'warning'
      msg += ' — ¿a nombre tuyo está bien?'
    }
    toast(tipo, msg, {
      label: 'Editar',
      onClick: function () {
        // La edición vive en Resumen ahora.
        window.location.href = '/resumen?edit=' + encodeURIComponent(fid)
      },
    })
    // Mostramos lo que escuchó en el globo de Chubi: junto al toast del resultado,
    // da el contexto completo para controlar a la IA.
    if (save && save.heard) setBubble('Escuché: «' + save.heard + '»', false)
    // Carga manual nueva: revisamos typos/categoría "de fondo" sobre el gasto ya
    // guardado y, si hay cambios, avisamos con Deshacer (sin recargar).
    var pend = false
    try {
      var pt = sessionStorage.getItem('ia-revisar-pending')
      sessionStorage.removeItem('ia-revisar-pending')
      pend = !!pt && (Date.now() - Number(pt)) < 15000
    } catch (_) {}
    // Solo carga manual reciente: si el guardado vino de la voz (ia-save presente),
    // no corregimos de fondo (la voz ya categorizó).
    if (pend && fid && !save) corregirEnFondo(fid)
    // Limpiamos ?ok= de la URL para que un refresh no repita el toast.
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, '', '/inicio')
    }
  }

  // Si llegamos a /resumen?edit=<id> (desde el toast de carga), abrimos esa edición.
  if (sheet) {
    var editId = new URLSearchParams(window.location.search).get('edit')
    if (editId) {
      var editRow = document.querySelector('.exp-row[data-id="' + editId + '"]')
      if (editRow) openEdit(editRow)
      if (window.history && window.history.replaceState) window.history.replaceState({}, '', '/resumen')
    }
  }

  // ============ Resumen: alternar Gastos / Gráficos ============
  var vistaSeg = document.getElementById('vista-seg')
  if (vistaSeg) {
    vistaSeg.addEventListener('click', function (e) {
      var b = e.target.closest('.seg-opt')
      if (!b) return
      var v = b.getAttribute('data-vista')
      var opts = vistaSeg.querySelectorAll('.seg-opt')
      for (var i = 0; i < opts.length; i++) opts[i].classList.toggle('is-on', opts[i] === b)
      var vg = document.getElementById('vista-gastos')
      var vgr = document.getElementById('vista-graficos')
      if (vg) vg.classList.toggle('is-on', v === 'gastos')
      if (vgr) vgr.classList.toggle('is-on', v === 'graficos')
      // Mantener la vista en la URL y en las flechas de mes (para no perderla al cambiar de mes).
      try {
        var url = new URL(window.location.href)
        url.searchParams.set('vista', v)
        window.history.replaceState({}, '', url)
      } catch (_) {}
    })
  }

  // ============ Resumen: selector de mes (solo meses con datos) ============
  var mesSelect = document.getElementById('mes-select')
  if (mesSelect) {
    mesSelect.addEventListener('change', function () {
      var vista = 'gastos'
      try { vista = new URL(window.location.href).searchParams.get('vista') || 'gastos' } catch (_) {}
      window.location.href = '/resumen?mes=' + encodeURIComponent(mesSelect.value) + '&vista=' + vista
    })
  }
})()
