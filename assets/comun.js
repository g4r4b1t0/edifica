/* Utilidades compartidas: WhatsApp, reseñas, reCAPTCHA v2 y envío al backend */
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

  // reCAPTCHA v2 (casilla con desafío): un widget por página, dentro de [data-recaptcha]
  let widgetId = null;
  const contenedor = document.querySelector("[data-recaptcha]");
  if (contenedor && configurado(C.RECAPTCHA_SITE_KEY)) {
    window.eaRecaptchaListo = () => {
      widgetId = grecaptcha.render(contenedor, { sitekey: C.RECAPTCHA_SITE_KEY });
    };
    const s = document.createElement("script");
    s.src = "https://www.google.com/recaptcha/api.js?onload=eaRecaptchaListo&render=explicit&hl=es";
    s.async = true;
    document.head.appendChild(s);
  }

  function tokenRecaptcha() {
    if (widgetId === null) throw new Error("recaptcha-no-cargo");
    const token = grecaptcha.getResponse(widgetId);
    if (!token) throw new Error("captcha-pendiente");
    return token;
  }

  async function enviar(datos) {
    datos.recaptchaToken = tokenRecaptcha();
    try {
      const r = await fetch(C.API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos)
      });
      const cuerpo = await r.json().catch(() => ({}));
      if (!r.ok || !cuerpo.ok) throw new Error(cuerpo.error || "error-servidor");
      return cuerpo;
    } finally {
      grecaptcha.reset(widgetId); // el token es de un solo uso
    }
  }

  window.EA = { configurado, urlWa, enviar };
})();
