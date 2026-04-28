# VR Cars — Landing Page

Single-file landing page at `index.html`. All styles inline, fonts via Google Fonts, Tailwind via CDN.

## Local development server

Node.js is not installed on this machine, so the Node-based `serve.mjs` is unused. Instead, the page is served with Python's built-in HTTP server:

```bash
python3 -m http.server 3001
```

Port `3001` is used because port `3000` is occupied by another project on this machine. Open `http://localhost:3001` once the server is running.

## Screenshot pipeline

Screenshots are generated with headless Chrome driven through Selenium. This avoids needing the GUI `screencapture` command (which fails inside the sandboxed shell with "could not create image from display") and avoids Puppeteer (not installed).

### Stack

| Layer | Tool | Notes |
|---|---|---|
| Browser | Google Chrome (headful binary at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`) | Launched with `--headless=new` |
| Automation | Selenium 4.x for Python | Installed via `pip3 install selenium` |
| WebDriver | Selenium Manager (bundled with Selenium 4) | Auto-downloads the matching ChromeDriver on first run — no manual install needed |
| Runner | `python3` (3.9 system) | Inline `python3 - <<'EOF' ... EOF` blocks |

### How it works

1. Start the Python server on port `3001`.
2. Launch headless Chrome at `1440×900`.
3. Navigate to `http://localhost:3001`, wait ~2.5s for fonts + scroll reveals.
4. For each target section, run `window.scrollTo(0, ...)` via JS execution, wait ~0.7s for the `IntersectionObserver` reveals to fire, then call `driver.save_screenshot(...)`.
5. For element-specific close-ups, use `driver.find_element("css selector", ...).screenshot(...)`.

### Output

All screenshots land in `./temporary screenshots/`. Filenames are manual (`r1-hero.png`, `r2-catalog.png`, etc.) rather than auto-incremented, so each round of iteration gets a distinct prefix for easy before/after comparison.

### Example one-shot

```bash
python3 - <<'EOF'
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
import time

opts = Options()
opts.add_argument("--headless=new")
opts.add_argument("--window-size=1440,900")
opts.binary_location = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

driver = webdriver.Chrome(options=opts)
driver.get("http://localhost:3001")
time.sleep(2.5)
driver.save_screenshot("temporary screenshots/hero.png")
driver.quit()
EOF
```

## Project structure

```
VR-Cars/
├── index.html                # the landing page (all CSS inline)
├── brand_assets/             # logos + brand guidelines
│   ├── logo-transparent.png  # primary logo (transparent bg, use this one)
│   ├── logo-white.png        # metallic 3D logo on white bg (legacy)
│   ├── brand-guideline.html
│   ├── VR Cars - Brand Guideline.png
│   └── VR Cars logos guideline.png
├── temporary screenshots/    # Selenium output
├── serve.mjs                 # Node dev server (unused — no Node installed)
└── README.md
```
