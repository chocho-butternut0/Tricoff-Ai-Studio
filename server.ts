/**
 * TRICOFF Coffee Kiosk — Server
 * Rev. 2 airpot version · fully offline
 *
 * Endpoints:
 *   POST   /api/orders              { drink }       → create order, return QR + slot
 *   GET    /pay/:orderId                            → phone payment page
 *   POST   /api/orders/:id/pay                      → customer tapped Pay → pour
 *   POST   /api/orders/:id/fail                     → customer tapped Fail → cancel
 *   POST   /api/orders/:id/done                     → ESP32 reports pour complete
 *   GET    /api/state                               → kiosk state snapshot
 *   POST   /api/kiosk/reset                         → reset kiosk (admin-only OR kiosk token)
 *   WS     /api/ws                                  → real-time push
 *
 * ESP32:
 *   POST   http://192.168.4.1/pour  { order, line, presses }
 *   GET    http://192.168.4.1/status
 */

import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CLI flag parser (e.g. tsx server.ts --port 3000)
function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}

// ─── Configuration ──────────────────────────────────────────────────
const LAPTOP_IP      = process.env.LAPTOP_IP      || '192.168.4.200';
const ESP32_IP       = process.env.ESP32_IP        || '192.168.4.1';
const PORT           = parseInt(getArg('--port') || process.env.PORT || '3000', 10);
const PRESS_PER_CUP  = parseInt(process.env.PRESS_PER_CUP || '8', 10);
const ESP32_MOCK     = process.env.ESP32_MOCK ? process.env.ESP32_MOCK === 'true' : true;
const STATUS_POLL_MS = 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'tricoff2025';

// Prevent unhandled errors from terminating the process
process.on('uncaughtException', (err) => {
  console.error('[process] Caught uncaughtException:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[process] Caught unhandledRejection:', reason);
});

// ─── Persistence ────────────────────────────────────────────────────
//
// Orders are written to orders.json next to server.ts so they survive
// server restarts. The file is a JSON object:
//   { counter: number, orders: Order[] }
//
const ORDERS_FILE = path.join(__dirname, 'orders.json');

interface PersistenceStore {
  counter: number;
  orders: Order[];
}

function loadStore(): PersistenceStore {
  try {
    const raw = fs.readFileSync(ORDERS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as PersistenceStore;
    if (Array.isArray(parsed.orders) && typeof parsed.counter === 'number') {
      return parsed;
    }
  } catch {
    // File missing or corrupt — start fresh
  }
  return { counter: 1041, orders: [] };
}

function saveStore() {
  try {
    const store: PersistenceStore = {
      counter: ticketCounter,
      orders: allOrdersStore,
    };
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('[persistence] Could not write orders.json:', err);
  }
}

// ─── Session store ──────────────────────────────────────────────────
const sessions = new Map<string, { createdAt: number }>();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 h

function createSession(): string {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { createdAt: Date.now() });
  return token;
}

