// Lambda: formularios de Edifica Araucanía (visita técnica y cotización)
// Runtime: Node.js 20.x (ESM). Valida reCAPTCHA v2 y envía correos vía Amazon SES v2.
//
// Variables de entorno:
//   RECAPTCHA_SECRET_PARAM  Nombre del parámetro SSM (SecureString) con la clave secreta reCAPTCHA v2
//   RECAPTCHA_SECRET      Alternativa directa (solo desarrollo)
//   TABLA_FORMULARIOS     Tabla DynamoDB donde se guarda cada envío
//   SES_FROM              Remitente verificado, ej: "Edifica Araucanía <no-responder@edificaraucania.cl>"
//   SES_TO                Destinatario(s) interno(s), separados por coma
//   ALLOWED_ORIGINS       Orígenes permitidos (CORS), separados por coma
//   SEND_AUTOREPLY        "true" para enviar confirmación al cliente

// El runtime Node 20 de Lambda ya incluye el SDK v3 (sesv2, dynamodb, ssm).
import { randomInt } from "node:crypto";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ses = new SESv2Client({});
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const ssm = new SSMClient({});
const {
  RECAPTCHA_SECRET,
  RECAPTCHA_SECRET_PARAM,
  TABLA_FORMULARIOS,
  SES_FROM,
  SES_TO = "",
  ALLOWED_ORIGINS = "https://edificaraucania.cl,https://www.edificaraucania.cl",
  SEND_AUTOREPLY = "true",
} = process.env;

const ORIGENES = ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
const DESTINOS = SES_TO.split(",").map((s) => s.trim()).filter(Boolean);

/* ---------- utilidades ---------- */
function cors(origin) {
  return {
    "Access-Control-Allow-Origin": ORIGENES.includes(origin) ? origin : ORIGENES[0],
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}
const respuesta = (status, body, origin) => ({ statusCode: status, headers: cors(origin), body: JSON.stringify(body) });
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const txt = (v, max) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
const n = (v, min, max) => { const x = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : NaN; };
const fmt = (x, d = 1) => Number(x).toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });
// Sin caracteres ambiguos (0/O, 1/I). 31^6 combinaciones; la tabla rechaza duplicados.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const referencia = () => "EA-" + Array.from({ length: 6 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");

let secretoCache;
async function secretoRecaptcha() {
  if (RECAPTCHA_SECRET) return RECAPTCHA_SECRET;
  secretoCache ??= ssm
    .send(new GetParameterCommand({ Name: RECAPTCHA_SECRET_PARAM, WithDecryption: true }))
    .then((r) => r.Parameter.Value)
    .catch((e) => { secretoCache = undefined; throw e; });
  return secretoCache;
}

async function guardar(item) {
  for (let i = 0; i < 3; i++) {
    const ref = i === 0 ? item.ref : referencia();
    try {
      await db.send(new PutCommand({
        TableName: TABLA_FORMULARIOS,
        Item: { ...item, ref },
        ConditionExpression: "attribute_not_exists(ref)",
      }));
      return ref;
    } catch (e) {
      if (e.name !== "ConditionalCheckFailedException") throw e;
    }
  }
  throw new Error("referencia-duplicada");
}

const marcarCorreo = (ref, estado, error) =>
  db.send(new UpdateCommand({
    TableName: TABLA_FORMULARIOS,
    Key: { ref },
    UpdateExpression: "SET correo = :e, correoError = :m",
    ExpressionAttributeValues: { ":e": estado, ":m": error ? String(error).slice(0, 300) : null },
  })).catch((e) => console.error("marcar-correo", e));

async function verificarRecaptcha(token, ip) {
  const params = new URLSearchParams({ secret: await secretoRecaptcha(), response: token });
  if (ip) params.append("remoteip", ip);
  const r = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const d = await r.json();
  return { ok: d.success === true }; // v2: sin score ni action
}

