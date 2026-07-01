// VR Cars Telegram Bot — Phase 3 + delete + edit

const TELEGRAM_API = 'https://api.telegram.org/bot';
const ALLOWED_USER_ID = 2539761;
const GITHUB_OWNER = 'juandelaoliva';
const GITHUB_REPO = 'vrcars';
const GITHUB_BRANCH = 'main';
const WHATSAPP_NUMBER = '34678696699';
const WA_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

// ─── Telegram helpers ────────────────────────────────────────────────────────

async function sendMessage(token, chatId, text, keyboard = null) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
  await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function answerCallback(token, callbackQueryId) {
  await fetch(`${TELEGRAM_API}${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}

async function getPhotoUrl(token, fileId) {
  const res = await fetch(`${TELEGRAM_API}${token}/getFile?file_id=${fileId}`);
  const data = await res.json();
  return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
}

// ─── State helpers ───────────────────────────────────────────────────────────

async function getState(kv, userId) {
  const raw = await kv.get(`state:${userId}`);
  return raw ? JSON.parse(raw) : { step: 'idle', data: {} };
}

async function setState(kv, userId, state) {
  await kv.put(`state:${userId}`, JSON.stringify(state), { expirationTtl: 3600 });
}

async function clearState(kv, userId) {
  await kv.delete(`state:${userId}`);
}

// ─── Format helpers ──────────────────────────────────────────────────────────

function makeId(brand, model) {
  return (brand + '-' + model)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function originLabel(origin) {
  return origin === 'germany' ? 'Importado de Alemania' : 'Vehículo Nacional';
}

function carLine(car) {
  const icon = car.status === 'available' ? '🟢' : '🔴';
  return `${icon} ${car.brand} ${car.model} (${car.year})`;
}

function buildSummary(data) {
  const pos = data.imagePosition || 'center 50%';
  return `<b>📋 Resumen del coche:</b>

🚗 <b>${data.brand} ${data.model}</b>
⚙️ ${data.engine} · ${data.fuel}
📅 ${data.year}
📏 ${data.km}
📍 ${originLabel(data.origin)}
${data.status === 'available' ? '🟢 Disponible' : '🔴 Vendido'}
🖼 Posición imagen: <code>${pos}</code>

¿Todo correcto?`;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ─── Car list helpers ─────────────────────────────────────────────────────────

async function fetchCarsRaw() {
  const res = await fetch(
    `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/cars.json`,
    { headers: { 'Cache-Control': 'no-cache' } }
  );
  return res.json();
}

function carsKeyboard(cars, prefix) {
  return cars.map((car, i) => [{ text: carLine(car), callback_data: `${prefix}:${i}` }]);
}

const EDIT_FIELDS = [
  { key: 'brand',         label: '🏷 Marca' },
  { key: 'model',         label: '🚗 Modelo' },
  { key: 'engine',        label: '⚙️ Motor' },
  { key: 'year',          label: '📅 Año' },
  { key: 'km',            label: '📏 Kilómetros' },
  { key: 'status',        label: '🔵 Estado' },
  { key: 'origin',        label: '📍 Procedencia' },
  { key: 'imagePosition', label: '🖼 Posición imagen' },
];

function editFieldsKeyboard() {
  const rows = [];
  for (let i = 0; i < EDIT_FIELDS.length; i += 2) {
    const row = [{ text: EDIT_FIELDS[i].label, callback_data: `editfield:${EDIT_FIELDS[i].key}` }];
    if (EDIT_FIELDS[i + 1]) row.push({ text: EDIT_FIELDS[i + 1].label, callback_data: `editfield:${EDIT_FIELDS[i + 1].key}` });
    rows.push(row);
  }
  return rows;
}

// ─── Card HTML ───────────────────────────────────────────────────────────────

function availableCardHtml(data, imageUrl) {
  const pos = data.imagePosition || 'center 50%';
  const imgStyle = ` style="object-position: ${pos};"`;
  const waMsg = encodeURIComponent(`Hola Victor, me interesa el ${data.brand} ${data.model} (${data.engine}, ${data.year}) que tenéis disponible. ¿Podemos hablar?`);
  return `      <a class="car-card car-card--available reveal" href="https://wa.me/${WHATSAPP_NUMBER}?text=${waMsg}" target="_blank" rel="noopener">
        <div class="car-img-box">
          <img class="car-thumb" src="${imageUrl}" alt="${data.brand} ${data.model}"${imgStyle}>
          <div class="car-overlay"></div>
          <div class="car-badge">Disponible</div>
        </div>
        <div class="car-body">
          <div class="car-brand-badge">${data.brand} · ${originLabel(data.origin)}</div>
          <div class="car-name">${data.model}</div>
          <div class="car-specs">
            <div class="spec"><span class="spec-v">${data.engine}</span><span class="spec-l">Motor</span></div>
            <div class="spec"><span class="spec-v">${data.year}</span><span class="spec-l">Año</span></div>
            <div class="spec"><span class="spec-v">${data.km}</span><span class="spec-l">Kilometraje</span></div>
          </div>
          <div class="car-footer">
            <span class="car-price">Consultar Precio</span>
            <span class="card-arrow">${WA_ICON} Consultar por WhatsApp</span>
          </div>
        </div>
      </a>`;
}

function soldCardHtml(data, imageUrl) {
  const pos = data.imagePosition || 'center 50%';
  const imgStyle = ` style="object-position: ${pos};"`;
  return `      <div class="car-card reveal">
        <div class="car-img-box">
          <img class="car-thumb" src="${imageUrl}" alt="${data.brand} ${data.model} vendido"${imgStyle}>
          <div class="car-overlay"></div>
          <div class="car-badge" style="background:var(--asphalt);color:var(--silver);border:1px solid rgba(141,153,174,0.3);">Vendido</div>
        </div>
        <div class="car-body" style="opacity:0.65;">
          <div class="car-brand-badge">${data.brand} · ${originLabel(data.origin)}</div>
          <div class="car-name">${data.model}</div>
          <div class="car-specs">
            <div class="spec"><span class="spec-v">${data.engine}</span><span class="spec-l">Motor</span></div>
            <div class="spec"><span class="spec-v">${data.year}</span><span class="spec-l">Año</span></div>
            <div class="spec"><span class="spec-v">${data.km}</span><span class="spec-l">Kilometraje</span></div>
          </div>
          <div class="car-footer">
            <span class="car-price" style="color:var(--silver);">Vendido</span>
          </div>
        </div>
      </div>`;
}

// ─── Preview generation ──────────────────────────────────────────────────────

async function generatePreview(kv, data, photoBase64, previewId, workerUrl) {
  const imageUrl = `${workerUrl}/photo/${previewId}`;
  const htmlRes = await fetch(
    `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/index.html`
  );
  let html = await htmlRes.text();

  html = html
    .replace(/src="brand_assets\//g, 'src="https://vrcarsoficial.com/brand_assets/')
    .replace(/href="brand_assets\//g, 'href="https://vrcarsoficial.com/brand_assets/');

  const cardHtml = data.status === 'available'
    ? availableCardHtml(data, imageUrl)
    : soldCardHtml(data, imageUrl);

  const gridClass = data.status === 'available' ? 'available-grid' : 'sold-grid';
  html = html.replace(`<div class="${gridClass}">`, `<div class="${gridClass}">\n${cardHtml}`);

  const banner = `<div style="position:fixed;bottom:0;left:0;right:0;background:#ef4444;color:#fff;text-align:center;padding:12px 16px;font-family:sans-serif;font-size:14px;font-weight:600;z-index:9999;">
  👀 PREVIEW — Este coche aún no está Publicando en la web
</div>`;
  html = html.replace('</body>', banner + '\n</body>');

  await kv.put(`preview:${previewId}`, html, { expirationTtl: 3600 });
  await kv.put(`photo:${previewId}`, photoBase64, { expirationTtl: 3600 });
}

// ─── GitHub API ──────────────────────────────────────────────────────────────

function ghHeaders(ghToken) {
  return {
    'Authorization': `Bearer ${ghToken}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'VRCars-Bot',
  };
}