function isValidSession(token: string | undefined): boolean {
  if (!token) return false;
  const s = sessions.get(token);
  if (!s) return false;
  if (Date.now() - s.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function getTokenFromRequest(req: express.Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/tricoff_admin=([^;]+)/);
  return match?.[1];
}

function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (isValidSession(getTokenFromRequest(req))) {
    next();
  } else {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
}

// ─── Kiosk reset token ─────────────────────────────────────────────
//
// A short-lived HMAC token lets the kiosk screen reset itself without
// needing an admin session. The kiosk never shows it to the customer;
// it's embedded in the POST body by the client-side resetKiosk().
//
const RESET_SECRET = crypto.randomBytes(32);

function makeResetToken(): string {
  const ts = Date.now().toString(16);
  const mac = crypto
    .createHmac('sha256', RESET_SECRET)
    .update(ts)
    .digest('hex')
    .slice(0, 16);
  return `${ts}.${mac}`;
}

function isValidResetToken(token: string | undefined): boolean {
  if (!token) return false;
  const [ts, mac] = token.split('.');
  if (!ts || !mac) return false;
  // Tokens expire after 5 minutes
  if (Date.now() - parseInt(ts, 16) > 5 * 60 * 1000) return false;
  const expected = crypto
    .createHmac('sha256', RESET_SECRET)
    .update(ts)
    .digest('hex')
    .slice(0, 16);
  return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}

// ─── Drink specs ────────────────────────────────────────────────────
export type DrinkId = 'regular' | 'sweetened' | 'decaf';

export interface DrinkSpec {
  id: DrinkId;
  name: string;
  shortLabel: string;
  slot: number;
  line: number;
  presses: number;
  price: number;
  description: string;
}

const DRINKS: Record<DrinkId, DrinkSpec> = {
  regular: {
    id: 'regular', name: 'Regular Roast', shortLabel: 'Regular',
    slot: 1, line: 1, presses: PRESS_PER_CUP, price: 45,
    description: 'Pure unsweetened highland Arabica blend',
  },
  sweetened: {
    id: 'sweetened', name: 'Sweetened Blend', shortLabel: 'Sweetened',
    slot: 2, line: 2, presses: PRESS_PER_CUP, price: 50,
    description: 'Balanced roast with raw muscovado cane',
  },
  decaf: {
    id: 'decaf', name: 'Swiss Water Decaf', shortLabel: 'Decaf',
    slot: 3, line: 3, presses: PRESS_PER_CUP, price: 55,
    description: '99.9% caffeine-free, isolated brew line',
  },
};

const VOLUME_ML = 200;

// ─── Order state ────────────────────────────────────────────────────
export type OrderStatus = 'created' | 'paid' | 'pouring' | 'done' | 'failed';

export interface Order {
  id: string;
  drink: DrinkId;
  drinkName: string;
  slot: number;
  line: number;
  presses: number;
  price: number;
  status: OrderStatus;
  createdAt: string;
  paidAt?: string;
  doneAt?: string;
  qrUrl: string;
}

// Restore from disk on startup
const _store = loadStore();
let ticketCounter: number = _store.counter;

// allOrdersStore = full history (persisted, unbounded)
const allOrdersStore: Order[] = _store.orders;

// In-memory lookup map (rebuilt from disk on boot)
const orders: Map<string, Order> = new Map(allOrdersStore.map((o) => [o.id, o]));

// activeOrderId: resume any 'created' or 'pouring' order that survived a restart
let activeOrderId: string | null =
  allOrdersStore.find((o) => o.status === 'created' || o.status === 'pouring')?.id ?? null;

// If an order survived restart, mark pouring as failed (ESP32 reset) and expire stale created orders
if (activeOrderId) {
  const surviving = orders.get(activeOrderId);
  if (surviving?.status === 'pouring') {
    surviving.status = 'failed';
    activeOrderId = null;
    saveStore();
  } else if (surviving?.status === 'created') {
    const createdTime = new Date(surviving.createdAt).getTime();
    if (isNaN(createdTime) || Date.now() - createdTime > 5 * 60 * 1000) {
      surviving.status = 'failed';
      activeOrderId = null;
      saveStore();
    }
  }
}

let machineOnline = false;

// esp32Busy: prevents sending a second pour while one is already in flight
let esp32Busy = false;

// Per-slot presses (admin-adjustable)
const slotPresses: Record<number, number> = { 1: PRESS_PER_CUP, 2: PRESS_PER_CUP, 3: PRESS_PER_CUP };

// ─── WebSocket ──────────────────────────────────────────────────────
let wss: WebSocketServer | null = null;

function getSnapshot() {
  // recentOrders: last 20 for kiosk display
  const recentOrders = allOrdersStore.slice(0, 20);
  return {
    machineOnline,
    esp32Mock: ESP32_MOCK,
    activeOrder: activeOrderId ? orders.get(activeOrderId) ?? null : null,
    recentOrders,
    allOrders: allOrdersStore,   // full list for admin
    drinks: DRINKS,
    volumeMl: VOLUME_ML,
    pressPerCup: PRESS_PER_CUP,
    slotPresses,
  };
}

function broadcast(type: string, payload: unknown = {}) {
  if (!wss) return;
  const message = JSON.stringify({
    type, payload,
    snapshot: getSnapshot(),
    serverTimestamp: new Date().toISOString(),
  });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

// ─── ESP32 communication ────────────────────────────────────────────

async function sendPourCommand(order: Order): Promise<boolean> {
  if (ESP32_MOCK) {
    console.log(`[MOCK ESP32] Pouring ${order.id}: line ${order.line}, ${order.presses} presses`);
    esp32Busy = true;
    const pourMs = 1000 + order.presses * 1000;
    setTimeout(async () => {
      esp32Busy = false;
      await markOrderDone(order.id);
    }, pourMs);
    return true;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`http://${ESP32_IP}/pour`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: order.id, line: order.line, presses: order.presses }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch (err) {
    console.error(`ESP32 pour command failed for ${order.id}:`, err);
    return false;
  }
}

async function pollEsp32Status() {
  if (ESP32_MOCK) { machineOnline = true; return; }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://${ESP32_IP}/status`, { signal: controller.signal });
    clearTimeout(timeout);
    const wasOnline = machineOnline;
    machineOnline = res.ok;
    if (wasOnline !== machineOnline) broadcast('machine:status', { online: machineOnline });
  } catch {
    if (machineOnline) { machineOnline = false; broadcast('machine:status', { online: false }); }
  }
}

// ─── Order helpers ──────────────────────────────────────────────────

function createOrder(drinkId: DrinkId, reqHost?: string): Order | null {
  const spec = DRINKS[drinkId];
  if (!spec) return null;

  const id = `TRC-${ticketCounter++}`;
  const host = process.env.LAPTOP_IP ? `${process.env.LAPTOP_IP}:${PORT}` : (reqHost || `${LAPTOP_IP}:${PORT}`);
  const isLocal = host.includes('localhost') || host.startsWith('192.168.') || host.startsWith('127.0.');
  const protocol = isLocal ? 'http' : 'https';
  const qrUrl = `${protocol}://${host}/pay/${id}`;

  const order: Order = {
    id,
    drink: spec.id,
    drinkName: spec.name,
    slot: spec.slot,
    line: spec.line,
    presses: slotPresses[spec.slot] ?? spec.presses,
    price: spec.price,
    status: 'created',
    createdAt: new Date().toISOString(),
    qrUrl,
  };

  orders.set(id, order);
  allOrdersStore.unshift(order);
  activeOrderId = id;
  saveStore();

  return order;
}

async function payOrder(orderId: string): Promise<Order | null> {
  const order = orders.get(orderId);
  if (!order) return null;

  // Idempotency: already pouring or done → no duplicate pour
  if (order.status === 'pouring' || order.status === 'done') return order;

  // Guard: reject if ESP32 is already busy with another pour
  if (esp32Busy) {
    console.warn(`[pay] ESP32 busy — rejecting duplicate pour request for ${orderId}`);
    return order;
  }

  order.status = 'paid';
  order.paidAt = new Date().toISOString();
  saveStore();
  broadcast('order:paid', { orderId: order.id });

  order.status = 'pouring';
  saveStore();
  broadcast('order:pouring', { orderId: order.id });

  const ok = await sendPourCommand(order);
  if (!ok && !ESP32_MOCK) {
    console.error(`Could not reach ESP32 for order ${orderId}`);
  }

  return order;
}

function failOrder(orderId: string): Order | null {
  const order = orders.get(orderId);
  if (!order) return null;
  order.status = 'failed';
  saveStore();
  broadcast('order:failed', { orderId: order.id });
  return order;
}

async function markOrderDone(orderId: string): Promise<Order | null> {
  const order = orders.get(orderId);
  if (!order) return null;
  order.status = 'done';
  order.doneAt = new Date().toISOString();
  saveStore();
  broadcast('order:done', { orderId: order.id });
  return order;
}

function resetKiosk() {
  activeOrderId = null;
  broadcast('kiosk:reset', {});
}

// ─── Payment page (self-contained HTML for customer's phone) ────────

function buildPaymentPage(order: Order): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TRICOFF — Simulated Payment</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#120F0D;color:#FBF9F5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem}
.card{max-width:380px;width:100%;background:#181412;border:1px solid #44403c;border-radius:1.25rem;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.head{padding:1.75rem 1.5rem 1.25rem;text-align:center;border-bottom:1px solid #292524}
.brand{font-size:1.875rem;font-weight:700;letter-spacing:-.03em}
.sub{font-size:.75rem;color:#a8a29e;margin-top:.3rem}
.body{padding:1.5rem}
.order{background:#1D1815;border:1px solid #292524;border-radius:.875rem;padding:1.25rem;margin-bottom:1.5rem}
.drink{font-size:1.375rem;font-weight:700;color:#FBF9F5}
.desc{font-size:.8rem;color:#a8a29e;margin-top:.2rem}
.slot-row{display:flex;align-items:center;gap:.75rem;margin-top:1rem;padding:.875rem;background:#120F0D;border-radius:.625rem}
.slot-num{font-size:2.25rem;font-weight:800;color:#f59e0b;line-height:1;min-width:2.5rem;text-align:center}
.slot-text{font-size:.875rem;color:#a8a29e}
.price{font-size:1.75rem;font-weight:700;color:#f59e0b;margin-top:.875rem;font-variant-numeric:tabular-nums}
.price-label{font-size:.75rem;color:#78716c;font-weight:500;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.2rem}
.btns{display:flex;flex-direction:column;gap:.75rem}
.btn{padding:1rem;border:none;border-radius:.875rem;font-size:1.05rem;font-weight:600;cursor:pointer;transition:transform .08s,opacity .15s;width:100%}
.btn:active{transform:scale(.97)}
.pay{background:#059669;color:#fff}
.fail{background:#292524;color:#a8a29e;border:1px solid #44403c}
.note{font-size:.72rem;color:#78716c;text-align:center;margin-top:1.25rem;line-height:1.6}
.result{padding:2.5rem 1.5rem;text-align:center;display:none}
.result.show{display:block}
.result .icon{font-size:2.5rem;margin-bottom:.75rem}
.result .title{font-size:1.375rem;font-weight:700;margin-bottom:.4rem}
.result .msg{font-size:.9rem;color:#a8a29e;line-height:1.5}
.result.success .title{color:#34d399}
.result.fail .title{color:#f87171}
</style>
</head>
<body>
<div class="card">
  <div class="head">
    <div class="brand">TRICOFF</div>
    <div class="sub">Self-Service Coffee Kiosk · Simulated Payment</div>
  </div>
  <div class="body" id="body">
    <div class="order">
      <div class="drink">${order.drinkName}</div>
      <div class="desc">${DRINKS[order.drink].description}</div>
      <div class="slot-row">
        <span class="slot-num">${order.slot}</span>
        <span class="slot-text">Place your cup in this slot</span>
      </div>
      <div class="price-label">Amount (simulated)</div>
      <div class="price">₱${order.price}.00</div>
    </div>
    <div class="btns">
      <button class="btn pay" onclick="doPay()">Pay</button>
      <button class="btn fail" onclick="doFail()">Fail</button>
    </div>
    <p class="note">This is a simulated payment — no real money changes hands.<br>Tap Pay to tell the kiosk to pour your coffee. Tap Fail to cancel.</p>
  </div>
  <div class="result" id="result"></div>
</div>
<script>
var orderId = ${JSON.stringify(order.id)};
function doPay(){
  document.getElementById('body').style.display='none';
  var r=document.getElementById('result');
  r.className='result show success';
  r.innerHTML='<div class="icon">✓</div><div class="title">Payment successful</div><div class="msg">Your coffee is being poured.<br>Please wait at the kiosk — slot ${order.slot}.</div>';
  fetch('/api/orders/'+orderId+'/pay',{method:'POST'}).catch(function(){});
}
function doFail(){
  document.getElementById('body').style.display='none';
  var r=document.getElementById('result');
  r.className='result show fail';
  r.innerHTML='<div class="icon">✕</div><div class="title">Payment failed</div><div class="msg">No coffee will be poured.<br>You can start a new order at the kiosk.</div>';
  fetch('/api/orders/'+orderId+'/fail',{method:'POST'}).catch(function(){});
}
</script>
</body>
</html>`;
}

function buildNotFoundPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TRICOFF — Order Not Found</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#120F0D;color:#FBF9F5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem}
.card{max-width:340px;text-align:center}
h1{font-size:1.5rem;font-weight:700;margin-bottom:.5rem}
p{color:#a8a29e;font-size:.9rem;line-height:1.5}
</style>
</head>
<body><div class="card"><h1>Order not found</h1><p>This order may have expired or the server restarted. Please start a new order at the kiosk screen.</p></div></body>
</html>`;
}

// ─── Server ────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  app.use(express.json());

  const server = http.createServer(app);

  // WebSocket at /api/ws
  wss = new WebSocketServer({ server, path: '/api/ws' });
  wss.on('error', (err) => {
    console.error('[ws] WebSocketServer error:', err.message);
  });

  wss.on('connection', (ws) => {
    ws.on('error', (err) => {
      console.warn('[ws] Client socket error:', err.message);
    });

    // Send full snapshot on connect
    ws.send(JSON.stringify({
      type: 'sync:init',
      payload: { message: 'Connected to TRICOFF kiosk broker' },
      snapshot: getSnapshot(),
      serverTimestamp: new Date().toISOString(),
    }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { action: string; data?: Record<string, unknown> };
        switch (msg.action) {
          case 'sync:request':
            ws.send(JSON.stringify({
              type: 'sync:init', payload: {},
              snapshot: getSnapshot(), serverTimestamp: new Date().toISOString(),
            }));
            break;
          case 'kiosk:reset':
            // WS-based reset (fallback path, same guard as REST)
            if (isValidResetToken(msg.data?.resetToken as string) || isValidSession(msg.data?.adminToken as string)) {
              resetKiosk();
            }
            break;
        }
      } catch { /* ignore malformed */ }
    });
  });

  // ── REST API ──────────────────────────────────────────────────

  // 1. Issue a reset token so the kiosk screen can reset itself
  //    (called by useTricoffBroker on page load, token is short-lived)
  app.get('/api/kiosk/reset-token', (_req, res) => {
    res.json({ ok: true, resetToken: makeResetToken() });
  });

  // 2. Create an order
  app.post('/api/orders', (req, res) => {
    const { drink } = req.body as { drink?: DrinkId };
    if (!drink || !DRINKS[drink]) {
      res.status(400).json({ ok: false, error: 'Invalid drink.' });
      return;
    }
    if (!machineOnline && !ESP32_MOCK) {
      res.status(503).json({ ok: false, error: 'Machine offline.' });
      return;
    }
    const order = createOrder(drink, req.get('host'));
    if (!order) { res.status(500).json({ ok: false, error: 'Could not create order.' }); return; }
    broadcast('order:created', { orderId: order.id });
    res.json({ ok: true, order, snapshot: getSnapshot() });
  });

  // 3. Payment page — phone opens after scanning QR
  app.get('/pay/:orderId', (req, res) => {
    const order = orders.get(req.params.orderId);
    if (!order) { res.status(404).type('html').send(buildNotFoundPage()); return; }
    res.type('html').send(buildPaymentPage(order));
  });

  // 4. Customer tapped Pay
  app.post('/api/orders/:id/pay', async (req, res) => {
    const order = await payOrder(req.params.id);
    if (!order) { res.status(404).json({ ok: false, error: 'Order not found.' }); return; }
    res.json({ ok: true, order, snapshot: getSnapshot() });
  });

  // 5. Customer tapped Fail
  app.post('/api/orders/:id/fail', (req, res) => {
    const order = failOrder(req.params.id);
    if (!order) { res.status(404).json({ ok: false, error: 'Order not found.' }); return; }
    res.json({ ok: true, order, snapshot: getSnapshot() });
  });

  // 6. ESP32 reports pour complete
  app.post('/api/orders/:id/done', async (req, res) => {
    const order = await markOrderDone(req.params.id);
    if (!order) { res.status(404).json({ ok: false, error: 'Order not found.' }); return; }
    res.json({ ok: true, order, snapshot: getSnapshot() });
  });

  // 7. Full state snapshot
  app.get('/api/state', (_req, res) => {
    res.json({ ok: true, ...getSnapshot() });
  });

  // 8. Reset kiosk — requires valid admin session OR valid kiosk reset token
  app.post('/api/kiosk/reset', (req, res) => {
    const { resetToken } = req.body as { resetToken?: string };
    const adminAuthed = isValidSession(getTokenFromRequest(req));
    const kioskAuthed = isValidResetToken(resetToken);

    if (!adminAuthed && !kioskAuthed) {
      res.status(401).json({ ok: false, error: 'Unauthorized reset.' });
      return;
    }

    resetKiosk();
    res.json({ ok: true, ...getSnapshot() });
  });

  // ── Admin auth ────────────────────────────────────────────────

  // 9. Login
  app.post('/api/admin/login', (req, res) => {
    const { password } = req.body as { password?: string };
    if (password === ADMIN_PASSWORD) {
      const token = createSession();
      res.setHeader('Set-Cookie',
        `tricoff_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`);
      res.json({ ok: true, token });
    } else {
      res.status(401).json({ ok: false, error: 'Incorrect password.' });
    }
  });

  // 10. Logout
  app.post('/api/admin/logout', (req, res) => {
    const token = getTokenFromRequest(req);
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', 'tricoff_admin=; Path=/; Max-Age=0');
    res.json({ ok: true });
  });

  // 11. Check session validity
  app.get('/api/admin/check', (req, res) => {
    res.json({ ok: isValidSession(getTokenFromRequest(req)) });
  });

  // ── Admin data (protected) ────────────────────────────────────

  // 12. Admin state (full history + stats)
  app.get('/api/admin/state', requireAdmin, (_req, res) => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayTs = todayStart.getTime();
    const todayOrders = allOrdersStore.filter(
      (o) => new Date(o.createdAt).getTime() >= todayTs
    );
    const doneToday = todayOrders.filter((o) => o.status === 'done');
    res.json({
      ok: true,
      ...getSnapshot(),
      stats: {
        ordersToday: todayOrders.length,
        revenueToday: doneToday.reduce((s, o) => s + o.price, 0),
        totalOrders: allOrdersStore.length,
        successfulPours: allOrdersStore.filter((o) => o.status === 'done').length,
      },
    });
  });

  // 13. Update presses per slot
  app.patch('/api/admin/slots/:slot/presses', requireAdmin, (req, res) => {
    const slot = parseInt(req.params.slot, 10);
    const { presses } = req.body as { presses?: number };
    if (![1, 2, 3].includes(slot) || !presses || presses < 1 || presses > 30) {
      res.status(400).json({ ok: false, error: 'Slot must be 1-3, presses 1-30.' });
      return;
    }
    slotPresses[slot] = presses;
    broadcast('admin:presses_updated', { slot, presses });
    res.json({ ok: true, slot, presses, slotPresses });
  });

  // 14. Test press one slot
  app.post('/api/admin/slots/:slot/test', requireAdmin, async (req, res) => {
    const slot = parseInt(req.params.slot, 10);
    if (![1, 2, 3].includes(slot)) {
      res.status(400).json({ ok: false, error: 'Slot must be 1-3.' });
      return;
    }
    const drink = Object.values(DRINKS).find((d) => d.slot === slot);
    if (!drink) { res.status(400).json({ ok: false, error: 'No drink for that slot.' }); return; }

    if (ESP32_MOCK) {
      console.log(`[MOCK ESP32] Test press: slot ${slot} (line ${drink.line})`);
      broadcast('admin:test_press', { slot, mock: true });
      res.json({ ok: true, slot, mock: true });
      return;
    }
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`http://${ESP32_IP}/pour`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: 'TEST', line: drink.line, presses: 1 }),
        signal: controller.signal,
      });
      clearTimeout(to);
      broadcast('admin:test_press', { slot, ok: response.ok });
      res.json({ ok: response.ok, slot });
    } catch {
      res.status(503).json({ ok: false, error: 'ESP32 unreachable.' });
    }
  });

  // 15. Export all orders as CSV (uses full allOrdersStore, not 20-item cap)
  app.get('/api/admin/orders/export', requireAdmin, (_req, res) => {
    const header = 'Order ID,Drink,Slot,Price,Status,Created At,Paid At,Done At\n';
    const rows = allOrdersStore
      .map((o) =>
        [o.id, o.drinkName, o.slot, o.price, o.status, o.createdAt, o.paidAt ?? '', o.doneAt ?? ''].join(',')
      )
      .join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="tricoff-orders.csv"');
    res.send(header + rows);
  });

  // ── Vite (dev) / static (prod) ────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[server] Port ${PORT} already in use. Retrying or waiting for release.`);
    } else {
      console.error('[server] HTTP server error:', err.message);
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`TRICOFF kiosk server on http://0.0.0.0:${PORT}`);
    console.log(`  Laptop IP  : ${LAPTOP_IP} (QR codes point here)`);
    console.log(`  ESP32 IP   : ${ESP32_IP} ${ESP32_MOCK ? '(MOCK MODE)' : ''}`);
    console.log(`  Pour spec  : ${PRESS_PER_CUP} presses → ~${VOLUME_ML} ml`);
    console.log(`  Orders DB  : ${ORDERS_FILE}`);
    console.log(`  History    : ${allOrdersStore.length} orders loaded from disk`);
  });

  setInterval(pollEsp32Status, STATUS_POLL_MS);
  pollEsp32Status();
}

startServer();
