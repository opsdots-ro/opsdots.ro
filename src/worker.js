/**
 * opsdots.ro — Cloudflare Worker
 *
 * Servește site-ul static din ./public (binding ASSETS) și adaugă observability:
 *  - un log JSON structurat pentru fiecare cerere (vizibil în Workers Logs)
 *  - clasificarea vizitatorilor: om / motor de căutare / crawler AI / alt bot
 *  - niveluri de log: info (2xx/3xx), warn (4xx), error (5xx / excepții)
 *  - header Server-Timing + x-request-id pentru depanare
 *  - endpoint /healthz pentru monitorizare uptime
 *  - redirect opsdots.ro → www.opsdots.ro (domeniul principal)
 */

const APEX_HOST = "opsdots.ro";
const CANONICAL_HOST = "www.opsdots.ro";

// Crawlere AI și motoare de căutare (potrivire pe User-Agent, case-insensitive)
const BOTS = [
  // AI
  { re: /GPTBot/i, name: "GPTBot", kind: "ai", vendor: "OpenAI" },
  { re: /OAI-SearchBot/i, name: "OAI-SearchBot", kind: "ai", vendor: "OpenAI" },
  { re: /ChatGPT-User/i, name: "ChatGPT-User", kind: "ai", vendor: "OpenAI" },
  { re: /ClaudeBot/i, name: "ClaudeBot", kind: "ai", vendor: "Anthropic" },
  { re: /Claude-User/i, name: "Claude-User", kind: "ai", vendor: "Anthropic" },
  { re: /Claude-SearchBot/i, name: "Claude-SearchBot", kind: "ai", vendor: "Anthropic" },
  { re: /anthropic-ai/i, name: "anthropic-ai", kind: "ai", vendor: "Anthropic" },
  { re: /PerplexityBot/i, name: "PerplexityBot", kind: "ai", vendor: "Perplexity" },
  { re: /Perplexity-User/i, name: "Perplexity-User", kind: "ai", vendor: "Perplexity" },
  { re: /Applebot-Extended/i, name: "Applebot-Extended", kind: "ai", vendor: "Apple" },
  { re: /meta-externalagent/i, name: "meta-externalagent", kind: "ai", vendor: "Meta" },
  { re: /CCBot/i, name: "CCBot", kind: "ai", vendor: "Common Crawl" },
  { re: /DuckAssistBot/i, name: "DuckAssistBot", kind: "ai", vendor: "DuckDuckGo" },
  { re: /Bytespider/i, name: "Bytespider", kind: "ai", vendor: "ByteDance" },
  // Motoare de căutare
  { re: /Googlebot/i, name: "Googlebot", kind: "search", vendor: "Google" },
  { re: /bingbot/i, name: "Bingbot", kind: "search", vendor: "Microsoft" },
  { re: /Applebot/i, name: "Applebot", kind: "search", vendor: "Apple" },
  { re: /DuckDuckBot/i, name: "DuckDuckBot", kind: "search", vendor: "DuckDuckGo" },
  { re: /YandexBot/i, name: "YandexBot", kind: "search", vendor: "Yandex" },
  // Previzualizări linkuri (LinkedIn, Slack etc.)
  { re: /LinkedInBot|Slackbot|facebookexternalhit|Twitterbot|WhatsApp|TelegramBot|Discordbot/i, name: "link-preview", kind: "preview", vendor: "social" },
];

const GENERIC_BOT = /bot|crawl|spider|slurp|curl|wget|python-requests|httpclient|headless/i;

function classify(ua) {
  if (!ua) return { kind: "unknown", name: null, vendor: null };
  for (const b of BOTS) if (b.re.test(ua)) return { kind: b.kind, name: b.name, vendor: b.vendor };
  if (GENERIC_BOT.test(ua)) return { kind: "bot", name: "other", vendor: null };
  return { kind: "human", name: null, vendor: null };
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
};

function withHeaders(res, extra) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!r.headers.has(k)) r.headers.set(k, v);
  for (const [k, v] of Object.entries(extra)) r.headers.set(k, v);
  return r;
}

export default {
  async fetch(request, env, ctx) {
    const started = Date.now();
    const url = new URL(request.url);
    const originalHost = url.hostname;
    const reqId = request.headers.get("cf-ray") || crypto.randomUUID();
    const ua = request.headers.get("user-agent") || "";
    const visitor = classify(ua);
    const cf = request.cf || {};

    let res;
    let error;

    try {
      if (url.hostname === APEX_HOST) {
        // opsdots.ro/orice?x=1 → https://www.opsdots.ro/orice?x=1 (păstrează calea și query-ul)
        url.hostname = CANONICAL_HOST;
        url.protocol = "https:";
        res = Response.redirect(url.toString(), 301);
      } else if (url.pathname === "/healthz") {
        res = new Response(JSON.stringify({ status: "ok", service: CANONICAL_HOST, time: new Date().toISOString() }), {
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        });
      } else {
        res = await env.ASSETS.fetch(request);
      }
    } catch (e) {
      error = e;
      res = new Response("Internal Server Error", { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
    }

    const ms = Date.now() - started;

    const entry = {
      event: "request",
      request_id: reqId,
      method: request.method,
      host: originalHost,
      path: url.pathname,
      query: url.search || undefined,
      status: res.status,
      redirect_to: res.headers.get("location") || undefined,
      duration_ms: ms,
      lang: url.pathname.startsWith("/en") ? "en" : "ro",
      visitor_kind: visitor.kind,            // human | search | ai | preview | bot | unknown
      bot_name: visitor.name || undefined,   // ex. GPTBot, ClaudeBot, Googlebot
      bot_vendor: visitor.vendor || undefined,
      verified_bot: cf.botManagement?.verifiedBot ?? undefined,
      country: cf.country,
      city: cf.city,
      colo: cf.colo,
      asn: cf.asn,
      as_org: cf.asOrganization,
      http_protocol: cf.httpProtocol,
      tls: cf.tlsVersion,
      referer_host: (() => { try { return new URL(request.headers.get("referer")).hostname; } catch { return undefined; } })(),
      user_agent: ua.slice(0, 300),
    };

    if (error) {
      console.error(JSON.stringify({ ...entry, level: "error", error: String(error?.stack || error) }));
    } else if (res.status >= 500) {
      console.error(JSON.stringify({ ...entry, level: "error" }));
    } else if (res.status >= 400) {
      console.warn(JSON.stringify({ ...entry, level: "warn" }));
    } else {
      console.log(JSON.stringify({ ...entry, level: "info" }));
    }

    // Redirect-urile nu se modifică (Response.redirect are headere imutabile)
    if (res.status >= 300 && res.status < 400 && !res.body) return res;

    return withHeaders(res, {
      "x-request-id": reqId,
      "Server-Timing": `worker;dur=${ms}`,
    });
  },
};
