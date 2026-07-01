// VR Cars Telegram Bot — Phase 2 (conversation flow)

const TELEGRAM_API = 'https://api.telegram.org/bot';
const ALLOWED_USER_ID = 2539761;

// ─── Telegram helpers ────────────────────────────────────────────────────────

async function sendMessage(token, chatId, text, keyboard = null) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML' };
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

function formatKm(km) {
  return parseInt(km.replace(/\D/g, '')).toLocaleString('es-ES') + '.000 km';
}

function buildSummary(data) {
  const origin = data.origin === 'germany' ? 'Importado de Alemania' : 'Vehículo Nacional';
  const status = data.status === 'available' ? '🟢 Disponible' : '🔴 Vendido';
  const pos = data.imagePosition || 'center 50%';
  return `<b>📋 Resumen del coche:</b>

🚗 <b>${data.brand} ${data.model}</b>
⚙️ ${data.engine} · ${data.fuel}
📅 ${data.year}
📏 ${data.km}
📍 ${origin}
${status}
🖼 Posición imagen: <code>${pos}</code>

¿Todo correcto?`;
}

// ─── Conversation steps ──────────────────────────────────────────────────────

async function handleStep(token, kv, chatId, userId, state, input, photoFileId = null) {
  const { step, data } = state;

  switch (step) {

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
        [
          { text: '⛽ Gasolina', callback_data: 'fuel:gasolina' },
          { text: '🛢 Diésel', callback_data: 'fuel:diesel' },
        ],
        [
          { text: '⚡ Eléctrico', callback_data: 'fuel:electrico' },
          { text: '🔋 Híbrido', callback_data: 'fuel:hibrido' },
        ],
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
      if (!raw) {
        await sendMessage(token, chatId, '⚠️ Introduce un número de kilómetros válido. Ej: <b>61000</b>');
        break;
      }
      const num = parseInt(raw);
      data.km = num >= 1000 ? num.toLocaleString('es-ES') + ' km' : num + '.000 km';
      await setState(kv, userId, { step: 'status', data });
      await sendMessage(token, chatId, `Kilometraje: <b>${data.km}</b> ✓\n\n¿Cuál es el <b>estado</b> del coche?`, [
        [
          { text: '🟢 Disponible', callback_data: 'status:available' },
          { text: '🔴 Vendido', callback_data: 'status:sold' },
        ],
      ]);
      break;
    }

    case 'status': {
      data.status = input;
      await setState(kv, userId, { step: 'origin', data });
      await sendMessage(token, chatId, `Estado: <b>${input === 'available' ? 'Disponible' : 'Vendido'}</b> ✓\n\n¿De dónde es el coche?`, [
        [
          { text: '🇩🇪 Importado de Alemania', callback_data: 'origin:germany' },
          { text: '🇪🇸 Vehículo Nacional', callback_data: 'origin:national' },
        ],
      ]);
      break;
    }

    case 'origin': {
      data.origin = input;
      await setState(kv, userId, { step: 'photo', data });
      const originLabel = input === 'germany' ? 'Importado de Alemania' : 'Vehículo Nacional';
      await sendMessage(token, chatId, `Procedencia: <b>${originLabel}</b> ✓\n\n📸 Ahora <b>envía la foto</b> del coche.`);
      break;
    }

    case 'photo': {
      if (!photoFileId) {
        await sendMessage(token, chatId, '⚠️ Por favor envía una <b>imagen</b>.');
        break;
      }
      data.photoFileId = photoFileId;
      await setState(kv, userId, { step: 'image_pos', data });
      await sendMessage(token, chatId, '📸 Foto recibida ✓\n\n¿Cómo quieres posicionar la imagen en la tarjeta?', [
        [
          { text: '⬆️ Más arriba', callback_data: 'pos:center 25%' },
          { text: '⬤ Centro', callback_data: 'pos:center 50%' },
          { text: '⬇️ Más abajo', callback_data: 'pos:center 75%' },
        ],
        [
          { text: '✏️ Personalizado', callback_data: 'pos:custom' },
        ],
      ]);
      break;
    }

    case 'image_pos': {
      if (input === 'custom') {
        await setState(kv, userId, { step: 'image_pos_custom', data });
        await sendMessage(token, chatId, '✏️ Escribe la posición manualmente.\n\n<i>Ej: <code>center 35%</code> o <code>center 65%</code></i>');
        break;
      }
      data.imagePosition = input;
      await setState(kv, userId, { step: 'confirm', data });
      await sendMessage(token, chatId, buildSummary(data), [
        [
          { text: '✅ Publicar', callback_data: 'confirm:yes' },
          { text: '🔄 Empezar de nuevo', callback_data: 'confirm:restart' },
        ],
      ]);
      break;
    }

    case 'image_pos_custom': {
      data.imagePosition = input.trim();
      await setState(kv, userId, { step: 'confirm', data });
      await sendMessage(token, chatId, buildSummary(data), [
        [
          { text: '✅ Publicar', callback_data: 'confirm:yes' },
          { text: '🔄 Empezar de nuevo', callback_data: 'confirm:restart' },
        ],
      ]);
      break;
    }

    case 'confirm': {
      if (input === 'restart') {
        await clearState(kv, userId);
        await sendMessage(token, chatId, '🔄 Empezamos de nuevo.\n\n¿Cuál es la <b>marca</b>?');
        await setState(kv, userId, { step: 'brand', data: {} });
        break;
      }
      if (input === 'yes') {
        await clearState(kv, userId);
        await sendMessage(token, chatId, '🚧 <b>Publicación pendiente</b>\n\nEn la siguiente fase conectamos esto con GitHub y el coche aparecerá en la web automáticamente.\n\n¡Fase 2 completada! ✅');
      }
      break;
    }

    default: {
      await clearState(kv, userId);
      await sendMessage(token, chatId, '❓ Escribe /addcar para añadir un coche nuevo.');
    }
  }
}

