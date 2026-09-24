/* Cotizador en 3 pasos con resumen en vivo */
(function(){
  const C = window.CONFIG, EA = window.EA;
  const form = document.getElementById("form-cotizar");
  const etapas = [...form.querySelectorAll(".etapa")];
  const progreso = [...document.querySelectorAll(".progreso li")];
  const btnSig = document.getElementById("btn-siguiente");
  const btnVolver = document.getElementById("btn-volver");
  const estado = document.getElementById("c-estado");
  let actual = 0;

  const num = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
  const ent = (v, min, max) => Math.max(min, Math.min(max, parseInt(v, 10) || 0));
  const fmt = (n, d = 1) => n.toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });
  const clp = (n) => "$" + (Math.round(n / 100000) * 100000).toLocaleString("es-CL");
  const valor = (nombre) => (form.querySelector(`[name="${nombre}"]:checked`) || {}).value || "";
  const $ = (id) => document.getElementById(id);

  /* ---------- Ventanas ---------- */
  const TAMANOS = {
    pequena:  { t: "Pequeña", a: 60,  h: 60 },
    mediana:  { t: "Mediana", a: 100, h: 100 },
    grande:   { t: "Grande",  a: 150, h: 120 },
    ventanal: { t: "Ventanal", a: 200, h: 200 },
    otra:     { t: "Otra medida" }
  };
  const lista = $("ventanas-lista");
  const plantilla = $("tpl-ventana");

  function renumerar() {
    [...lista.children].forEach((fila, i) => {
      fila.querySelector(".v-titulo").textContent = `Ventana ${i + 1}`;
      const otra = fila.querySelector('[data-v="tamano"]').value === "otra";
      fila.querySelector(".v-medidas").hidden = !otra;
      fila.querySelectorAll(".v-medidas input").forEach((inp) => { inp.required = otra; });
    });
    $("sin-ventanas").hidden = lista.children.length > 0;
  }

  function agregarVentana(tamano = "mediana", cantidad = 1) {
    const fila = plantilla.content.firstElementChild.cloneNode(true);
    fila.querySelector('[data-v="tamano"]').value = tamano;
    fila.querySelector('[data-v="cantidad"]').value = cantidad;
    lista.appendChild(fila);
    renumerar();
    actualizar();
    return fila;
  }

  function ventanas() {
    return [...lista.children].map((fila) => {
      const t = fila.querySelector('[data-v="tamano"]').value;
      const cantidad = ent(fila.querySelector('[data-v="cantidad"]').value, 1, 20);
      const esOtra = t === "otra";
      return {
        tamano: TAMANOS[t].t,
        ancho_cm: esOtra ? ent(fila.querySelector('[data-v="ancho"]').value, 0, 600) : TAMANOS[t].a,
        alto_cm: esOtra ? ent(fila.querySelector('[data-v="alto"]').value, 0, 300) : TAMANOS[t].h,
        cantidad
      };
    });
  }

  $("agregar-ventana").addEventListener("click", () => agregarVentana().querySelector("select").focus());
  lista.addEventListener("click", (e) => {
    const b = e.target.closest("[data-quitar]");
    if (!b) return;
    b.closest(".ventana-fila").remove();
    renumerar();
    actualizar();
  });
  lista.addEventListener("change", (e) => { if (e.target.matches('[data-v="tamano"]')) renumerar(); });
  agregarVentana();

  /* ---------- Reglas según tipo ---------- */
  let instalacionesTocadas = false;
  form.querySelectorAll('[name="instalaciones"]').forEach((c) => c.addEventListener("change", () => { instalacionesTocadas = true; }));

  form.querySelectorAll('[name="tipo"]').forEach((r) => r.addEventListener("change", () => {
    const tipo = valor("tipo");
    $("campo-tipo-otro").hidden = tipo !== "Otro";
    $("c-tipo-otro").required = tipo === "Otro";
    if (!instalacionesTocadas) {
      const conAgua = tipo === "Baño" || tipo === "Cocina";
      form.querySelectorAll('[name="instalaciones"]').forEach((c) => {
        c.checked = conAgua && c.value !== "Gas";
      });
    }
  }));

  form.querySelectorAll('[name="electricidad"]').forEach((r) => r.addEventListener("change", () => {
    $("detalle-electrico").hidden = valor("electricidad") !== "Sí";
  }));

  /* ---------- Cálculos y resumen ---------- */
  function superficie() {
    const pisos = valor("nivel") === "Ambos pisos" ? 2 : 1;
    return num($("c-ancho").value) * num($("c-largo").value) * pisos;
  }

  function actualizar() {
    const ancho = num($("c-ancho").value), largo = num($("c-largo").value), alto = num($("c-altura").value);
    const sup = superficie();
    const nivel = valor("nivel");
    const tipo = valor("tipo");

    $("superficie").innerHTML = sup > 0
      ? `Superficie: <strong>${fmt(sup)} m²</strong>${nivel === "Ambos pisos" ? " (medidas de un piso × 2 pisos)" : ""}`
      : "Superficie: <strong>–</strong>";
    $("r-superficie").textContent = sup > 0 ? `${fmt(sup)} m²` : "– m²";
    $("r-tipo").textContent = tipo ? `${tipo === "Otro" ? ($("c-tipo-otro").value || "Otro") : tipo}, ${nivel.toLowerCase()}` : "Sin elegir";
    $("r-medidas").textContent = ancho && largo ? `${fmt(ancho, 2)} × ${fmt(largo, 2)} m, altura ${fmt(alto, 2)} m` : "–";

    const vs = ventanas();
    const cant = vs.reduce((s, v) => s + v.cantidad, 0);
    const m2v = vs.reduce((s, v) => s + (v.ancho_cm * v.alto_cm / 10000) * v.cantidad, 0);
    $("r-ventanas").textContent = cant ? `${cant} ${cant === 1 ? "ventana" : "ventanas"}, ${fmt(m2v)} m² de vidrio, ${valor("vidrio").toLowerCase()}` : "Sin ventanas";

    $("r-radier").textContent = valor("radier") || "–";

    const inst = [];
    if (valor("electricidad") === "Sí") { const en = ent($("c-enchufes").value, 0, 30), lu = ent($("c-luces").value, 0, 20);
      inst.push(`electricidad (${en} ${en === 1 ? "enchufe" : "enchufes"}, ${lu} ${lu === 1 ? "punto de luz" : "puntos de luz"})`); }
    form.querySelectorAll('[name="instalaciones"]:checked').forEach((c) => inst.push(c.value.toLowerCase()));
    $("r-instalaciones").textContent = inst.length ? inst.join(", ").replace(/^./, (m) => m.toUpperCase()) : "Ninguna";

    $("r-terminacion").textContent = valor("terminaciones") === "Obra gruesa" ? "Solo obra gruesa" : "Lista para usar";

    // Rango referencial (solo si está configurado)
    const E = C.ESTIMADOR || {};
    const precios = E.activo && E.precio_m2_clp && E.precio_m2_clp[tipo];
    if (precios && precios[0] > 0 && sup > 0) {
      const f = valor("terminaciones") === "Obra gruesa" ? (E.factor_obra_gruesa || 1) : 1;
      $("r-rango").textContent = `${clp(sup * precios[0] * f)} a ${clp(sup * precios[1] * f)}`;
      $("r-estimado").hidden = false;
    } else {
      $("r-estimado").hidden = true;
    }
  }

  form.addEventListener("input", actualizar);
  form.addEventListener("change", actualizar);
  actualizar();

  /* ---------- Navegación entre pasos ---------- */
  function validarEtapa(i) {
    const campos = etapas[i].querySelectorAll("input, select, textarea");
    for (const c of campos) {
      if (c.closest("[hidden]")) continue;
      if (!c.checkValidity()) { c.reportValidity(); c.focus(); return false; }
    }
    if (i === 0 && superficie() <= 0) { $("c-ancho").focus(); return false; }
    return true;
  }

  function irA(i) {
    actual = i;
    etapas.forEach((e, k) => { e.hidden = k !== i; });
    progreso.forEach((li, k) => {
      li.classList.toggle("hecho", k < i);
      if (k === i) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    btnVolver.hidden = i === 0;
    btnSig.textContent = i === etapas.length - 1 ? "Enviar cotización" : "Siguiente";
    const top = form.getBoundingClientRect().top + window.scrollY - 100;
    if (window.scrollY > top) window.scrollTo({ top, behavior: "smooth" });
    etapas[i].querySelector("h2").focus({ preventScroll: true });
  }

  btnVolver.addEventListener("click", () => irA(actual - 1));

  /* ---------- Envío ---------- */
  function datos() {
    const fd = new FormData(form);
    const tipo = valor("tipo");
    return {
      formulario: "cotizacion",
      tipo: tipo === "Otro" ? `Otro: ${fd.get("tipo_otro") || ""}` : tipo,
      nivel: valor("nivel"),
      conexion: valor("conexion"),
      ancho: num(fd.get("ancho")),
      largo: num(fd.get("largo")),
      altura: num(fd.get("altura")),
      superficie: Math.round(superficie() * 100) / 100,
      estructura: valor("estructura"),
      terreno: valor("terreno"),
      ventanas: ventanas(),
      vidrio: valor("vidrio"),
      marco: valor("marco"),
      puertas_ext: ent(fd.get("puertas_ext"), 0, 5),
      puertas_int: ent(fd.get("puertas_int"), 0, 10),
      radier: valor("radier"),
      electricidad: valor("electricidad"),
      enchufes: valor("electricidad") === "Sí" ? ent(fd.get("enchufes"), 0, 30) : 0,
      luces: valor("electricidad") === "Sí" ? ent(fd.get("luces"), 0, 20) : 0,
      instalaciones: fd.getAll("instalaciones"),
      terminaciones: valor("terminaciones"),
      permiso: valor("permiso"),
      nombre: fd.get("nombre"),
      email: fd.get("email"),
      telefono: fd.get("telefono"),
      comuna: fd.get("comuna"),
      plazo: fd.get("plazo"),
      presupuesto: fd.get("presupuesto"),
      mensaje: fd.get("mensaje"),
      acepta: form.acepta.checked,
      sitio_web: fd.get("sitio_web")
    };
  }

  function confirmar(ref, d) {
    form.hidden = true;
    document.querySelector(".progreso").hidden = true;
    $("codigo-ref").textContent = ref;
    $("wa-fotos").href = EA.urlWa(`Hola, envié la cotización ${ref} (${d.tipo}, ${fmt(d.superficie)} m² en ${d.comuna}). Les mando fotos del lugar.`);
    const conf = $("confirmacion");
    conf.hidden = false;
    conf.focus();
    window.scrollTo({ top: conf.getBoundingClientRect().top + window.scrollY - 100, behavior: "smooth" });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    estado.hidden = true;
    if (!validarEtapa(actual)) return;
    if (actual < etapas.length - 1) { irA(actual + 1); return; }

    const d = datos();
    if (d.sitio_web) { confirmar("EA-RECIBIDA", d); return; }

    btnSig.disabled = true;
    btnSig.textContent = "Enviando cotización…";
    try {
      const r = await EA.enviar(d, "cotizacion");
      confirmar(r.ref || "Recibida", d);
      if (typeof window.gtag === "function") window.gtag("event", "generate_lead", { formulario: "cotizacion", tipo_obra: d.tipo, comuna: d.comuna, superficie: d.superficie });
    } catch (err) {
      console.error(err);
      estado.className = "estado error";
      estado.innerHTML = err.message === "captcha-pendiente"
        ? "Marca la casilla “No soy un robot” para enviar la cotización."
        : `No pudimos enviar la cotización. Revisa tu conexión e inténtalo de nuevo, o escríbenos por <a href="${EA.urlWa()}" target="_blank" rel="noopener">WhatsApp</a>.`;
      estado.hidden = false;
    } finally {
      btnSig.disabled = false;
      btnSig.textContent = "Enviar cotización";
    }
  });
})();
