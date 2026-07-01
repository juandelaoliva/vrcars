# VR Cars

Landing page for **VR Cars**, a small car dealership based in Spain that specialises in importing second-hand vehicles from Germany. The site showcases the current inventory — available cars with a direct WhatsApp contact button, and a sold section showing past vehicles — along with the dealer's process, value proposition, and legal pages.

**Live site:** https://vrcarsoficial.com

### What the site does

- Displays available cars as clickable cards that open a pre-filled WhatsApp conversation with the dealer
- Shows sold vehicles as a reference section
- Auto-updates stats (total imported, sold, available now) from the car data
- Fully responsive — mobile-first design
- No cookies required for core functionality; GDPR-compliant legal pages included

### How content is managed

There is no admin panel. The dealer manages the inventory from their phone via a private **Telegram bot**:

- `/addcar` — walks through a guided conversation (brand, model, engine, fuel, year, km, status, origin, photo, image crop position), generates a live preview, then publishes to the site with one tap
- `/editcar` — edit any field of any existing car
- `/deletecar` — remove a car from the catalog

Publishing a car takes about 5 minutes end-to-end: the bot commits the data to GitHub, a GitHub Action rebuilds the HTML, and GitHub Pages deploys the updated static site.

---

## Technical documentation

A fully static site managed through a Telegram bot — no admin panel, no database, no server to maintain. Content is stored in a JSON file on GitHub; the bot lets the dealer add, edit, or remove cars from Telegram; a GitHub Action rebuilds the HTML automatically; GitHub Pages serves the result.

---

## Table of Contents

