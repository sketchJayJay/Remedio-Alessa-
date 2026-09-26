const express = require('express');
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || '/data';
const STATE_FILE = path.join(DATA_DIR, 'state.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

function defaultState() {
  return { vapid: null, devices: {} };
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.devices) parsed.devices = {};
    return parsed;
  } catch {
    return defaultState();
  }
}

let state = loadState();

function saveState() {
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

if (!state.vapid || !state.vapid.publicKey || !state.vapid.privateKey) {
  state.vapid = webpush.generateVAPIDKeys();
  saveState();
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:remedios@example.com',
  state.vapid.publicKey,
  state.vapid.privateKey
);

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('Cache-Control', req.path.startsWith('/api/') ? 'no-store' : 'no-cache');
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, version: 12 }));
app.get('/api/vapid-public-key', (_req, res) => res.json({ publicKey: state.vapid.publicKey }));

app.post('/api/subscribe', (req, res) => {
  const { deviceId, subscription, schedule } = req.body || {};
  if (!deviceId || !subscription || !subscription.endpoint) {
    return res.status(400).json({ ok: false, error: 'Dados de assinatura inválidos.' });
  }
  const old = state.devices[deviceId] || {};
  state.devices[deviceId] = {
    subscription,
    schedule: Array.isArray(schedule) ? schedule : (old.schedule || []),
    sent: old.sent || {},
    updatedAt: Date.now()
  };
  saveState();
  res.json({ ok: true });
});

app.post('/api/schedule', (req, res) => {
  const { deviceId, schedule } = req.body || {};
  if (!deviceId || !Array.isArray(schedule)) {
    return res.status(400).json({ ok: false, error: 'Cronograma inválido.' });
  }
  const device = state.devices[deviceId];
  if (!device || !device.subscription) {
    return res.status(404).json({ ok: false, error: 'Ative as notificações neste iPhone primeiro.' });
  }
  device.schedule = schedule.slice(0, 500);
  const validIds = new Set(device.schedule.map(e => String(e.id)));
  device.sent = Object.fromEntries(Object.entries(device.sent || {}).filter(([id]) => validIds.has(id)));
  device.updatedAt = Date.now();
  saveState();
  res.json({ ok: true, count: device.schedule.length });
});

app.post('/api/test-push', async (req, res) => {
  const { deviceId } = req.body || {};
  const device = state.devices[deviceId];
  if (!device || !device.subscription) {
    return res.status(404).json({ ok: false, error: 'iPhone não inscrito.' });
  }
  try {
    await sendPush(device.subscription, {
      title: '💊 Teste de lembrete',
      body: 'Se apareceu na tela bloqueada, está funcionando certinho.',
      tag: 'alessa-test-' + Date.now(),
      url: '/'
    });
    res.json({ ok: true });
  } catch (err) {
    if (err && (err.statusCode === 404 || err.statusCode === 410)) {
      delete state.devices[deviceId];
      saveState();
    }
    res.status(500).json({ ok: false, error: 'Não foi possível enviar o teste.' });
  }
});

app.post('/api/unsubscribe', (req, res) => {
  const { deviceId } = req.body || {};
  if (deviceId && state.devices[deviceId]) {
    delete state.devices[deviceId];
    saveState();
  }
  res.json({ ok: true });
});

async function sendPush(subscription, payload) {
  return webpush.sendNotification(subscription, JSON.stringify(payload), {
    TTL: 300,
    urgency: 'high'
  });
}

let loopBusy = false;
async function pushLoop() {
  if (loopBusy) return;
  loopBusy = true;
  let dirty = false;
  try {
    const now = Date.now();
    for (const [deviceId, device] of Object.entries(state.devices)) {
      if (!device.subscription || !Array.isArray(device.schedule)) continue;
      device.sent = device.sent || {};
      for (const event of device.schedule) {
        const id = String(event.id || '');
        const stamp = Number(event.stamp);
        if (!id || !Number.isFinite(stamp) || device.sent[id]) continue;
        // Envia no horário ou, se o servidor reiniciou, até 10 min depois.
        if (stamp <= now && stamp >= now - 10 * 60 * 1000) {
          try {
            await sendPush(device.subscription, {
              title: event.title || '💊 Hora do remédio',
              body: event.body || 'Confira o remédio deste horário.',
              tag: 'alessa-' + id,
              url: '/',
              requireInteraction: true
            });
            device.sent[id] = now;
            dirty = true;
          } catch (err) {
            if (err && (err.statusCode === 404 || err.statusCode === 410)) {
              delete state.devices[deviceId];
              dirty = true;
              break;
            }
          }
        }
      }
    }
  } finally {
    if (dirty) saveState();
    loopBusy = false;
  }
}

setInterval(pushLoop, 15000);
setTimeout(pushLoop, 3000);

const PUBLIC_FILES = new Set([
  'index.html', 'app.js', 'styles.css', 'sw.js', 'manifest.webmanifest',
  'icon.svg', 'icon-192.png', 'icon-512.png', 'herois-bacterias.png'
]);

app.get('/:file', (req, res, next) => {
  const file = req.params.file;
  if (!PUBLIC_FILES.has(file)) return next();
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, file));
});

app.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Remédios da Alessa v12 ouvindo na porta ${PORT}`);
});
