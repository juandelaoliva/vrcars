#!/usr/bin/env python3
"""
VR Cars — Build script
Reads cars.json and regenerates the catalog section + stats in index.html.
Everything outside the catalog is left untouched.
"""

import json, re, sys
from pathlib import Path

ROOT = Path(__file__).parent
CARS_FILE = ROOT / "cars.json"
INDEX_FILE = ROOT / "index.html"

WHATSAPP_NUMBER = "34678696699"
WA_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>'

# ── Grid logic ────────────────────────────────────────────────────────────────

def best_columns(count, max_cols=4):
    """Return the best column count for a given number of cards."""
    if count == 0:
        return 1
    if count <= max_cols:
        return count
    if count % 3 == 0:
        return 3
    if count % 4 == 0:
        return 4
    return 4  # default: 4 cols with smaller last row

# ── Card generators ───────────────────────────────────────────────────────────

def origin_label(car):
    return "Importado de Alemania" if car["origin"] == "germany" else "Vehículo Nacional"

def img_style(car):
    pos = car.get("imagePosition", "center 50%")
    if pos and pos != "center 50%":
        return f' style="object-position: {pos};"'
    return ""

def available_card(car, delay):
    delay_style = f' style="transition-delay:{delay:.2f}s"' if delay > 0 else ""
    wa_msg = car.get("whatsapp", f"Hola%20Victor%2C%20me%20interesa%20el%20{car['brand']}%20{car['model']}.%20%C2%BFPodemos%20hablar%3F")
    return f"""      <a class="car-card car-card--available reveal"{delay_style} href="https://wa.me/{WHATSAPP_NUMBER}?text={wa_msg}" target="_blank" rel="noopener">
        <div class="car-img-box">
          <img class="car-thumb" src="{car['image']}" alt="{car['brand']} {car['model']}"{img_style(car)}>
          <div class="car-overlay"></div>
          <div class="car-badge">Disponible</div>
        </div>
        <div class="car-body">
          <div class="car-brand-badge">{car['brand']} · {origin_label(car)}</div>
          <div class="car-name">{car['model']}</div>
          <div class="car-specs">
            <div class="spec"><span class="spec-v">{car['engine']}</span><span class="spec-l">Motor</span></div>
            <div class="spec"><span class="spec-v">{car['year']}</span><span class="spec-l">Año</span></div>
            <div class="spec"><span class="spec-v">{car['km']}</span><span class="spec-l">Kilometraje</span></div>
          </div>
          <div class="car-footer">
            <span class="car-price">Consultar Precio</span>
            <span class="card-arrow">
              {WA_ICON}
              Consultar por WhatsApp
            </span>
          </div>
        </div>
      </a>"""

def sold_card(car, delay):
    delay_style = f' style="transition-delay:{delay:.2f}s"' if delay > 0 else ""
    return f"""      <div class="car-card reveal"{delay_style}>
        <div class="car-img-box">
          <img class="car-thumb" src="{car['image']}" alt="{car['brand']} {car['model']} vendido"{img_style(car)}>
          <div class="car-overlay"></div>
          <div class="car-badge" style="background:var(--asphalt);color:var(--silver);border:1px solid rgba(141,153,174,0.3);">Vendido</div>
        </div>
        <div class="car-body" style="opacity:0.65;">
          <div class="car-brand-badge">{car['brand']} · {origin_label(car)}</div>
          <div class="car-name">{car['model']}</div>
          <div class="car-specs">
            <div class="spec"><span class="spec-v">{car['engine']}</span><span class="spec-l">Motor</span></div>
            <div class="spec"><span class="spec-v">{car['year']}</span><span class="spec-l">Año</span></div>
            <div class="spec"><span class="spec-v">{car['km']}</span><span class="spec-l">Kilometraje</span></div>
          </div>
          <div class="car-footer">
            <span class="car-price" style="color:var(--silver);">Vendido</span>
          </div>
        </div>
      </div>"""

# ── Grid CSS ──────────────────────────────────────────────────────────────────

