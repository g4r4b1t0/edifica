# Edifica Araucanía — despliegue

## Estructura

```
edifica-araucania/
├── index.html                  Landing con formulario de visita técnica
├── cotizar/index.html          Cotizador en 3 pasos (URL /cotizar/)
├── assets/
│   ├── estilos.css             Estilos compartidos
│   ├── config.js               CONFIG compartida (endpoint, reCAPTCHA, WhatsApp, Google, estimador)
│   ├── comun.js                WhatsApp, reseñas, reCAPTCHA v3 y envío al backend
│   └── cotizar.js              Lógica del cotizador y resumen en vivo
├── robots.txt
├── sitemap.xml
├── amplify.yml                   Build spec de Amplify (sin build + custom headers del paso 8)
├── DEPLOY.md
└── backend/contacto/index.mjs    Lambda Node 20: reCAPTCHA v3 + SES v2 (visita y cotización)
```

## Arquitectura

```
Navegador ──> Amplify Hosting (index.html, CloudFront, HTTPS)
    │
    └─ POST JSON ──> API Gateway HTTP API (/contacto) ──> Lambda
                                                          ├─> Google siteverify (reCAPTCHA v3)
                                                          └─> Amazon SES v2 (aviso interno + autorespuesta)
```

Región sugerida: `sa-east-1` (SES disponible ahí). Alternativa: Amplify Gen 2 con `defineFunction` y Function URL, si prefieres todo en un solo stack.

## Pasos

1. **reCAPTCHA v3** (https://www.google.com/recaptcha/admin): crear sitio tipo v3 con dominios `edificaraucania.cl`, `www.edificaraucania.cl`, el dominio `*.amplifyapp.com` de preview y `localhost`. Guardar site key (pública) y secret.
2. **SES**
   - Verificar identidad de dominio `edificaraucania.cl` con Easy DKIM (3 CNAME).
   - Opcional: dominio MAIL FROM personalizado (`mail.edificaraucania.cl`) y registro DMARC `_dmarc` con `p=none` al inicio.
   - Solicitar salida del sandbox (production access). Mientras tanto, la autorespuesta al cliente solo funciona hacia correos verificados.
3. **Secreto**: guardar `RECAPTCHA_SECRET` en SSM Parameter Store (SecureString) o Secrets Manager y leerlo en el despliegue o en frío desde la Lambda.
4. **Lambda** `edifica-contacto`: Node.js 20.x, 256 MB, timeout 10 s. Variables:
   - `RECAPTCHA_SECRET`
   - `RECAPTCHA_MIN_SCORE=0.5`
   - `SES_FROM="Edifica Araucanía <no-responder@edificaraucania.cl>"`
   - `SES_TO=contacto@edificaraucania.cl` (y el correo del hermano)
   - `ALLOWED_ORIGINS=https://edificaraucania.cl,https://www.edificaraucania.cl,https://main.XXXX.amplifyapp.com`
   - `SEND_AUTOREPLY=true`
   - IAM mínimo: `ses:SendEmail` sobre la identidad del dominio + logs.
5. **API Gateway HTTP API**: ruta `POST /contacto` y `OPTIONS /contacto` → Lambda. Throttling: burst 5, rate 2 req/s.
6. **Amplify Hosting**: app sin build (artefacto = raíz), rama `main`. Conectar dominio `edificaraucania.cl` y `www` (redirigir www → apex).
7. **Configurar `assets/config.js`**: endpoint, site key, WhatsApp, teléfono visible, enlaces de Google y (opcional) el estimador.
   - Los dos formularios usan el mismo endpoint. El campo `formulario` (`visita` o `cotizacion`) define la validación, y la acción reCAPTCHA debe coincidir (`contacto` o `cotizacion`).
   - La Lambda responde `{ ok: true, ref: "EA-XXXXXX" }`; el código se muestra al cliente y va en el asunto de los correos.
8. **Headers** (Amplify → Custom headers): ya incluidos en `amplify.yml` (el `Content-Security-Policy` es compatible con reCAPTCHA y Google Fonts). Si se configuran además en la consola, deben coincidir:

```yaml
customHeaders:
  - pattern: '**/*'
    headers:
      - key: Strict-Transport-Security
        value: max-age=31536000; includeSubDomains
      - key: X-Content-Type-Options
        value: nosniff
      - key: Referrer-Policy
        value: strict-origin-when-cross-origin
      - key: Content-Security-Policy
        value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com; frame-src https://www.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://www.gstatic.com; connect-src 'self' https://*.execute-api.sa-east-1.amazonaws.com https://www.google.com"
```

9. **Google Business Profile**: crear/verificar la ficha con el mismo teléfono y URL.

## Datos a completar antes de publicar

- [ ] `assets/config.js` (endpoint, site key, WhatsApp, teléfono)
- [ ] Teléfono y correo en el JSON-LD del `<head>`
- [ ] Imagen `og.jpg` 1200×630 (foto real de una obra)
- [ ] Porcentajes de pago de la sección "Pagas por avance" (comentario REEMPLAZAR)
- [ ] Plazo real de garantía
- [ ] Comunas de cobertura reales (lista y `<select>` del formulario)
- [ ] Tiempo de respuesta comprometido ("dentro del día hábil")
- [ ] Validar con el equipo que pueden cumplir: visita sin costo, precio cerrado, gestión de permiso con arquitecto, boleta o factura
- [ ] Sección `#obras`: quitar `hidden` cuando haya 3 obras con fotos propias
- [ ] `GOOGLE_RESENAS_URL` y `GOOGLE_DEJAR_RESENA_URL` en `assets/config.js` (la sección de reseñas se oculta sola mientras no estén)
- [ ] Consentimiento escrito de cada trabajador para compartir su nombre y certificado con el cliente
- [ ] Credenciales con foto para el equipo
- [ ] Plantilla de presupuesto con anexo "Equipo asignado" (nombre, rol, certificado vigente y código de verificación)
- [ ] Plazo de respuesta del cotizador ("2 días hábiles", en `cotizar/index.html`)
- [ ] `ESTIMADOR` en `assets/config.js`: dejar `activo: false` hasta tener precios por m² reales de 3 a 5 obras; luego cargar rangos por tipo
- [ ] Política de privacidad (enlace en el pie) antes de activar Meta Ads o Google Ads

## Prompt sugerido para Claude Code

> En esta carpeta está la landing estática de Edifica Araucanía (`index.html`) y una Lambda en `backend/contacto/index.mjs`. Despliégala en AWS siguiendo `DEPLOY.md`: Amplify Hosting para el sitio estático con dominio edificaraucania.cl, API Gateway HTTP API + Lambda Node 20 para el formulario, SES v2 con dominio verificado por DKIM, y el secreto de reCAPTCHA en SSM. Usa infraestructura como código (CDK en TypeScript o Amplify Gen 2, lo que resulte más simple de mantener), región sa-east-1, IAM de mínimo privilegio y throttling en la API. Al terminar, actualiza `assets/config.js` con el endpoint real, aplica los custom headers de `DEPLOY.md` y prueba de punta a punta los dos formularios (visita en `/` y cotización en `/cotizar/`). No cambies el diseño ni los textos de la landing.
