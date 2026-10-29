# opsdots.ro

Site de prezentare OpsDots (DBA · Kubernetes · Linux), RO + EN.
Rulează ca **Cloudflare Worker cu static assets** și are **observability** activat (loguri și trasare).

Domeniul principal este **https://www.opsdots.ro**. `opsdots.ro` face redirect 301 spre `www`, păstrând calea și parametrii.

## Structură

```
public/                 ← tot ce e servit public (site-ul)
  index.html            română
  en/index.html         engleză
  privacy.html, en/privacy.html
  404.html              pagina de eroare
  assets/               style.css, main.js, imagini
  robots.txt, sitemap.xml, llms.txt, site.webmanifest, favicon.svg
  _headers, _redirects  headere și redirecționări (aplicate de Cloudflare)
src/worker.js           Worker: servește public/, loghează fiecare cerere, redirect non-www → www, /healthz
src/contact.js          /api/contact: formularul de contact → email prin Resend (+ anti-spam)
wrangler.jsonc          configurația Cloudflare (assets, domenii, observability)
package.json            comenzi: npm run dev / deploy / logs
```

Local poți deschide direct `public/index.html` în browser, cu dublu-click.

---

## Deploy

### Prima dată (o singură configurare)

**0. Pregătește DNS-ul în Cloudflare** (zona `opsdots.ro` trebuie să fie în același cont):
- În *DNS → Records*, **șterge** înregistrările existente pentru `opsdots.ro` și `www` (A / AAAA / CNAME, de exemplu cele spre GitHub Pages).
  Worker-ul își creează singur înregistrările și certificatul SSL. Dacă le găsește deja, deploy-ul dă eroare.
- Dacă ai creat înainte un proiect **Pages** pentru site, șterge-l sau scoate-i domeniul custom, ca să nu se bată cap în cap.

**1. Conectează repo-ul la Cloudflare (Workers Builds):**
1. Cloudflare Dashboard → **Workers & Pages → Create → Workers → Import a repository**.
2. Alege GitHub → `opsdots-ro/opsdots.ro`, branch `main`.
3. Setări build:
   - **Project name:** `opsdots-ro` (trebuie să fie identic cu `name` din `wrangler.jsonc`)
   - **Build command:** gol
   - **Deploy command:** `npx wrangler deploy` (implicit)
   - **Root directory:** `/`
4. **Save and Deploy**.

Cloudflare citește `wrangler.jsonc`, publică `public/`, atașează `opsdots.ro` + `www.opsdots.ro` și activează observability.

### De acum înainte (la fiecare modificare)

```bash
git add -A
git commit -m "descrierea modificării"
git push
```

Fiecare push pe `main` declanșează automat un deploy, de obicei în sub un minut. Statusul se vede în
*Workers & Pages → opsdots-ro → Deployments*, iar commit-ul primește o bifă ✔ pe GitHub.
Pe un alt branch (ex. `test`) primești un **preview URL** separat, fără să afectezi site-ul live.

### Alternativ: deploy manual din Terminal

```bash
npm install          # o singură dată
npx wrangler login   # o singură dată, deschide browserul
npm run deploy
```

---

## Observability

Dashboard → **Workers & Pages → opsdots-ro → Observability**.

| Ce | Unde | Detalii |
|---|---|---|
| **Logs** | tab *Logs* / *Events* | Un eveniment JSON per cerere: `path`, `status`, `duration_ms`, `country`, `visitor_kind`, `bot_name`, `referer_host`… |
| **Traces** | tab *Traces* | 10% din cereri (`head_sampling_rate: 0.1` în `wrangler.jsonc`) |
| **Metrici** | tab *Metrics* | cereri, erori, CPU time, durată |
| **Live tail** | Terminal: `npm run logs` | loguri în timp real |

**Câmpul `visitor_kind`** clasifică fiecare vizitator: `human`, `search` (Googlebot, Bingbot…), `ai` (GPTBot, ClaudeBot,
PerplexityBot…), `preview` (LinkedIn, Slack, WhatsApp), `bot`, `unknown`. Așa vezi dacă ChatGPT și Claude chiar îți citesc site-ul.

Interogări utile în *Query Builder*:
- `visitor_kind = "ai"`, grupat după `bot_name` → ce crawlere AI au vizitat site-ul
- `level = "warn"`, grupat după `path` → linkuri moarte (404)
- `level = "error"` → erori 5xx (ar trebui să fie 0)
- `visitor_kind = "human"`, grupat după `country` sau `referer_host` → de unde vin vizitatorii

**Limite pe planul gratuit:** 200.000 de evenimente pe zi (loguri + span-uri de trace), retenție 3 zile; 100.000 de cereri Worker pe zi.
Pentru mai mult trafic scazi `head_sampling_rate` (ex. `0.2` = 20%).