- [Architecture overview](#architecture-overview)
- [How it all fits together](#how-it-all-fits-together)
- [Repository structure](#repository-structure)
- [The data layer: cars.json](#the-data-layer-carsjson)
- [The build layer: build.py](#the-build-layer-buildpy)
- [The hosting layer: GitHub Pages](#the-hosting-layer-github-pages)
- [The automation layer: GitHub Actions](#the-automation-layer-github-actions)
- [The bot layer: Cloudflare Worker](#the-bot-layer-cloudflare-worker)
- [Notifications: Telegram deploy alerts](#notifications-telegram-deploy-alerts)
- [Setup guide from scratch](#setup-guide-from-scratch)
- [UTF-8 encoding: critical gotcha](#utf-8-encoding-critical-gotcha)
- [Local development](#local-development)
- [Adapting this pattern to other websites](#adapting-this-pattern-to-other-websites)

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Telegram (dealer's phone)                                      │
│  /addcar · /editcar · /deletecar                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS webhook
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cloudflare Worker  (bot/worker.js)                             │
│  · Guides dealer through a multi-step conversation              │
│  · Stores in-progress state in Cloudflare KV (1-hour TTL)      │
│  · Stores uploaded photo in Cloudflare KV (base64)             │
│  · Generates HTML preview (injects card into live index.html)  │
│  · On publish: commits image + updated cars.json to GitHub     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ GitHub Contents API (PUT)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Repository  (juandelaoliva/vrcars)                      │
│  · cars.json  ← source of truth for all car data               │
│  · brand_assets/  ← car photos committed by the bot            │
│  · index.html  ← rebuilt automatically, never edited by hand   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ push triggers GitHub Action
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Actions  (.github/workflows/build.yml)                  │
│  · Runs build.py → rewrites catalog section of index.html      │
│  · Commits updated index.html with [skip ci]                    │
│  · On failure: sends Telegram alert                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │ GitHub Pages deployment
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Pages  → https://vrcarsoficial.com  (CNAME)            │
│  · Serves index.html as a fully static site (zero server cost) │
└──────────────────────────┬──────────────────────────────────────┘
                           │ deployment_status event
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Actions  (.github/workflows/notify-deploy.yml)          │
│  · Fires only when github-pages environment succeeds           │
│  · Sends "🌐 VR Cars publicado" Telegram message to dealer     │
└─────────────────────────────────────────────────────────────────┘
```

---

## How it all fits together

The core idea is **JSON as CMS**. The website has no database and no backend — all car data lives in `cars.json`. To add a car, the Telegram bot appends to that JSON and commits the photo to the repo. GitHub Actions detects the change and rebuilds the static HTML. GitHub Pages serves the result.

The full cycle from "dealer sends photo" to "car live on website" takes about 5 minutes, all hands-free after the initial publish.

### Why this approach

| Concern | Solution |
|---|---|
| Zero hosting cost | GitHub Pages (free for public repos) |
| Zero ops burden | No server, no database, no uptime to manage |
| Content updates | Telegram bot — works from any phone |
| Preview before publish | Worker generates an isolated HTML preview |
| Fast deploys | Static HTML served from CDN edge |
| Notifications | Telegram messages at build failure and Pages deploy |

---

## Repository structure

```
vrcars/
├── index.html                    # Main site — never edit the catalog section by hand
├── cars.json                     # Source of truth for all car listings
├── build.py                      # Rebuilds the catalog section of index.html
├── serve.mjs                     # Local dev server (node serve.mjs → localhost:3000)
├── CNAME                         # "vrcarsoficial.com" — tells Pages the custom domain
├── robots.txt
├── sitemap.xml
├── aviso-legal.html
├── privacidad.html
├── cookies.html
├── legal.css                     # Shared stylesheet for legal pages
├── brand_assets/                 # Car photos + logos (committed by bot or manually)
│   ├── logo-transparent.png
│   ├── bmw 1.jpeg
│   ├── mercedes.png
│   └── ...
├── bot/
│   └── worker.js                 # Cloudflare Worker — the entire bot in one file
└── .github/
    └── workflows/
        ├── build.yml             # Rebuilds index.html when cars.json changes
        └── notify-deploy.yml     # Sends Telegram message when Pages deploy finishes
```

---

## The data layer: cars.json

Every car is one object in the top-level array. Order matters: available cars come first, sold cars come after — the build script respects this order.

```json
{
  "id": "bmw-serie1-116i",
  "brand": "BMW",
  "model": "Serie 1 116i",
  "engine": "1.5 · 109 CV",
  "year": "2018",
  "km": "61.000 km",
  "status": "available",
  "origin": "germany",
  "image": "brand_assets/bmw-serie1-116i.jpg",
  "imagePosition": "55% 62%",
  "whatsapp": "Hola%20Victor..."
}
```

| Field | Description |
|---|---|
| `id` | URL-safe slug, used as image filename |
| `brand` / `model` | Displayed on the card |
| `engine` | Format: `displacement · power CV` using `·` (U+00B7) |
| `year` | 4-digit string |
| `km` | Pre-formatted: `"61.000 km"` |
| `status` | `"available"` or `"sold"` |
| `origin` | `"germany"` → "Importado de Alemania", anything else → "Vehículo Nacional" |
| `image` | Relative path from repo root |
| `imagePosition` | CSS `object-position` value — controls crop focal point |
| `whatsapp` | URL-encoded WhatsApp pre-filled message (available cars only) |

**Never edit `cars.json` manually if the bot is active** — concurrent edits risk a SHA conflict on the GitHub Contents API PUT. Use the bot instead.

---

## The build layer: build.py

`build.py` reads `cars.json` and surgically rewrites two regions of `index.html` using regex:

1. **Catalog grid** — replaces everything between `<div class="cars-grid">` and the closing `<!-- ===== WHY` comment with freshly generated card HTML.
2. **Grid CSS** — replaces the dynamic column rules (auto-calculated based on how many available/sold cars there are).
3. **Hero stats** — updates the three counters: total imported, sold, available.
4. **Proof bar stats** — same numbers repeated in a separate section.

The script never touches anything outside those four regions, so design changes to `index.html` survive rebuilds.

### Column logic

```python
def best_columns(count, max_cols=4):
    if count <= max_cols: return count
    if count % 3 == 0:   return 3
    if count % 4 == 0:   return 4
    return 4
```

The grid adjusts automatically: 3 available cars → 3 columns; 4 → 4 columns; 6 → 3 columns (even rows), etc. Responsive breakpoints override to 2 columns at ≤900 px and 1 column at ≤580 px.

### Running manually

```bash
python3 build.py
```

---

## The hosting layer: GitHub Pages

GitHub Pages serves the repo root as a static website. Configuration:

1. Repository → Settings → Pages → Source: **Deploy from a branch** → branch `main`, folder `/`.
2. `CNAME` file in the repo root contains the custom domain (`vrcarsoficial.com`).
3. DNS: add a `CNAME` record pointing `vrcarsoficial.com` → `juandelaoliva.github.io`.

GitHub Pages handles HTTPS automatically via Let's Encrypt.

---

## The automation layer: GitHub Actions

### build.yml — Rebuild on content change

**Trigger:** push to `main` when `cars.json` or `build.py` changes.

```yaml
on:
  push:
    branches: [main]
    paths:
      - cars.json
      - build.py
```

**Steps:**
1. Checkout the repo.
2. Run `python3 build.py` — rewrites `index.html`.
3. Commit `index.html` with message `chore: rebuild catalog from cars.json [skip ci]`. The `[skip ci]` suffix prevents the commit from re-triggering this workflow.
4. Push to `main`.
5. On failure: POST to Telegram Bot API to alert the dealer.

**Required secrets:** `TELEGRAM_TOKEN`

**Required permission:** `contents: write` (so the Action can push the rebuilt HTML).

### notify-deploy.yml — Alert when Pages is live

**Trigger:** `deployment_status` event (fires whenever GitHub deploys anything).

**Condition:** only runs when the environment is `github-pages` and the state is `success`.

```yaml
if: github.event.deployment_status.state == 'success' && github.event.deployment.environment == 'github-pages'
```

This event fires after Pages finishes CDN propagation — typically 2–4 minutes after the rebuild commit lands.

**Required secrets:** `TELEGRAM_TOKEN`

---

## The bot layer: Cloudflare Worker

The entire bot is a single JavaScript file (`bot/worker.js`) deployed as a Cloudflare Worker. It handles two types of incoming requests:

- `POST /` — Telegram webhook updates (messages + callback queries from inline keyboards)
- `GET /preview/<uuid>` — serves the HTML preview page
- `GET /photo/<uuid>` — serves the uploaded car photo (as JPEG)

### Conversation state machine

State is stored in Cloudflare KV under the key `state:<userId>` with a 1-hour TTL. Each state has a `step` and a `data` object that accumulates answers.

**Add car flow:**

```
idle/start → brand → model → engine → fuel → year → km
          → status → origin → photo → image_pos → confirm
          → publish_ready → [publish | adjust_pos | restart]
```

**Position adjustment (after preview):**

```
publish_ready → readjust_pos → publish_ready
             → readjust_custom → publish_ready
```

**Delete car:**

```
/deletecar → delete_select → delete_confirm → [yes: commit removal | no: cancel]
```

**Edit car:**

```
/editcar → edit_select → edit_field → edit_value → edit_confirm → [yes: commit | no: cancel]
```

### Preview generation

Before publishing, the bot generates a live preview:

1. Fetches the current `index.html` from `raw.githubusercontent.com`.
2. Rewrites all relative asset paths to absolute `https://vrcarsoficial.com/...` URLs.
3. Injects the new car's HTML card at the top of the appropriate grid.
4. Appends a red "PREVIEW" banner at the bottom.
5. Stores the resulting HTML in KV under `preview:<uuid>` (1-hour TTL).
6. Stores the photo base64 in KV under `photo:<uuid>` (1-hour TTL).
7. Sends the preview URL to the dealer via Telegram.

Both the preview and photo endpoints set `Cache-Control: no-store` to prevent browsers from caching stale previews when the dealer re-adjusts image position.

### Publishing

When the dealer confirms:

1. Fetches the car photo from KV and commits it to `brand_assets/<id>.jpg` via the GitHub Contents API.
2. Fetches the current `cars.json` from GitHub (with its SHA, required for the PUT).
3. Appends the new car object, re-encodes as base64, and PUTs back to GitHub.
4. Cleans up KV (deletes preview and photo entries).
5. GitHub detects the `cars.json` change and triggers the build workflow.

### Image position picker

The position keyboard is a 3×3 grid of CSS keyword values:

```
↖️  ⬆️  ↗️     →  left top    center top    right top
◀️  ⬤  ▶️     →  left center  center center  right center
↙️  ⬇️  ↘️     →  left bottom  center bottom  right bottom
[✏️ Valor exacto]
```

The bot also shows the equivalent percentage value after each button press (e.g., `center top (50% 0%)`) so the dealer has a reference if they need to type a custom value.

### Worker configuration

**Environment variables (Cloudflare secrets):**

| Variable | Value |
|---|---|
| `TELEGRAM_TOKEN` | Bot token from BotFather |
| `GITHUB_TOKEN` | Personal access token with `repo` + `workflow` scopes |

**KV namespace:** bind a KV namespace to the variable name `KV` (not `VRCARS_BOT`) in the Worker settings.

**Webhook:** set the Telegram webhook to the Worker URL:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-worker.workers.dev/"
```

**Allowed user:** the bot only responds to the user ID set in `ALLOWED_USER_ID`. Find your ID by messaging `@userinfobot` on Telegram.

**BotFather commands:**

```
addcar - Añadir un coche al catálogo
editcar - Editar un coche existente
deletecar - Eliminar un coche del catálogo
cancel - Cancelar la operación actual
```

---

## Notifications: Telegram deploy alerts

Two separate Telegram messages reach the dealer for each published car:

| Message | When | Sent by |
|---|---|---|
| `🔜 ¡Publicando! Aparecerá en ~5 mins…` | Immediately after GitHub commit | Bot (Worker) |
| `🌐 VR Cars publicado — vrcarsoficial.com actualizado` | When Pages CDN propagation finishes | notify-deploy.yml Action |
| `❌ Error en el build` | If build.py fails | build.yml Action |

---

## Setup guide from scratch

### 1. GitHub repository

1. Create a public repo (Pages requires public for free accounts).
2. Add `cars.json`, `index.html`, `build.py`, `CNAME`, and `brand_assets/` directory.
3. Enable GitHub Pages: Settings → Pages → Deploy from branch `main`, folder `/`.
4. Point your domain's CNAME record to `<username>.github.io`.

### 2. GitHub Actions secrets

Repository → Settings → Secrets and variables → Actions → New repository secret:

- `TELEGRAM_TOKEN` — your bot's API token

### 3. Cloudflare Worker

1. Create a Cloudflare account (free tier is sufficient).
2. Workers & Pages → Create → Worker.
3. Paste the contents of `bot/worker.js`.
4. Add secrets: `TELEGRAM_TOKEN`, `GITHUB_TOKEN`.
5. Create a KV namespace and bind it as `KV` in the Worker's settings.
6. Deploy.

### 4. GitHub Personal Access Token

Generate a PAT at GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens (or classic with `repo` + `workflow` scopes). Add it to Cloudflare as the `GITHUB_TOKEN` secret.

### 5. Register the Telegram bot

1. Message `@BotFather` on Telegram → `/newbot`.
2. Copy the token to both GitHub secrets and Cloudflare secrets.
3. Register the webhook:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<worker-subdomain>.workers.dev/"
   ```
4. Set bot commands via BotFather → `/setcommands`.

---

## UTF-8 encoding: critical gotcha

This is the most common source of data corruption in this stack. **Read this carefully.**

### The problem

The GitHub Contents API returns file content as base64. When you decode it with `atob()` in JavaScript, you get a binary string — **not** a UTF-8 string. If you then parse and re-encode this with `btoa(JSON.stringify(...))`, JavaScript treats the internal string as Latin-1, so any multi-byte character (é, ó, ·, ñ, etc.) gets double-encoded.

The first corruption looks like `ÃÂ©` instead of `é`. After a second corrupt round-trip it becomes `ÃÂÃÂ©`. It compounds with every edit.

### The fix

Always use these paired encode/decode functions:

**Reading from GitHub (base64 → string):**
```js
const text = decodeURIComponent(escape(atob(base64)));
```

**Writing to GitHub (string → base64):**
```js
const base64 = btoa(unescape(encodeURIComponent(text)));
```

The `escape`/`unescape` functions handle the Latin-1 ↔ UTF-8 byte mapping that `atob`/`btoa` alone cannot do.

This pattern is applied in three places in `worker.js`:
- `publishCar()` — reading cars.json before adding a new car
- `delete_confirm` step — reading before removal
- `edit_confirm` step — reading before field update

### Recovering from corruption

If the JSON on GitHub gets corrupted, fix it locally and push:

```bash
# Edit cars.json with correct UTF-8 characters
python3 -c "
import json
with open('cars.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
"
git add cars.json
git commit -m "fix: restore UTF-8 encoding in cars.json"
git push
```

Python's `json.dump` with `ensure_ascii=False` writes real UTF-8 characters, not escape sequences. Always verify the output before pushing.

---

## Local development

Start the local server (Node.js required):

```bash
node serve.mjs
# → http://localhost:3000
```

Run the build script locally after editing `cars.json`:

```bash
python3 build.py
```

---

## Adapting this pattern to other websites

This architecture works for any small business website where a non-technical owner needs to update content from their phone. The pattern generalises cleanly.

### What stays the same

- GitHub as a free static host (Pages)
- GitHub Actions as a free build server
- Cloudflare Worker as a free bot backend
- Cloudflare KV for ephemeral session state
- Telegram as the content management interface

### What changes per project

**1. The data schema (`cars.json` equivalent)**

Replace with whatever your domain needs — `properties.json`, `menu.json`, `events.json`. Keep it a flat JSON array of objects. Avoid nesting more than one level deep; the bot conversation gets complicated quickly.

**2. The build script (`build.py` equivalent)**

The script only needs to do three things:
1. Read the JSON file.
2. Generate HTML snippets from it.
3. Inject those snippets into the right place in `index.html` using regex.

The key technique is using sentinel HTML comments as regex anchors:
```html
<!-- ===== CATALOG START ===== -->
... generated content here ...
<!-- ===== CATALOG END ===== -->
```
```python
html = re.sub(
    r'<!-- ===== CATALOG START ===== -->.*?<!-- ===== CATALOG END ===== -->',
    f'<!-- ===== CATALOG START ===== -->\n{generated}\n<!-- ===== CATALOG END ===== -->',
    html, flags=re.DOTALL
)
```

**3. The bot conversation flow**

Map your data schema to a linear sequence of questions. Each field in the JSON becomes one step in the conversation. Use Telegram inline keyboards (callback buttons) for fields with a fixed set of values, and text input for free-form fields.

**4. The preview**

Fetching the live `index.html` and injecting a card into it works for any website — just adjust the injection point. The preview gives the owner confidence before committing to production.

### Things to watch out for

- **Photo storage cost:** Cloudflare KV free tier allows 1 GB storage. Each car photo stored temporarily during the publish flow is typically 1–3 MB; the 1-hour TTL ensures cleanup. Monitor usage if you have high publish volume.
- **GitHub API rate limits:** the Contents API allows 5,000 requests/hour for authenticated requests. A single publish flow uses ~4 requests; this is not a concern in practice.
- **Webhook timeouts:** Cloudflare Workers must respond within 30 seconds. Long operations (generating preview, fetching from GitHub) are fine because they use `await` inside the Worker's async handler.
- **UTF-8 encoding:** always use the `btoa(unescape(encodeURIComponent(...)))` / `decodeURIComponent(escape(atob(...)))` pair. Never use raw `atob`/`btoa` on text that may contain non-ASCII characters.
- **State TTL:** KV state expires after 1 hour. If the owner starts adding a car and doesn't finish within an hour, the state is lost and they need to start over. Adjust the TTL in `setState()` if your flows are longer.
