/* =========================================================
   CONFIGURACIÓN COMPARTIDA — completar antes de desplegar
   ========================================================= */
window.CONFIG = {
  // Endpoint del backend (API Gateway + Lambda). Ver DEPLOY.md
  API_ENDPOINT: "https://REEMPLAZAR.execute-api.sa-east-1.amazonaws.com/contacto",
  // Clave de sitio reCAPTCHA v3 (pública)
  RECAPTCHA_SITE_KEY: "REEMPLAZAR_SITE_KEY",
  // WhatsApp en formato internacional sin + ni espacios
  WHATSAPP_NUMERO: "56900000000",
  TELEFONO_VISIBLE: "+56 9 0000 0000",
  WHATSAPP_MENSAJE: "Hola, quiero cotizar una ampliación para mi casa.",
  // Google Business Profile
  GOOGLE_RESENAS_URL: "REEMPLAZAR_URL_FICHA_GOOGLE",
  GOOGLE_DEJAR_RESENA_URL: "REEMPLAZAR_URL_PEDIR_RESENA",

  // Rango referencial en el cotizador. Desactivado hasta tener precios reales.
  // precio_m2_clp: [mínimo, máximo] en pesos por m², según tipo de ampliación.
  ESTIMADOR: {
    activo: false,
    precio_m2_clp: {
      "Dormitorio": [0, 0],
      "Baño": [0, 0],
      "Cocina": [0, 0],
      "Living o comedor": [0, 0],
      "Oficina": [0, 0],
      "Terraza techada": [0, 0],
      "Quincho": [0, 0],
      "Bodega o leñera": [0, 0]
    },
    // Factor sobre el precio cuando se pide solo obra gruesa (ej. 0.65)
    factor_obra_gruesa: 0.65
  }
};