**Uptime:** `https://www.opsdots.ro/healthz` răspunde cu `{"status":"ok"}`. Îl poți pune într-un monitor extern
(UptimeRobot, Better Stack, Grafana Synthetic) sau în *Cloudflare → Notifications → Health Checks*.

**Web Analytics (opțional, fără cookies):** *Analytics & Logs → Web Analytics → Add a site* → `www.opsdots.ro`, cu injectare automată.

---

## Formular de contact (Resend)

Formularul trimite datele la `/api/contact` (Worker). Worker-ul validează mesajul și îl trimite pe email prin **Resend**,
cu `Reply-To` setat pe adresa vizitatorului, deci îi răspunzi direct cu „Reply”.
Dacă serverul nu e disponibil (de exemplu local, cu dublu-click), formularul deschide aplicația de email ca rezervă.

### Configurare (o singură dată)

1. **resend.com → Domains → Add Domain** → `updates.opsdots.ro` (subdomeniu dedicat emailurilor trimise de site), regiunea **EU (Ireland)**.
   Adaugă în Cloudflare DNS înregistrările afișate (ex. MX și TXT pentru `send.updates`, TXT `resend._domainkey.updates`), cu proxy-ul **oprit** (nor gri).
   Apasă **Verify** și așteaptă statusul *Verified*, de obicei câteva minute.
   *Opțional, recomandat:* un TXT `_dmarc` cu `v=DMARC1; p=none;`, dacă nu ai deja unul.
2. **resend.com → API Keys → Create** → permisiune *Sending access*, domeniul `updates.opsdots.ro`. Copiază cheia `re_...`.
3. **Cloudflare → Workers & Pages → opsdots-ro → Settings → Variables and Secrets → Add**, tip **Secret**:
   - `RESEND_API_KEY` = cheia de la pasul 2
   - `CONTACT_TO` = adresa unde vrei mesajele (mai multe adrese se separă prin virgulă)
4. Expeditorul e setat în `wrangler.jsonc` → `CONTACT_FROM` = `website@updates.opsdots.ro`. Trebuie să fie pe domeniul verificat în Resend. Adresa nu trebuie să existe ca inbox, iar răspunsurile merg la vizitator prin Reply-To.
5. Redeploy: orice `git push` sau *Deployments → Retry*. Test: trimite un mesaj de pe site.

### Anti-spam (deja activ)

Câmp-capcană invizibil, timp minim de completare de 3 secunde, maximum 5 trimiteri pe minut per IP, verificarea originii și limită de mărime.
**Turnstile (opțional, dacă apare spam):** Cloudflare → Turnstile → Add widget → `www.opsdots.ro`, mod *Managed*.
- *Site Key* → în `wrangler.jsonc` la `TURNSTILE_SITE_KEY` (e publică)
- *Secret Key* → secret `TURNSTILE_SECRET` în Dashboard

Widget-ul apare automat în formular, iar verificarea devine obligatorie.

### Depanare

În *Observability → Logs* caută `event = "contact_sent"` (trimis OK, cu `resend_id`) sau `event = "contact_rejected"` (câmpul `reason`):
`not_configured` (lipsește un secret), `resend_error` (vezi `resend_error`, de obicei domeniu neverificat), `rate_limited`, `invalid_fields`, `turnstile_failed`.
Mesajele trimise apar și în resend.com → *Emails*.

Test local: copiază `.dev.vars.example` → `.dev.vars`, completează și rulează `npm run dev`.

## SEO și crawlere AI

- `robots.txt` permite Google, Bing și crawlerele AI; `llms.txt` oferă un rezumat pentru LLM-uri; datele structurate sunt în fiecare pagină.
- ⚠️ În Cloudflare: **Security → Bots** → dezactivează *Block AI bots* și *Managed robots.txt*. Altfel Cloudflare blochează GPTBot și ClaudeBot.
- Google Search Console + Bing Webmaster Tools: adaugă `https://www.opsdots.ro` și trimite `https://www.opsdots.ro/sitemap.xml`.

## Limbi

Română la `/`, engleză la `/en/`. Când schimbi un text, schimbă-l în **ambele** fișiere (`public/index.html` și `public/en/index.html`), inclusiv în blocul JSON-LD.

## De completat (TODO)

- Denumirea firmei, CUI, Nr. Reg. Com. în footer și în paginile de confidențialitate.
- Verifică cifrele (99.9%, 15 min P1, audit 10 zile) — sunt angajamente comerciale.
- Linkuri LinkedIn etc. în footer și în JSON-LD (`"sameAs"`).
- Actualizează `<lastmod>` în `public/sitemap.xml` la modificări de conținut.
