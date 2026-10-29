/**
 * POST /api/contact — primește formularul de contact și trimite emailul prin Resend.
 * GET  /api/config  — configurație publică pentru formular (cheia publică Turnstile).
 *
 * Variabile (Cloudflare → Workers & Pages → opsdots-ro → Settings → Variables and Secrets):
 *   RESEND_API_KEY      (secret)  cheia API Resend, începe cu re_
 *   CONTACT_TO          (secret)  adresa/adresele unde ajung mesajele, separate prin virgulă
 *   TURNSTILE_SECRET    (secret, opțional) Secret Key Turnstile — dacă e setat, verificarea anti-bot devine obligatorie
 *   CONTACT_FROM        (var, în wrangler.jsonc) expeditorul, pe domeniul verificat în Resend
 *   TURNSTILE_SITE_KEY  (var, în wrangler.jsonc, opțional) Site Key Turnstile (public)
 *
 * Protecții anti-spam: câmp-capcană (honeypot), timp minim de completare, limită de cereri per IP,
 * verificare Origin, limită de mărime, Turnstile (opțional).
 */

const ALLOWED_HOSTS = new Set(["www.opsdots.ro", "opsdots.ro", "localhost", "127.0.0.1"]);

// Acceptă formularul doar de pe site-ul nostru (sau de pe același host: preview *.workers.dev, dev local)
function originAllowed(origin, requestUrl) {
  if (!origin) return true; // unele browsere nu trimit Origin la same-origin
  try {
    const o = new URL(origin).hostname;
    return ALLOWED_HOSTS.has(o) || o === new URL(requestUrl).hostname;
  } catch {
    return false;
  }
}

const MAX_BODY_BYTES = 20_000;
const MIN_FILL_MS = 3_000; // un om nu completează formularul în sub 3 secunde

const json = (status, obj) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

function log(level, event, data) {
  const line = JSON.stringify({ event, level, ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function handleConfig(env) {
  return json(200, { turnstileSiteKey: env.TURNSTILE_SITE_KEY || null });
}

export async function handleContact(request, env, ctx, reqId) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const country = request.cf?.country;
  const reject = (status, reason, extra = {}) => {
    log(status >= 500 ? "error" : "warn", "contact_rejected", { request_id: reqId, reason, country, ...extra });
    return json(status, { ok: false, error: reason });
  };

  if (request.method !== "POST") return reject(405, "method_not_allowed");

  // 1. Configurare
  if (!env.RESEND_API_KEY || !env.CONTACT_TO || !env.CONTACT_FROM) return reject(503, "not_configured");

  // 2. Origin (doar formularul de pe site-ul nostru)
  const origin = request.headers.get("origin");
  if (!originAllowed(origin, request.url)) return reject(403, "bad_origin", { origin });

  // 3. Limită de cereri per IP (binding opțional CONTACT_RATE_LIMITER)
  if (env.CONTACT_RATE_LIMITER) {
    const { success } = await env.CONTACT_RATE_LIMITER.limit({ key: ip });
    if (!success) return reject(429, "rate_limited");
  }

  // 4. Corpul cererii
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY_BYTES) return reject(413, "too_large");
  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return reject(413, "too_large");
    body = JSON.parse(raw);
  } catch {
    return reject(400, "bad_json");
  }

  // 5. Capcane anti-bot: honeypot + timp de completare
  if (body.website) return json(200, { ok: true }); // botul crede că a reușit, nu trimitem nimic
  const elapsed = Date.now() - Number(body.t || 0);
  if (!body.t || elapsed < MIN_FILL_MS || elapsed > 24 * 3600 * 1000) {
    log("warn", "contact_rejected", { request_id: reqId, reason: "timing", elapsed_ms: elapsed, country });
    return json(200, { ok: true });
  }

  // 6. Validare câmpuri
  const f = {
    name: clean(body.name, 120),
    company: clean(body.company, 160),
    email: clean(body.email, 200),
    interest: clean(body.interest, 100),
    message: clean(body.message, 5000),
    lang: body.lang === "en" ? "en" : "ro",
  };
  const invalid = [];
  if (f.name.length < 2) invalid.push("name");
  if (!EMAIL_RE.test(f.email)) invalid.push("email");
  if (f.message.length < 10) invalid.push("message");
  if (invalid.length) return reject(422, "invalid_fields", { fields: invalid });

  // 7. Turnstile (dacă e configurat)
  if (env.TURNSTILE_SECRET) {
    const token = clean(body.turnstile, 2048);
    if (!token) return reject(400, "turnstile_missing");
    const fd = new FormData();
    fd.append("secret", env.TURNSTILE_SECRET);
    fd.append("response", token);
    fd.append("remoteip", ip);
    const v = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: fd })
      .then((r) => r.json())
      .catch(() => ({ success: false, "error-codes": ["network"] }));
    if (!v.success) return reject(403, "turnstile_failed", { codes: v["error-codes"] });
  }

  // 8. Emailul
  const to = env.CONTACT_TO.split(",").map((s) => s.trim()).filter(Boolean);
  const subject = `[opsdots.ro] ${f.interest || "Mesaj nou"} — ${f.name}${f.company ? ` (${f.company})` : ""}`;
  const rows = [
    ["Nume", f.name],
    ["Companie", f.company || "—"],
    ["Email", f.email],
    ["Interes", f.interest || "—"],
    ["Limba paginii", f.lang.toUpperCase()],
    ["Țara (Cloudflare)", country || "—"],
  ];
  const text =
    rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\nMesaj:\n${f.message}\n\n— trimis de pe formularul www.opsdots.ro (ID ${reqId}). Răspunde direct la acest email.`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#16232B;line-height:1.55">
<div style="max-width:620px;margin:0 auto;border:1px solid #E3EAEE;border-radius:14px;overflow:hidden">
  <div style="background:#0B2532;color:#fff;padding:18px 22px;font-weight:700">Mesaj nou de pe <span style="color:#5FD0EE">opsdots.ro</span></div>
  <table style="width:100%;border-collapse:collapse;font-size:14px">${rows
    .map(([k, v]) => `<tr><td style="padding:9px 22px;color:#5B6B74;width:150px;border-bottom:1px solid #F0F3F5">${esc(k)}</td><td style="padding:9px 22px;border-bottom:1px solid #F0F3F5">${esc(v)}</td></tr>`)
    .join("")}</table>
  <div style="padding:18px 22px;white-space:pre-wrap;font-size:15px">${esc(f.message)}</div>
  <div style="padding:12px 22px;background:#F4F7F9;color:#5B6B74;font-size:12px">Apasă „Reply” pentru a-i răspunde direct lui ${esc(f.name)}. · ID ${esc(reqId)}</div>
</div></body></html>`;

  let resp, data;
  try {
    resp = await fetch(env.RESEND_API_URL || "https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.CONTACT_FROM, to, reply_to: f.email, subject, text, html }),
    });
    data = await resp.json().catch(() => ({}));
  } catch (e) {
    return reject(502, "resend_unreachable", { error: String(e) });
  }
  if (!resp.ok) return reject(502, "resend_error", { resend_status: resp.status, resend_error: data?.message || data?.name });

  log("info", "contact_sent", {
    request_id: reqId,
    resend_id: data?.id,
    interest: f.interest,
    lang: f.lang,
    email_domain: f.email.split("@")[1], // fără date personale complete în loguri
    country,
  });
  return json(200, { ok: true });
}
