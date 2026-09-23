/* Utilidades compartidas: WhatsApp, reseñas, reCAPTCHA v3 y envío al backend */
(function(){
  const C = window.CONFIG;
  const configurado = (v) => typeof v === "string" && v !== "" && !v.includes("REEMPLAZAR");
  const urlWa = (mensaje) => `https://wa.me/${C.WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje || C.WHATSAPP_MENSAJE)}`;

  const anio = document.getElementById("anio");
  if (anio) anio.textContent = new Date().getFullYear();

  document.querySelectorAll("[data-wa]").forEach((a) => { a.href = urlWa(); a.target = "_blank"; a.rel = "noopener"; });
  document.querySelectorAll("[data-telefono]").forEach((el) => { el.textContent = C.TELEFONO_VISIBLE; });

  // Reseñas de Google: la sección se muestra solo si los enlaces están configurados
  const secResenas = document.getElementById("resenas");
  if (secResenas) {
    if (configurado(C.GOOGLE_RESENAS_URL) && configurado(C.GOOGLE_DEJAR_RESENA_URL)) {
      const ver = secResenas.querySelector("[data-resenas-ver]");
      const dejar = secResenas.querySelector("[data-resenas-dejar]");
      ver.href = C.GOOGLE_RESENAS_URL; dejar.href = C.GOOGLE_DEJAR_RESENA_URL;
      [ver, dejar].forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
    } else {
      secResenas.hidden = true;
    }
  }

  // reCAPTCHA v3
  if (configurado(C.RECAPTCHA_SITE_KEY)) {
    const s = document.createElement("script");
    s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(C.RECAPTCHA_SITE_KEY)}`;
    s.async = true;
    document.head.appendChild(s);
  }

  function tokenRecaptcha(accion) {
    return new Promise((resolve, reject) => {
      if (!configurado(C.RECAPTCHA_SITE_KEY)) return reject(new Error("recaptcha-no-configurado"));
      let intentos = 0;
      (function esperar(){
        if (window.grecaptcha && grecaptcha.ready) {
          grecaptcha.ready(() => grecaptcha.execute(C.RECAPTCHA_SITE_KEY, { action: accion }).then(resolve, reject));
        } else if (intentos++ < 50) {
          setTimeout(esperar, 100);
        } else {
          reject(new Error("recaptcha-no-cargo"));
        }
      })();
    });
  }

  async function enviar(datos, accion) {
    datos.recaptchaToken = await tokenRecaptcha(accion);
    const r = await fetch(C.API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos)
    });
    const cuerpo = await r.json().catch(() => ({}));
    if (!r.ok || !cuerpo.ok) throw new Error(cuerpo.error || "error-servidor");
    return cuerpo;
  }

  window.EA = { configurado, urlWa, enviar };
})();