function tablaHtml(titulo, filas) {
  return `<h3 style="font-family:Arial,sans-serif;margin:18px 0 6px">${esc(titulo)}</h3>
<table style="font-family:Arial,sans-serif;border-collapse:collapse;font-size:14px">${filas
    .map(([k, v]) => `<tr><td style="padding:5px 12px;border-bottom:1px solid #ddd;color:#555;vertical-align:top">${esc(k)}</td><td style="padding:5px 12px;border-bottom:1px solid #ddd;white-space:pre-wrap"><b>${esc(v)}</b></td></tr>`)
    .join("")}</table>`;
}
const tablaTexto = (titulo, filas) => `${titulo.toUpperCase()}\n` + filas.map(([k, v]) => `  ${k}: ${v}`).join("\n");

async function correo({ para, responderA, asunto, texto, html }) {
  await ses.send(new SendEmailCommand({
    FromEmailAddress: SES_FROM,
    Destination: { ToAddresses: para },
    ReplyToAddresses: responderA,
    Content: { Simple: {
      Subject: { Data: asunto, Charset: "UTF-8" },
      Body: { Text: { Data: texto, Charset: "UTF-8" }, Html: { Data: html, Charset: "UTF-8" } },
    } },
  }));
}

/* ---------- validación ---------- */
function contacto(d) {
  const c = {
    nombre: txt(d.nombre, 80),
    telefono: txt(d.telefono, 20),
    email: txt(d.email, 120),
    comuna: txt(d.comuna, 60),
    plazo: txt(d.plazo, 40),
    mensaje: String(d.mensaje ?? "").trim().slice(0, 1500),
  };
  const ok = c.nombre && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email) && /^[+0-9 ()-]{8,20}$/.test(c.telefono) && c.comuna && d.acepta === true;
  return ok ? c : null;
}

function cotizacion(d) {
  const ancho = n(d.ancho, 0.5, 30), largo = n(d.largo, 0.5, 30), altura = n(d.altura, 1.8, 6);
  if (!txt(d.tipo, 90) || [ancho, largo, altura].some(Number.isNaN)) return null;
  const nivel = txt(d.nivel, 20);
  const ventanas = (Array.isArray(d.ventanas) ? d.ventanas : []).slice(0, 20).map((v) => ({
    tamano: txt(v.tamano, 20),
    ancho_cm: n(v.ancho_cm, 0, 600) || 0,
    alto_cm: n(v.alto_cm, 0, 300) || 0,
    cantidad: n(v.cantidad, 1, 20) || 1,
  }));
  const instalaciones = (Array.isArray(d.instalaciones) ? d.instalaciones : []).slice(0, 6).map((x) => txt(x, 20));
  return {
    tipo: txt(d.tipo, 90), nivel, conexion: txt(d.conexion, 30),
    ancho, largo, altura,
    superficie: Math.round(ancho * largo * (nivel === "Ambos pisos" ? 2 : 1) * 100) / 100,
    estructura: txt(d.estructura, 30), terreno: txt(d.terreno, 20),
    ventanas, vidrio: txt(d.vidrio, 30), marco: txt(d.marco, 30),
    puertas_ext: n(d.puertas_ext, 0, 5) || 0, puertas_int: n(d.puertas_int, 0, 10) || 0,
    radier: txt(d.radier, 30),
    electricidad: txt(d.electricidad, 5), enchufes: n(d.enchufes, 0, 30) || 0, luces: n(d.luces, 0, 20) || 0,
    instalaciones, terminaciones: txt(d.terminaciones, 20), permiso: txt(d.permiso, 30),
    presupuesto: txt(d.presupuesto, 40),
  };
}