def grid_css(available_count, sold_count):
    a_cols = best_columns(available_count)
    s_cols = best_columns(sold_count)
    return f"""    .cars-grid {{ display: grid; gap: 16px; }}
    .available-grid {{ grid-template-columns: repeat({a_cols}, 1fr); }}
    .sold-grid {{ grid-template-columns: repeat({s_cols}, 1fr); margin-top: 16px; }}
    .cars-grid > .car-card--available .car-img-box {{ height: 240px; }}"""

# ── Main ──────────────────────────────────────────────────────────────────────

def build():
    cars = json.loads(CARS_FILE.read_text(encoding="utf-8"))
    html = INDEX_FILE.read_text(encoding="utf-8")

    available = [c for c in cars if c["status"] == "available"]
    sold      = [c for c in cars if c["status"] == "sold"]

    # Stats
    imported = len(cars)  # all brokered cars, regardless of origin
    n_sold   = len(sold)
    n_avail  = len(available)

    # ── Build card HTML ───────────────────────────────────────────────────────
    available_cards = "\n".join(
        available_card(c, i * 0.05) for i, c in enumerate(available)
    )
    sold_cards = "\n".join(
        sold_card(c, i * 0.08) for i, c in enumerate(sold)
    )

    a_cols = best_columns(len(available))
    s_cols = best_columns(len(sold))

    new_grid = f"""    <div class="cars-grid">
      <div class="available-grid">
{available_cards}
      </div>
      <div class="sold-grid">
{sold_cards}
      </div>
    </div>"""

    # ── Replace catalog grid ──────────────────────────────────────────────────
    html = re.sub(
        r'<div class="cars-grid">.*?</div>\s*</div>\s*</div>\s*</section>\s*\n<!-- ===== WHY',
        new_grid + '\n    </div>\n  </div>\n</section>\n\n<!-- ===== WHY',
        html, flags=re.DOTALL
    )

    # ── Replace grid CSS ──────────────────────────────────────────────────────
    new_css = (
        f"    .cars-grid {{ display: grid; gap: 16px; }}\n"
        f"    .available-grid {{ display: grid; grid-template-columns: repeat({a_cols}, 1fr); gap: 16px; }}\n"
        f"    .sold-grid {{ display: grid; grid-template-columns: repeat({s_cols}, 1fr); gap: 16px; margin-top: 16px; }}\n"
        f"    .cars-grid > .car-card--available .car-img-box {{ height: 240px; }}"
    )
    html = re.sub(
        r'\.cars-grid \{[^}]+\}.*?\.cars-grid > \.car-card--available \.car-img-box \{[^}]+\}',
        new_css,
        html, flags=re.DOTALL
    )

    # ── Replace hero stats ────────────────────────────────────────────────────
    html = re.sub(
        r'(<div class="stat-num">)\d+(</div>\s*<div class="stat-lbl">Coches Importados)',
        rf'\g<1>{imported}\2', html
    )
    html = re.sub(
        r'(<div class="stat-num">)\d+(</div>\s*<div class="stat-lbl">Vendidos con Éxito)',
        rf'\g<1>{n_sold}\2', html
    )
    html = re.sub(
        r'(<div class="stat-num">)\d+(</div>\s*<div class="stat-lbl">Disponibles Ahora)',
        rf'\g<1>{n_avail}\2', html
    )

    # ── Replace proof bar stats ───────────────────────────────────────────────
    html = re.sub(
        r'(<div class="proof-num">)\d+(</div>\s*<div class="proof-lbl">Coches Importados)',
        rf'\g<1>{imported}\2', html
    )
    html = re.sub(
        r'(<div class="proof-num">)\d+(</div>\s*<div class="proof-lbl">Vendidos con Éxito)',
        rf'\g<1>{n_sold}\2', html
    )

    INDEX_FILE.write_text(html, encoding="utf-8")
    print(f"✅ Built: {len(available)} available, {len(sold)} sold ({imported} imported)")
    print(f"   Grid: available={a_cols} cols, sold={s_cols} cols")
    print(f"   Stats: {imported} importados · {n_sold} vendidos · {n_avail} disponibles")

if __name__ == "__main__":
    build()
