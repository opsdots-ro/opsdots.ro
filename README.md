# opsdots.ro

Site static de prezentare OpsDots — administrare baze de date, Kubernetes și Linux.
Fără build, fără dependențe: HTML + CSS + puțin JS, gata pentru **Cloudflare Pages**.

## Structură

```
index.html          pagina principală în română (SEO + JSON-LD: Organization, Services, FAQ)
en/index.html       versiunea în engleză (hreflang ro/en, JSON-LD în engleză)
privacy.html        politica de confidențialitate (RO) · en/privacy.html (EN)
assets/style.css    stiluri comune ambelor limbi
assets/main.js      meniu, animații, formular (detectează limba paginii)
404.html            pagina de eroare (Cloudflare Pages o folosește automat)
robots.txt          permite Google, Bing și crawlerele AI (GPTBot, ClaudeBot, PerplexityBot…)
sitemap.xml         harta site-ului
llms.txt            rezumat pentru ChatGPT / Claude / Perplexity (standard llmstxt.org)
_headers            headere de securitate și cache (Cloudflare Pages)
_redirects          redirecționări (Cloudflare Pages)
favicon.svg, site.webmanifest
assets/             og-image.png / og-image-en.png (1200×630), apple-touch-icon.png, icon-512.png
```

## Deploy pe Cloudflare Pages (din GitHub)

1. Urcă folderul într-un repo GitHub (ex. `opsdots.ro`).
2. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git** → alege repo-ul.
3. Build settings: **Framework preset: None**, **Build command:** gol, **Build output directory:** `/`.
4. După deploy: **Custom domains → Set up a domain** → `opsdots.ro` (și `www.opsdots.ro`, cu redirect spre domeniul principal).

## ⚠️ Important ca site-ul să fie găsit de ChatGPT / Claude

Cloudflare **blochează implicit crawlerele AI** pe domeniile noi. Verifică:

- **Security → Bots → „Block AI bots”** → setează pe **Do not block (allow)**.
- **AI Crawl Control** (fostul AI Audit) → asigură-te că GPTBot, OAI-SearchBot, ClaudeBot, Claude-SearchBot, PerplexityBot sunt **Allowed**.
- **Managed robots.txt** → dezactivat, altfel Cloudflare suprascrie `robots.txt` din repo cu reguli de blocare.
- Bot Fight Mode poate și el încurca unele crawlere — dacă vezi probleme, dezactivează-l.

## După lansare

- **Google Search Console**: adaugă domeniul (verificare prin DNS, direct din Cloudflare) și trimite `https://opsdots.ro/sitemap.xml`.
- **Bing Webmaster Tools**: importă din Search Console — Bing alimentează ChatGPT Search și Copilot.
- Validează datele structurate: https://search.google.com/test/rich-results și https://validator.schema.org
- Profil **LinkedIn** de companie + **Google Business Profile** cu link spre site — modelele AI se bazează mult pe mențiuni externe.

## De completat (TODO)

- Denumirea firmei, CUI și Nr. Reg. Com. în footer (`index.html`, `en/index.html`) și în `privacy.html`, `en/privacy.html`.
- Telefon / adresă exactă, dacă vrei să apară (și în JSON-LD).
- Verifică cifrele din bara de statistici (24/7, 99.9%, 15 min P1) și din secțiunea de audit (10 zile, preț fix) — sunt angajamente comerciale; ajustează-le la ce oferi realmente.
- Linkuri spre LinkedIn etc. în footer și în JSON-LD (`"sameAs": [...]`).
- La fiecare modificare de conținut, actualizează `<lastmod>` în `sitemap.xml`.

## Limbi

- Română la `/`, engleză la `/en/`. Selectorul RO/EN e în header.
- Când modifici un text, modifică-l în **ambele** fișiere (`index.html` și `en/index.html`), inclusiv în blocul JSON-LD.
- Paginile sunt legate prin `hreflang`, deci Google afișează automat versiunea potrivită limbii utilizatorului.

## Formular de contact

Formularul deschide clientul de email al vizitatorului (`mailto:`) — nu necesită backend.
Dacă vrei trimitere directă, se poate adăuga ulterior o Cloudflare Pages Function + Turnstile.