/* ---------- handler ---------- */
export const handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || "";
  const metodo = event.requestContext?.http?.method || event.httpMethod;

  if (metodo === "OPTIONS") return { statusCode: 204, headers: cors(origin), body: "" };
  if (metodo !== "POST") return respuesta(405, { ok: false, error: "metodo" }, origin);
  if (origin && !ORIGENES.includes(origin)) return respuesta(403, { ok: false, error: "origen" }, origin);

  let d;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "{}";
    if (raw.length > 20000) return respuesta(413, { ok: false, error: "tamano" }, origin);
    d = JSON.parse(raw);
  } catch {
    return respuesta(400, { ok: false, error: "json" }, origin);
  }

  if (d.sitio_web) return respuesta(200, { ok: true, ref: referencia() }, origin); // trampa anti-bots

  const esCotizacion = d.formulario === "cotizacion";
  const accion = esCotizacion ? "cotizacion" : "contacto";

  const c = contacto(d);
  const obra = esCotizacion ? cotizacion(d) : { tipo_obra: txt(d.tipo_obra, 60), metros: txt(d.metros, 40) };
  if (!c || !obra || (!esCotizacion && !obra.tipo_obra)) return respuesta(422, { ok: false, error: "validacion" }, origin);
  if (!d.recaptchaToken) return respuesta(400, { ok: false, error: "captcha" }, origin);

  const ip = event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp;
  let captcha;
  try {
    captcha = await verificarRecaptcha(d.recaptchaToken, ip);
    if (!captcha.ok) return respuesta(403, { ok: false, error: "captcha" }, origin);
  } catch (e) {
    console.error("recaptcha", e);
    return respuesta(502, { ok: false, error: "captcha" }, origin);
  }

  // Se guarda antes de enviar correos: si SES falla, el contacto no se pierde.
  let ref;
  try {
    ref = await guardar({
      ref: referencia(),
      tipo: accion,
      creado: new Date().toISOString(),
      contacto: c,
      detalle: obra,
      correo: "pendiente",
      ip,
      userAgent: txt(event.headers?.["user-agent"] || event.headers?.["User-Agent"], 300),
      origen: origin,
    });
  } catch (e) {
    console.error("dynamodb", e);
    return respuesta(502, { ok: false, error: "guardado" }, origin);
  }

  const filasContacto = [
    ["Nombre", c.nombre], ["Teléfono", c.telefono], ["Correo", c.email],
    ["Comuna", c.comuna], ["Inicio", c.plazo || "-"],
  ];

  let asunto, secciones, resumenCliente;
  if (esCotizacion) {
    const vTotal = obra.ventanas.reduce((s, v) => s + v.cantidad, 0);
    const vM2 = obra.ventanas.reduce((s, v) => s + (v.ancho_cm * v.alto_cm / 10000) * v.cantidad, 0);
    const filasObra = [
      ["Tipo", obra.tipo], ["Piso", obra.nivel], ["Conexión", obra.conexion],
      ["Medidas", `${fmt(obra.ancho, 2)} × ${fmt(obra.largo, 2)} m, altura ${fmt(obra.altura, 2)} m`],
      ["Superficie", `${fmt(obra.superficie)} m²`],
      ["Material preferido", obra.estructura], ["Terreno", obra.terreno],
      ["Terminación", obra.terminaciones], ["Permiso municipal", obra.permiso],
      ["Presupuesto del cliente", obra.presupuesto || "-"],
    ];
    const filasVentanas = obra.ventanas.length
      ? obra.ventanas.map((v, i) => [`Ventana ${i + 1}`, `${v.cantidad} × ${v.tamano} (${v.ancho_cm} × ${v.alto_cm} cm)`])
          .concat([["Total", `${vTotal} ventanas, ${fmt(vM2)} m² de vidrio`], ["Vidrio", obra.vidrio], ["Marco", obra.marco]])
      : [["Ventanas", "Sin ventanas"]];
    filasVentanas.push(["Puertas", `${obra.puertas_ext} exteriores, ${obra.puertas_int} interiores`]);
    const filasInst = [
      ["Radier", obra.radier],
      ["Electricidad", obra.electricidad === "Sí" ? `Sí: ${obra.enchufes} enchufes, ${obra.luces} puntos de luz` : "No"],
      ["Agua y gas", obra.instalaciones.length ? obra.instalaciones.join(", ") : "No requiere"],
    ];
    asunto = `Cotización ${ref}: ${obra.tipo} ${fmt(obra.superficie)} m² en ${c.comuna} (${c.nombre})`;
    secciones = [["Cliente", filasContacto], ["Ampliación", filasObra], ["Ventanas y puertas", filasVentanas], ["Instalaciones", filasInst], ["Comentarios", [["Mensaje", c.mensaje || "(sin mensaje)"]]]];
    resumenCliente = [["Ampliación", `${obra.tipo}, ${obra.nivel.toLowerCase()}`], ["Superficie", `${fmt(obra.superficie)} m²`], ["Ventanas", vTotal ? `${vTotal}, vidrio ${obra.vidrio.toLowerCase()}` : "Sin ventanas"], ["Radier", obra.radier], ["Terminación", obra.terminaciones]];
  } else {
    asunto = `Visita ${ref}: ${obra.tipo_obra} en ${c.comuna} (${c.nombre})`;
    secciones = [["Cliente", filasContacto], ["Obra", [["Tipo", obra.tipo_obra], ["Tamaño", obra.metros || "-"], ["Mensaje", c.mensaje || "(sin mensaje)"]]]];
  }

  const htmlInterno = `<div style="font-family:Arial,sans-serif"><h2>${esc(esCotizacion ? "Nueva cotización" : "Nueva solicitud de visita técnica")} ${esc(ref)}</h2>
${secciones.map(([t, f]) => tablaHtml(t, f)).join("")}
<p style="margin-top:18px"><a href="https://wa.me/${esc(c.telefono.replace(/\D/g, ""))}">Responder por WhatsApp</a></p></div>`;
  const textoInterno = `${asunto}\n\n` + secciones.map(([t, f]) => tablaTexto(t, f)).join("\n\n");

  try {
    await correo({ para: DESTINOS, responderA: [c.email], asunto, texto: textoInterno, html: htmlInterno });

    if (SEND_AUTOREPLY === "true") {
      const nombre = c.nombre.split(" ")[0];
      const cuerpoTxt = esCotizacion
        ? `Recibimos tu cotización ${ref}. Revisaremos los datos y te enviaremos un rango de precio. El presupuesto cerrado se entrega después de la visita técnica sin costo.\n\n${tablaTexto("Resumen", resumenCliente)}\n\nSi quieres, responde este correo con fotos del lugar donde iría la ampliación.`
        : `Recibimos tu solicitud ${ref}. Te llamaremos para coordinar la visita técnica sin costo.\n\nSi quieres adelantar, responde este correo con fotos del lugar donde iría la ampliación.`;
      const cuerpoHtml = esCotizacion
        ? `<p>Recibimos tu cotización <b>${esc(ref)}</b>. Revisaremos los datos y te enviaremos un rango de precio. El presupuesto cerrado se entrega después de la visita técnica sin costo.</p>${tablaHtml("Resumen", resumenCliente)}<p>Si quieres, responde este correo con fotos del lugar donde iría la ampliación.</p>`
        : `<p>Recibimos tu solicitud <b>${esc(ref)}</b>. Te llamaremos para coordinar la visita técnica sin costo.</p><p>Si quieres adelantar, responde este correo con fotos del lugar donde iría la ampliación.</p>`;
      await correo({
        para: [c.email],
        responderA: DESTINOS.slice(0, 1),
        asunto: esCotizacion ? `Recibimos tu cotización ${ref}` : `Recibimos tu solicitud de visita ${ref}`,
        texto: `Hola ${nombre}:\n\n${cuerpoTxt}\n\nEdifica Araucanía\nhttps://edificaraucania.cl`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.5"><p>Hola ${esc(nombre)}:</p>${cuerpoHtml}<p>Edifica Araucanía<br><a href="https://edificaraucania.cl">edificaraucania.cl</a></p></div>`,
      });
    }
  } catch (e) {
    console.error("ses", e);
    // El envío ya está guardado: se responde ok y se deja el fallo registrado para reintentar a mano.
    await marcarCorreo(ref, "error", e.message);
    return respuesta(200, { ok: true, ref }, origin);
  }

  await marcarCorreo(ref, "enviado");
  return respuesta(200, { ok: true, ref }, origin);
};