async function githubGetFile(ghToken, path) {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`,
    { headers: ghHeaders(ghToken) }
  );
  const d = await res.json();
  return { content: d.content.replace(/\n/g, ''), sha: d.sha };
}

async function githubPutFile(ghToken, path, base64Content, message, sha = null) {
  const body = { message, content: base64Content, branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    { method: 'PUT', headers: ghHeaders(ghToken), body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || `GitHub error ${res.status}`);
  }
  return res.json();
}

async function commitCarsJson(ghToken, cars, message) {
  const { sha } = await githubGetFile(ghToken, 'cars.json');
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(cars, null, 2))));
  await githubPutFile(ghToken, 'cars.json', content, message, sha);
}

// ─── Publish new car ─────────────────────────────────────────────────────────

async function publishCar(kv, ghToken, data, previewId) {
  const carId = makeId(data.brand, data.model);
  const imagePath = `brand_assets/${carId}.jpg`;

  const photoBase64 = await kv.get(`photo:${previewId}`);
  await githubPutFile(ghToken, imagePath, photoBase64,
    `feat: add car image for ${data.brand} ${data.model}`);

  const { content, sha } = await githubGetFile(ghToken, 'cars.json');
  const cars = JSON.parse(decodeURIComponent(escape(atob(content))));

  const newCar = {
    id: carId,
    brand: data.brand,
    model: data.model,
    engine: data.engine,
    year: data.year,
    km: data.km,
    status: data.status,
    origin: data.origin,
    image: imagePath,
    imagePosition: data.imagePosition || 'center 50%',
  };
  if (data.status === 'available') {
    newCar.whatsapp = encodeURIComponent(
      `Hola Victor, me interesa el ${data.brand} ${data.model} (${data.engine}, ${data.year}) que tenéis disponible. ¿Podemos hablar?`
    );
  }

  const availableIdx = cars.filter(c => c.status === 'available').length;
  if (data.status === 'available') cars.splice(availableIdx, 0, newCar);
  else cars.push(newCar);

  const newContent = btoa(unescape(encodeURIComponent(JSON.stringify(cars, null, 2))));
  await githubPutFile(ghToken, 'cars.json', newContent,
    `feat: add ${data.brand} ${data.model} to catalog`, sha);

  await kv.delete(`photo:${previewId}`);
  await kv.delete(`preview:${previewId}`);
}

// ─── Position helpers ────────────────────────────────────────────────────────

const POS_EQUIV = {
  'left top':      '0% 0%',
  'center top':    '50% 0%',
  'right top':     '100% 0%',
  'left center':   '0% 50%',
  'center center': '50% 50%',
  'right center':  '100% 50%',
  'left bottom':   '0% 100%',
  'center bottom': '50% 100%',
  'right bottom':  '100% 100%',
};

function posLabel(pos) {
  const equiv = POS_EQUIV[pos];
  return equiv ? `<code>${pos}</code> <i>(${equiv})</i>` : `<code>${pos}</code>`;
}

// ─── Position picker keyboard ─────────────────────────────────────────────────

function posKeyboard(prefix) {
  return [
    [
      { text: '↖️', callback_data: `${prefix}:left top` },
      { text: '⬆️', callback_data: `${prefix}:center top` },
      { text: '↗️', callback_data: `${prefix}:right top` },
    ],
    [
      { text: '◀️', callback_data: `${prefix}:left center` },
      { text: '⬤',  callback_data: `${prefix}:center center` },
      { text: '▶️', callback_data: `${prefix}:right center` },
    ],
    [
      { text: '↙️', callback_data: `${prefix}:left bottom` },
      { text: '⬇️', callback_data: `${prefix}:center bottom` },
      { text: '↘️', callback_data: `${prefix}:right bottom` },
    ],
    [{ text: '✏️ Valor exacto (ej: 40% 60%)', callback_data: `${prefix}:custom` }],
  ];
}

// ─── Conversation steps ──────────────────────────────────────────────────────

async function handleStep(token, kv, chatId, userId, state, input, photoFileId = null, workerUrl = '', ghToken = '') {
  const { step, data } = state;

  switch (step) {

    // ── Add car flow ────────────────────────────────────────────────────────

    case 'idle':
    case 'start': {
      await setState(kv, userId, { step: 'brand', data: {} });
      await sendMessage(token, chatId, '🚗 <b>Añadir coche</b>\n\n¿Cuál es la <b>marca</b>?\n\n<i>Ej: BMW, Audi, SEAT, Volkswagen…</i>');
      break;
    }

    case 'brand': {
      data.brand = input.trim();
      await setState(kv, userId, { step: 'model', data });
      await sendMessage(token, chatId, `Marca: <b>${data.brand}</b> ✓\n\n¿Cuál es el <b>modelo</b>?\n\n<i>Ej: Serie 1 116i, León FR, Golf VII…</i>`);
      break;
    }

    case 'model': {
      data.model = input.trim();
      await setState(kv, userId, { step: 'engine', data });
      await sendMessage(token, chatId, `Modelo: <b>${data.model}</b> ✓\n\n¿Cuál es el <b>motor</b>?\n\n<i>Ej: 1.5 · 109 CV, 2.0 · 190 CV…</i>`);
      break;
    }

    case 'engine': {
      data.engine = input.trim();
      await setState(kv, userId, { step: 'fuel', data });
      await sendMessage(token, chatId, `Motor: <b>${data.engine}</b> ✓\n\n¿Tipo de <b>combustible</b>?`, [
        [{ text: '⛽ Gasolina', callback_data: 'fuel:gasolina' }, { text: '🛢 Diésel', callback_data: 'fuel:diesel' }],
        [{ text: '⚡ Eléctrico', callback_data: 'fuel:electrico' }, { text: '🔋 Híbrido', callback_data: 'fuel:hibrido' }],
      ]);
      break;
    }

    case 'fuel': {
      data.fuel = input;
      await setState(kv, userId, { step: 'year', data });
      await sendMessage(token, chatId, `Combustible: <b>${data.fuel}</b> ✓\n\n¿Cuál es el <b>año</b>?\n\n<i>Ej: 2020</i>`);
      break;
    }

    case 'year': {
      if (!/^\d{4}$/.test(input.trim())) {
        await sendMessage(token, chatId, '⚠️ Introduce un año válido de 4 dígitos. Ej: <b>2020</b>');
        break;
      }
      data.year = input.trim();
      await setState(kv, userId, { step: 'km', data });
      await sendMessage(token, chatId, `Año: <b>${data.year}</b> ✓\n\n¿Cuántos <b>kilómetros</b> tiene?\n\n<i>Ej: 61000 o 61</i>`);
      break;
    }

    case 'km': {
      const raw = input.trim().replace(/\D/g, '');
      if (!raw) { await sendMessage(token, chatId, '⚠️ Introduce un número válido. Ej: <b>61000</b>'); break; }
      const num = parseInt(raw);
      data.km = num >= 1000 ? num.toLocaleString('es-ES') + ' km' : num + '.000 km';
      await setState(kv, userId, { step: 'status', data });
      await sendMessage(token, chatId, `Kilometraje: <b>${data.km}</b> ✓\n\n¿Cuál es el <b>estado</b> del coche?`, [
        [{ text: '🟢 Disponible', callback_data: 'status:available' }, { text: '🔴 Vendido', callback_data: 'status:sold' }],
      ]);
      break;
    }

    case 'status': {
      data.status = input;
      await setState(kv, userId, { step: 'origin', data });
      await sendMessage(token, chatId, `Estado: <b>${input === 'available' ? 'Disponible' : 'Vendido'}</b> ✓\n\n¿De dónde es el coche?`, [
        [{ text: '🇩🇪 Importado de Alemania', callback_data: 'origin:germany' }, { text: '🇪🇸 Vehículo Nacional', callback_data: 'origin:national' }],
      ]);
      break;
    }

    case 'origin': {
      data.origin = input;
      await setState(kv, userId, { step: 'photo', data });
      await sendMessage(token, chatId, `Procedencia: <b>${originLabel(input)}</b> ✓\n\n📸 Ahora <b>envía la foto</b> del coche.`);
      break;
    }

    case 'photo': {
      if (!photoFileId) { await sendMessage(token, chatId, '⚠️ Por favor envía una <b>imagen</b>.'); break; }
      data.photoFileId = photoFileId;
      await setState(kv, userId, { step: 'image_pos', data });
      await sendMessage(token, chatId, '📸 Foto recibida ✓\n\n¿Cómo quieres posicionar la imagen en la tarjeta?', posKeyboard('pos'));
      break;
    }

    case 'image_pos': {
      if (input === 'custom') {
        await setState(kv, userId, { step: 'image_pos_custom', data });
        await sendMessage(token, chatId, '✏️ Escribe la posición manualmente.\n\n<i>Ej: <code>center 35%</code> o <code>55% 62%</code></i>');
        break;
      }
      data.imagePosition = input;
      await setState(kv, userId, { step: 'confirm', data });
      await sendMessage(token, chatId, buildSummary(data), [
        [{ text: '✅ Ver preview', callback_data: 'confirm:yes' }, { text: '🔄 Empezar de nuevo', callback_data: 'confirm:restart' }],
      ]);
      break;
    }

    case 'image_pos_custom': {
      data.imagePosition = input.trim();
      await setState(kv, userId, { step: 'confirm', data });
      await sendMessage(token, chatId, buildSummary(data), [
        [{ text: '✅ Ver preview', callback_data: 'confirm:yes' }, { text: '🔄 Empezar de nuevo', callback_data: 'confirm:restart' }],
      ]);
      break;
    }

    case 'confirm': {
      if (input === 'restart') {
        await clearState(kv, userId);
        await setState(kv, userId, { step: 'brand', data: {} });
        await sendMessage(token, chatId, '🔄 Empezamos de nuevo.\n\n¿Cuál es la <b>marca</b>?');
        break;
      }
      if (input === 'yes') {
        await sendMessage(token, chatId, '⏳ Generando preview...');
        try {
          const photoUrl = await getPhotoUrl(token, data.photoFileId);
          const photoRes = await fetch(photoUrl);
          const photoBase64 = arrayBufferToBase64(await photoRes.arrayBuffer());
          const previewId = crypto.randomUUID();
          data.previewId = previewId;
          data.photoBase64Cached = true;
          await generatePreview(kv, data, photoBase64, previewId, workerUrl);
          await setState(kv, userId, { step: 'publish_ready', data });
          const previewUrl = `${workerUrl}/preview/${previewId}`;
          await sendMessage(token, chatId,
            `👀 <b>Preview listo</b> (válido 1 hora)\n\n<a href="${previewUrl}">${previewUrl}</a>\n\n¿Lo publicamos?`, [
            [{ text: '🚀 Publicar en la web', callback_data: 'publish:yes' }],
            [{ text: '🖼 Ajustar posición', callback_data: 'publish:adjust' }],
            [{ text: '🔄 Empezar de nuevo', callback_data: 'publish:restart' }],
          ]);
        } catch (err) {
          await sendMessage(token, chatId, `❌ Error generando preview: ${err.message}`);
        }
      }
      break;
    }

    case 'publish_ready': {
      if (input === 'restart') {
        await clearState(kv, userId);
        await setState(kv, userId, { step: 'brand', data: {} });
        await sendMessage(token, chatId, '🔄 Empezamos de nuevo.\n\n¿Cuál es la <b>marca</b>?');
        break;
      }
      if (input === 'adjust') {
        await setState(kv, userId, { step: 'readjust_pos', data });
        await sendMessage(token, chatId, '🖼 ¿Cómo quieres reposicionar la imagen?', posKeyboard('readjust'));
        break;
      }
      if (input === 'yes') {
        await sendMessage(token, chatId, '⏳ Publicando en GitHub...');
        try {
          await publishCar(kv, ghToken, data, data.previewId);
          await clearState(kv, userId);
          await sendMessage(token, chatId,
            `🔜 <b>¡Publicando!</b>\n\nEl <b>${data.brand} ${data.model}</b> aparecerá en la web en ~5 mins aprox.\n\n🌐 https://vrcarsoficial.com`);
        } catch (err) {
          await sendMessage(token, chatId, `❌ Error publicando: ${err.message}`);
        }
      }
      break;
    }

    // ── Re-adjust image position after preview ────────────────────────────

    case 'readjust_pos': {
      if (input === 'custom') {
        await setState(kv, userId, { step: 'readjust_custom', data });
        await sendMessage(token, chatId, '✏️ Escribe la posición manualmente.\n\n<i>Ej: <code>center 35%</code> o <code>55% 62%</code></i>');
        break;
      }
      data.imagePosition = input;
      await sendMessage(token, chatId, '⏳ Regenerando preview...');
      try {
        const photoBase64 = await kv.get(`photo:${data.previewId}`);
        await generatePreview(kv, data, photoBase64, data.previewId, workerUrl);
        await setState(kv, userId, { step: 'publish_ready', data });
        const previewUrl = `${workerUrl}/preview/${data.previewId}`;
        await sendMessage(token, chatId,
          `👀 <b>Preview actualizado</b>\n\nPosición: ${posLabel(input)}\n\n<a href="${previewUrl}">${previewUrl}</a>`, [
          [{ text: '🚀 Publicar en la web', callback_data: 'publish:yes' }],
          [{ text: '🖼 Ajustar posición', callback_data: 'publish:adjust' }],
          [{ text: '🔄 Empezar de nuevo', callback_data: 'publish:restart' }],
        ]);
      } catch (err) {
        await sendMessage(token, chatId, `❌ Error: ${err.message}`);
      }
      break;
    }

    case 'readjust_custom': {
      data.imagePosition = input.trim();
      await sendMessage(token, chatId, '⏳ Regenerando preview...');
      try {
        const photoBase64 = await kv.get(`photo:${data.previewId}`);
        await generatePreview(kv, data, photoBase64, data.previewId, workerUrl);
        await setState(kv, userId, { step: 'publish_ready', data });
        const previewUrl = `${workerUrl}/preview/${data.previewId}`;
        await sendMessage(token, chatId,
          `👀 <b>Preview actualizado</b>\n\nPosición: ${posLabel(data.imagePosition)}\n\n<a href="${previewUrl}">${previewUrl}</a>`, [
          [{ text: '🚀 Publicar en la web', callback_data: 'publish:yes' }],
          [{ text: '🖼 Ajustar posición', callback_data: 'publish:adjust' }],
          [{ text: '🔄 Empezar de nuevo', callback_data: 'publish:restart' }],
        ]);
      } catch (err) {
        await sendMessage(token, chatId, `❌ Error: ${err.message}`);
      }
      break;
    }

    // ── Delete car flow ───────────────────────────────────────────────────

    case 'delete_select': {
      const idx = parseInt(input);
      const cars = await fetchCarsRaw();
      const car = cars[idx];
      if (!car) { await sendMessage(token, chatId, '❌ Coche no encontrado.'); break; }
      await setState(kv, userId, { step: 'delete_confirm', data: { carIdx: idx } });
      await sendMessage(token, chatId,
        `¿Eliminar este coche?\n\n${carLine(car)}\n${car.engine} · ${car.year} · ${car.km}\n${originLabel(car.origin)}`, [
        [{ text: '🗑 Sí, eliminar', callback_data: 'delconfirm:yes' }, { text: '❌ Cancelar', callback_data: 'delconfirm:no' }],
      ]);
      break;
    }

    case 'delete_confirm': {
      if (input === 'no') {
        await clearState(kv, userId);
        await sendMessage(token, chatId, '❌ Eliminación cancelada.');
        break;
      }
      if (input === 'yes') {
        await sendMessage(token, chatId, '⏳ Eliminando...');
        try {
          const { content, sha } = await githubGetFile(ghToken, 'cars.json');
          const cars = JSON.parse(decodeURIComponent(escape(atob(content))));
          const removed = cars.splice(data.carIdx, 1)[0];
          const newContent = btoa(unescape(encodeURIComponent(JSON.stringify(cars, null, 2))));
          await githubPutFile(ghToken, 'cars.json', newContent,
            `feat: remove ${removed.brand} ${removed.model} from catalog`, sha);
          await clearState(kv, userId);
          await sendMessage(token, chatId,
            `🔜 <b>${removed.brand} ${removed.model}</b> eliminado.\n\nLa web se actualizará en ~5 mins aprox.`);
        } catch (err) {
          await sendMessage(token, chatId, `❌ Error eliminando: ${err.message}`);
        }
      }
      break;
    }

    // ── Edit car flow ─────────────────────────────────────────────────────

    case 'edit_select': {
      const idx = parseInt(input);
      const cars = await fetchCarsRaw();
      const car = cars[idx];
      if (!car) { await sendMessage(token, chatId, '❌ Coche no encontrado.'); break; }
      await setState(kv, userId, { step: 'edit_field', data: { carIdx: idx } });
      await sendMessage(token, chatId,
        `Editando: <b>${car.brand} ${car.model}</b>\n\n¿Qué campo quieres cambiar?`,
        editFieldsKeyboard());
      break;
    }

    case 'edit_field': {
      data.editField = input;
      await setState(kv, userId, { step: 'edit_value', data });
      const fieldLabel = EDIT_FIELDS.find(f => f.key === input)?.label || input;

      if (input === 'status') {
        await sendMessage(token, chatId, `${fieldLabel} — elige el nuevo valor:`, [
          [{ text: '🟢 Disponible', callback_data: 'editval:available' }, { text: '🔴 Vendido', callback_data: 'editval:sold' }],
        ]);
      } else if (input === 'origin') {
        await sendMessage(token, chatId, `${fieldLabel} — elige el nuevo valor:`, [
          [{ text: '🇩🇪 Importado de Alemania', callback_data: 'editval:germany' }, { text: '🇪🇸 Vehículo Nacional', callback_data: 'editval:national' }],
        ]);
      } else if (input === 'imagePosition') {
        await sendMessage(token, chatId, `${fieldLabel} — elige la nueva posición:`, posKeyboard('editval'));
      } else {
        const cars = await fetchCarsRaw();
        const current = cars[data.carIdx]?.[input] || '—';
        await sendMessage(token, chatId, `${fieldLabel}\n\nValor actual: <code>${current}</code>\n\nEscribe el nuevo valor:`);
      }
      break;
    }

    case 'edit_value': {
      let newValue = input.trim();

      // imagePosition custom
      if (data.editField === 'imagePosition' && newValue === 'custom') {
        await setState(kv, userId, { step: 'edit_pos_custom', data });
        await sendMessage(token, chatId, '✏️ Escribe la posición manualmente.\n\n<i>Ej: <code>center 35%</code> o <code>55% 62%</code></i>');
        break;
      }

      // Validate km as number
      if (data.editField === 'km') {
        const raw = newValue.replace(/\D/g, '');
        if (!raw) { await sendMessage(token, chatId, '⚠️ Introduce un número válido. Ej: <b>61000</b>'); break; }
        const num = parseInt(raw);
        newValue = num >= 1000 ? num.toLocaleString('es-ES') + ' km' : num + '.000 km';
      }

      // Validate year
      if (data.editField === 'year' && !/^\d{4}$/.test(newValue)) {
        await sendMessage(token, chatId, '⚠️ Introduce un año válido de 4 dígitos. Ej: <b>2020</b>');
        break;
      }

      data.editNewValue = newValue;
      await setState(kv, userId, { step: 'edit_confirm', data });

      const fieldLabel = EDIT_FIELDS.find(f => f.key === data.editField)?.label || data.editField;
      await sendMessage(token, chatId,
        `${fieldLabel} → <code>${newValue}</code>\n\n¿Confirmar cambio?`, [
        [{ text: '✅ Confirmar', callback_data: 'editconfirm:yes' }, { text: '❌ Cancelar', callback_data: 'editconfirm:no' }],
      ]);
      break;
    }

    case 'edit_pos_custom': {
      data.editNewValue = input.trim();
      await setState(kv, userId, { step: 'edit_confirm', data });
      await sendMessage(token, chatId,
        `🖼 Posición imagen → <code>${data.editNewValue}</code>\n\n¿Confirmar cambio?`, [
        [{ text: '✅ Confirmar', callback_data: 'editconfirm:yes' }, { text: '❌ Cancelar', callback_data: 'editconfirm:no' }],
      ]);
      break;
    }

    case 'edit_confirm': {
      if (input === 'no') {
        await clearState(kv, userId);
        await sendMessage(token, chatId, '❌ Edición cancelada.');
        break;
      }
      if (input === 'yes') {
        await sendMessage(token, chatId, '⏳ Guardando cambio...');
        try {
          const { content, sha } = await githubGetFile(ghToken, 'cars.json');
          const cars = JSON.parse(decodeURIComponent(escape(atob(content))));
          const car = cars[data.carIdx];
          car[data.editField] = data.editNewValue;

          // If status changed to available, add whatsapp if missing
          if (data.editField === 'status' && data.editNewValue === 'available' && !car.whatsapp) {
            car.whatsapp = encodeURIComponent(
              `Hola Victor, me interesa el ${car.brand} ${car.model} (${car.engine}, ${car.year}) que tenéis disponible. ¿Podemos hablar?`
            );
          }

          const newContent = btoa(unescape(encodeURIComponent(JSON.stringify(cars, null, 2))));
          const fieldLabel = EDIT_FIELDS.find(f => f.key === data.editField)?.label || data.editField;
          await githubPutFile(ghToken, 'cars.json', newContent,
            `feat: update ${data.editField} for ${car.brand} ${car.model}`, sha);
          await clearState(kv, userId);
          await sendMessage(token, chatId,
            `🔜 <b>${car.brand} ${car.model}</b> actualizado.\n${fieldLabel} → <code>${data.editNewValue}</code>\n\nLa web se actualizará en ~5 mins aprox.`);
        } catch (err) {
          await sendMessage(token, chatId, `❌ Error guardando: ${err.message}`);
        }
      }
      break;
    }

    default: {
      await clearState(kv, userId);
      await sendMessage(token, chatId,
        '❓ Comandos disponibles:\n/addcar — añadir coche\n/editcar — editar coche\n/deletecar — eliminar coche\n/cancel — cancelar');
    }
  }
}