// ─── Main handler ────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('VR Cars Bot is running ✓', { status: 200 });
    }

    const update = await request.json();

    // Handle inline button presses
    if (update.callback_query) {
      const cb = update.callback_query;
      const userId = cb.from.id;
      if (userId !== ALLOWED_USER_ID) return new Response('ok', { status: 200 });

      await answerCallback(env.TELEGRAM_TOKEN, cb.id);
      const chatId = cb.message.chat.id;
      const [prefix, value] = cb.data.split(':');
      const fullValue = cb.data.substring(prefix.length + 1); // handles values with colons

      const state = await getState(env.KV, userId);

      const stepMap = { fuel: 'fuel', status: 'status', origin: 'origin', pos: 'image_pos', confirm: 'confirm' };
      if (stepMap[prefix] && state.step === stepMap[prefix]) {
        await handleStep(env.TELEGRAM_TOKEN, env.KV, chatId, userId, state, fullValue);
      }

      return new Response('ok', { status: 200 });
    }

    // Handle regular messages
    const message = update.message;
    if (!message) return new Response('ok', { status: 200 });

    const userId = message.from.id;
    if (userId !== ALLOWED_USER_ID) return new Response('ok', { status: 200 });

    const chatId = message.chat.id;
    const text = message.text || '';
    const photo = message.photo;

    // Commands
    if (text === '/start' || text === '/addcar') {
      const state = await getState(env.KV, userId);
      await handleStep(env.TELEGRAM_TOKEN, env.KV, chatId, userId, { step: 'start', data: {} }, text);
      return new Response('ok', { status: 200 });
    }

    if (text === '/cancel') {
      await clearState(env.KV, userId);
      await sendMessage(env.TELEGRAM_TOKEN, chatId, '❌ Operación cancelada.\n\nEscribe /addcar para empezar de nuevo.');
      return new Response('ok', { status: 200 });
    }

    // Photo message
    if (photo) {
      const state = await getState(env.KV, userId);
      const fileId = photo[photo.length - 1].file_id; // highest resolution
      await handleStep(env.TELEGRAM_TOKEN, env.KV, chatId, userId, state, '', fileId);
      return new Response('ok', { status: 200 });
    }

    // Text message — advance conversation
    if (text) {
      const state = await getState(env.KV, userId);
      if (state.step === 'idle') {
        await sendMessage(env.TELEGRAM_TOKEN, chatId, '👋 Escribe /addcar para añadir un coche nuevo.');
      } else {
        await handleStep(env.TELEGRAM_TOKEN, env.KV, chatId, userId, state, text);
      }
    }

    return new Response('ok', { status: 200 });
  },
};