// ─── Main handler ────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const workerUrl = new URL(request.url).origin;

    if (request.method === 'GET') {
      const path = new URL(request.url).pathname;

      if (path.startsWith('/preview/')) {
        const id = path.replace('/preview/', '');
        const html = await env.KV.get(`preview:${id}`);
        if (!html) return new Response('Preview expirado o no encontrado.', { status: 404 });
        return new Response(html, { headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' } });
      }

      if (path.startsWith('/photo/')) {
        const id = path.replace('/photo/', '');
        const base64 = await env.KV.get(`photo:${id}`);
        if (!base64) return new Response('Foto no encontrada.', { status: 404 });
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        return new Response(bytes, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } });
      }

      return new Response('VR Cars Bot is running ✓', { status: 200 });
    }

    if (request.method !== 'POST') return new Response('ok', { status: 200 });

    const update = await request.json();

    // Inline button presses
    if (update.callback_query) {
      const cb = update.callback_query;
      const userId = cb.from.id;
      if (userId !== ALLOWED_USER_ID) return new Response('ok', { status: 200 });

      await answerCallback(env.TELEGRAM_TOKEN, cb.id);
      const chatId = cb.message.chat.id;
      const prefix = cb.data.split(':')[0];
      const fullValue = cb.data.substring(prefix.length + 1);
      const state = await getState(env.KV, userId);

      const stepMap = {
        fuel:        'fuel',
        status:      'status',
        origin:      'origin',
        pos:         'image_pos',
        confirm:     'confirm',
        publish:     'publish_ready',
        readjust:    'readjust_pos',
        del:         'delete_select',
        delconfirm:  'delete_confirm',
        editcar:     'edit_select',
        editfield:   'edit_field',
        editval:     'edit_value',
        editconfirm: 'edit_confirm',
      };

      if (stepMap[prefix] && state.step === stepMap[prefix]) {
        await handleStep(env.TELEGRAM_TOKEN, env.KV, chatId, userId, state, fullValue, null, workerUrl, env.GITHUB_TOKEN);
      }

      return new Response('ok', { status: 200 });
    }

    // Regular messages
    const message = update.message;
    if (!message) return new Response('ok', { status: 200 });

    const userId = message.from.id;
    if (userId !== ALLOWED_USER_ID) return new Response('ok', { status: 200 });

    const chatId = message.chat.id;
    const text = message.text || '';
    const photo = message.photo;

    if (text === '/start' || text === '/addcar') {
      await handleStep(env.TELEGRAM_TOKEN, env.KV, chatId, userId, { step: 'start', data: {} }, text, null, workerUrl, env.GITHUB_TOKEN);
      return new Response('ok', { status: 200 });
    }

    if (text === '/deletecar') {
      const cars = await fetchCarsRaw();
      if (!cars.length) { await sendMessage(env.TELEGRAM_TOKEN, chatId, '❌ No hay coches en el catálogo.'); return new Response('ok', { status: 200 }); }
      await setState(env.KV, userId, { step: 'delete_select', data: {} });
      await sendMessage(env.TELEGRAM_TOKEN, chatId, '🗑 ¿Qué coche quieres eliminar?', carsKeyboard(cars, 'del'));
      return new Response('ok', { status: 200 });
    }

    if (text === '/editcar') {
      const cars = await fetchCarsRaw();
      if (!cars.length) { await sendMessage(env.TELEGRAM_TOKEN, chatId, '❌ No hay coches en el catálogo.'); return new Response('ok', { status: 200 }); }
      await setState(env.KV, userId, { step: 'edit_select', data: {} });
      await sendMessage(env.TELEGRAM_TOKEN, chatId, '✏️ ¿Qué coche quieres editar?', carsKeyboard(cars, 'editcar'));
      return new Response('ok', { status: 200 });
    }

    if (text === '/cancel') {
      await clearState(env.KV, userId);
      await sendMessage(env.TELEGRAM_TOKEN, chatId, '❌ Operación cancelada.\n\n/addcar — añadir coche\n/editcar — editar coche\n/deletecar — eliminar coche');
      return new Response('ok', { status: 200 });
    }

    if (photo) {
      const state = await getState(env.KV, userId);
      const fileId = photo[photo.length - 1].file_id;
      await handleStep(env.TELEGRAM_TOKEN, env.KV, chatId, userId, state, '', fileId, workerUrl, env.GITHUB_TOKEN);
      return new Response('ok', { status: 200 });
    }

    if (text) {
      const state = await getState(env.KV, userId);
      if (state.step === 'idle') {
        await sendMessage(env.TELEGRAM_TOKEN, chatId,
          '👋 Comandos disponibles:\n\n/addcar — añadir coche\n/editcar — editar coche\n/deletecar — eliminar coche\n/cancel — cancelar');
      } else {
        await handleStep(env.TELEGRAM_TOKEN, env.KV, chatId, userId, state, text, null, workerUrl, env.GITHUB_TOKEN);
      }
    }

    return new Response('ok', { status: 200 });
  },
};
