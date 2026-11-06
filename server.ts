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
 *   POST   http://192.168.4.1/pour  { order, line, seconds }
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
const POUR_SECONDS    = parseInt(process.env.POUR_SECONDS || '6', 10);
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
  pourSeconds: number;
  price: number;
  description: string;
  image: string;
  badgeNote: string;
  tags: string[];
}

const DRINKS: Record<DrinkId, DrinkSpec> = {
  regular: {
    id: 'regular', name: 'Regular Roast', shortLabel: 'Regular',
    slot: 1, line: 1, pourSeconds: POUR_SECONDS, price: 45,
    description: 'Pure unsweetened highland Benguet Arabica extracted at 9 bars',
    image: '/assets/images/regular-coffee.png',
    badgeNote: 'Benguet Harvest · 88°C Hot',
    tags: ['Benguet Arabica', 'Zero Sugar', '9-Bar Extract', '240 ml'],
  },
  sweetened: {
    id: 'sweetened', name: 'Sweetened Blend', shortLabel: 'Sweetened',
    slot: 2, line: 2, pourSeconds: POUR_SECONDS, price: 50,
    description: 'Balanced roast blended with warm Negros Occidental muscovado cane',
    image: '/assets/images/sweetened-coffee.png',
    badgeNote: 'Raw Muscovado Infusion · 87°C',
    tags: ['Double Shot', 'Raw Muscovado', 'Caramel Crema', '240 ml'],
  },
  decaf: {
    id: 'decaf', name: 'Swiss Water Decaf', shortLabel: 'Decaf',
    slot: 3, line: 3, pourSeconds: POUR_SECONDS, price: 55,
    description: '99.9% caffeine-free single-origin Swiss Water osmosis roast',
    image: '/assets/images/decaf-coffee.png',
    badgeNote: 'Pure Osmosis Decaf · 88°C Hot',
    tags: ['Swiss Water', '99.9% Decaf', 'Low Acid', '240 ml'],
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
  pourSeconds: number;
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

// Per-slot pour duration in seconds (admin-adjustable)
const slotSeconds: Record<number, number> = { 1: POUR_SECONDS, 2: POUR_SECONDS, 3: POUR_SECONDS };

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
    pourSeconds: POUR_SECONDS,
    slotSeconds,
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
    console.log(`[MOCK ESP32] Pouring ${order.id}: line ${order.line}, ${order.pourSeconds}s`);
    esp32Busy = true;
    const pourMs = order.pourSeconds * 1000;
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
      body: JSON.stringify({ order: order.id, line: order.line, seconds: order.pourSeconds }),
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
    pourSeconds: slotSeconds[spec.slot] ?? spec.pourSeconds,
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
  if (activeOrderId === orderId) {
    activeOrderId = null;
  }
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
  const drink = DRINKS[order.drink] || {
    id: order.drink,
    name: order.drinkName,
    shortLabel: 'Coffee',
    slot: order.slot,
    line: order.line,
    pourSeconds: order.pourSeconds,
    price: order.price,
    description: 'Freshly extracted highland craft coffee.',
    image: '/assets/images/regular-coffee.png',
    badgeNote: 'Benguet Harvest · 88°C Hot',
    tags: ['Highland Arabica', '240 ml Cup', 'Hot Extraction'],
  };

  const tagsHtml = (drink.tags || ['Highland Harvest', '240 ml Cup'])
    .map((tag) => `<span class="pill">${tag}</span>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>TRICOFF — Confirm Order</title>
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --dk:   #2C1A0E;
    --md:   #5C3D1E;
    --lt:   #A07850;
    --cream:#FAF6F0;
    --card: #FFFFFF;
    --border: #E8DCC8;
    --green: #1A7F5A;
    --green-bg: #EDFAF4;
    --red:   #C0392B;
    --red-bg:#FEF2F2;
  }

  html, body {
    height: 100%;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: var(--cream);
    color: var(--dk);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1.25rem 1rem 3rem;
    -webkit-font-smoothing: antialiased;
  }

  .page {
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0;
  }
  .secure-badge {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--md);
    background: #F0E8DC;
    border: 1px solid var(--border);
    padding: 0.3rem 0.7rem;
    border-radius: 999px;
  }

  /* ── Hero Card ── */
  .hero-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 28px;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(44,26,14,0.08);
  }

  .hero-img-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    background: #EDE0CC;
    overflow: hidden;
  }
  .hero-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .hero-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(44,26,14,0.72) 0%, rgba(44,26,14,0.1) 55%, transparent 100%);
  }
  .hero-bottom {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 1.25rem 1.25rem 1rem;
    color: #fff;
  }
  .hero-name {
    font-size: 1.6rem;
    font-weight: 900;
    letter-spacing: -0.02em;
    line-height: 1.1;
    margin-bottom: 0.3rem;
  }
  .hero-subtitle {
    font-size: 0.75rem;
    font-weight: 500;
    opacity: 0.82;
  }
  .hero-price-badge {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: rgba(255,255,255,0.96);
    color: var(--dk);
    font-size: 1.3rem;
    font-weight: 900;
    padding: 0.35rem 0.9rem;
    border-radius: 14px;
    border: 1px solid rgba(232,220,200,0.6);
    box-shadow: 0 2px 10px rgba(0,0,0,0.08);
  }
  .hero-slot-badge {
    position: absolute;
    top: 1rem;
    left: 1rem;
    background: rgba(255,255,255,0.96);
    color: var(--dk);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    padding: 0.3rem 0.7rem;
    border-radius: 999px;
    border: 1px solid rgba(232,220,200,0.6);
  }

  .hero-body {
    padding: 1rem 1.25rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .hero-desc {
    font-size: 0.8rem;
    color: var(--md);
    line-height: 1.55;
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .pill {
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--md);
    background: #F5EDE0;
    border: 1px solid var(--border);
    padding: 0.25rem 0.65rem;
    border-radius: 999px;
  }

  /* ── Order Summary Strip ── */
  .summary-strip {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 1rem 1.15rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
  }
  .summary-label {
    color: var(--lt);
    font-weight: 500;
  }
  .summary-value {
    font-weight: 700;
    color: var(--dk);
    font-family: ui-monospace, "SF Mono", monospace;
    font-size: 0.78rem;
  }
  .summary-divider {
    height: 1px;
    background: var(--border);
    margin: 0.1rem 0;
  }
  .summary-total-label {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--dk);
  }
  .summary-total-value {
    font-size: 1.1rem;
    font-weight: 900;
    color: var(--dk);
  }

  /* ── Slot Instruction ── */
  .slot-instruction {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    background: #F5EDE0;
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 0.9rem 1rem;
  }
  .slot-num {
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 12px;
    background: var(--dk);
    color: #fff;
    font-size: 1.1rem;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .slot-text {
    font-size: 0.78rem;
    color: var(--md);
    line-height: 1.5;
  }
  .slot-text strong {
    color: var(--dk);
    font-weight: 800;
  }

  /* ── Buttons ── */
  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .btn {
    width: 100%;
    padding: 1rem;
    border-radius: 16px;
    font-size: 0.95rem;
    font-weight: 800;
    cursor: pointer;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    transition: opacity 0.15s, transform 0.1s;
    letter-spacing: 0.01em;
  }
  .btn:active { transform: scale(0.98); }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .btn-confirm {
    background: var(--dk);
    color: #fff;
    box-shadow: 0 6px 20px rgba(44,26,14,0.22);
    font-size: 1rem;
    padding: 1.1rem;
    border-radius: 18px;
  }
  .btn-confirm:not(:disabled):hover { opacity: 0.88; }

  .btn-cancel {
    background: transparent;
    color: var(--lt);
    font-size: 0.85rem;
    font-weight: 600;
    padding: 0.7rem;
  }
  .btn-cancel:hover { color: var(--red); }

  /* ── Spinner ── */
  .spinner {
    width: 1.1rem;
    height: 1.1rem;
    border: 2.5px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Result screens ── */
  .result-screen {
    display: none;
    flex-direction: column;
    align-items: center;
    text-align: center;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 28px;
    padding: 2.5rem 1.5rem 2rem;
    box-shadow: 0 8px 32px rgba(44,26,14,0.08);
    gap: 0;
  }
  .result-screen.show { display: flex; }

  .result-icon {
    width: 5rem;
    height: 5rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 1.25rem;
  }
  .result-icon.ok  { background: var(--green-bg); color: var(--green); border: 2px solid #A7F3D0; }
  .result-icon.err { background: var(--red-bg);   color: var(--red);   border: 2px solid #FECACA; }

  .result-title {
    font-size: 1.5rem;
    font-weight: 900;
    letter-spacing: -0.02em;
    margin-bottom: 0.5rem;
  }
  .result-sub {
    font-size: 0.82rem;
    color: var(--md);
    line-height: 1.55;
    margin-bottom: 1.5rem;
    max-width: 280px;
  }
  .receipt {
    width: 100%;
    background: var(--cream);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 0.9rem 1rem;
    text-align: left;
    font-size: 0.78rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    margin-bottom: 1.25rem;
  }
  .receipt-row {
    display: flex;
    justify-content: space-between;
  }
  .receipt-key   { color: var(--lt); }
  .receipt-val   { font-weight: 700; color: var(--dk); font-family: ui-monospace, monospace; }
  .receipt-val.hi { color: var(--lt); }

  .pour-anim {
    margin-bottom: 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  .pour-dots {
    display: flex;
    gap: 0.4rem;
  }
  .pour-dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: var(--lt);
    animation: bounce 1s ease-in-out infinite;
  }
  .pour-dot:nth-child(2) { animation-delay: 0.15s; }
  .pour-dot:nth-child(3) { animation-delay: 0.3s; }
  @keyframes bounce {
    0%,80%,100% { transform: scale(0.7); opacity: 0.4; }
    40%         { transform: scale(1.2); opacity: 1; }
  }
  .pour-label {
    font-size: 0.75rem;
    color: var(--lt);
    font-weight: 600;
    letter-spacing: 0.03em;
  }

  /* ── Footer ── */
  .footer-note {
    font-size: 0.68rem;
    color: var(--lt);
    text-align: center;
    padding-top: 0.25rem;
    opacity: 0.8;
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <header class="header">
    <img src="/assets/images/tricoff_logo.svg" alt="TRICOFF" style="height:2rem;">
    <div class="secure-badge">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      QRPh · InstaPay
    </div>
  </header>

  <!-- Order form -->
  <div id="orderView" style="display:flex;flex-direction:column;gap:1rem;">

    <!-- Hero card -->
    <div class="hero-card">
      <div class="hero-img-wrap">
        <img src="${drink.image}" alt="${order.drinkName}" class="hero-img">
        <div class="hero-overlay"></div>
        <div class="hero-price-badge">₱${order.price}.00</div>
        <div class="hero-slot-badge">SLOT ${order.slot}</div>
        <div class="hero-bottom">
          <div class="hero-name">${order.drinkName}</div>
          <div class="hero-subtitle">${drink.badgeNote || ''}</div>
        </div>
      </div>
      <div class="hero-body">
        <p class="hero-desc">${drink.description}</p>
        <div class="pills">${tagsHtml}</div>
      </div>
    </div>

    <!-- Order summary -->
    <div class="summary-strip">
      <div class="summary-row">
        <span class="summary-label">Order ID</span>
        <span class="summary-value">${order.id}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Item</span>
        <span class="summary-value">${order.drinkName}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Volume</span>
        <span class="summary-value">240 ml</span>
      </div>
      <div class="summary-divider"></div>
      <div class="summary-row">
        <span class="summary-total-label">Total</span>
        <span class="summary-total-value">₱${order.price}.00</span>
      </div>
    </div>

    <!-- Slot instruction -->
    <div class="slot-instruction">
      <div class="slot-num">${order.slot}</div>
      <div class="slot-text">
        Place your cup under <strong>Slot ${order.slot}</strong> on the kiosk before confirming. The dispenser activates immediately after payment.
      </div>
    </div>

    <!-- CTA -->
    <div class="actions">
      <button class="btn btn-confirm" id="payBtn" onclick="confirmPayment()">
        Confirm &amp; Pay ₱${order.price}.00
      </button>
      <button class="btn btn-cancel" onclick="cancelOrder()">
        Cancel order
      </button>
    </div>

  </div>

  <!-- Success screen -->
  <div class="result-screen" id="successView">
    <div class="result-icon ok">
      <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <div class="result-title">Order Confirmed</div>
    <p class="result-sub">Your payment went through. Coffee is on its way — stand by at the kiosk.</p>

    <div class="pour-anim">
      <div class="pour-dots">
        <div class="pour-dot"></div>
        <div class="pour-dot"></div>
        <div class="pour-dot"></div>
      </div>
      <div class="pour-label">Dispensing now…</div>
    </div>

    <div class="receipt">
      <div class="receipt-row">
        <span class="receipt-key">Order</span>
        <span class="receipt-val">${order.id}</span>
      </div>
      <div class="receipt-row">
        <span class="receipt-key">Item</span>
        <span class="receipt-val">${order.drinkName}</span>
      </div>
      <div class="receipt-row">
        <span class="receipt-key">Slot</span>
        <span class="receipt-val hi">Slot ${order.slot}</span>
      </div>
      <div class="receipt-row">
        <span class="receipt-key">Amount</span>
        <span class="receipt-val">₱${order.price}.00</span>
      </div>
    </div>

    <p style="font-size:0.75rem;color:var(--lt);line-height:1.5;">
      Cup fills to ~240 ml. Please wait at the machine.
    </p>
  </div>

  <!-- Cancelled screen -->
  <div class="result-screen" id="cancelView">
    <div class="result-icon err">
      <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </div>
    <div class="result-title" style="color:var(--red)">Order Cancelled</div>
    <p class="result-sub">
      Order ${order.id} has been cancelled. No charge was made.
    </p>
    <p style="font-size:0.75rem;color:var(--lt);">Start a new order at the TRICOFF kiosk.</p>
  </div>

  <p class="footer-note">Powered by TRICOFF · QRPh &amp; InstaPay ready</p>

</div>

<script>
var orderId = ${JSON.stringify(order.id)};

function confirmPayment() {
  var btn = document.getElementById('payBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div><span>Processing…</span>';

  fetch('/api/orders/' + orderId + '/pay', { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function() { showSuccess(); })
    .catch(function() { showSuccess(); }); // still show success — server-side is authoritative
}

function cancelOrder() {
  fetch('/api/orders/' + orderId + '/fail', { method: 'POST' })
    .finally(function() {
      document.getElementById('orderView').style.display = 'none';
      document.getElementById('cancelView').classList.add('show');
    });
}

function showSuccess() {
  document.getElementById('orderView').style.display = 'none';
  document.getElementById('successView').classList.add('show');
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
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>TRICOFF — Order Expired</title>
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --background: #FFFFFF;
    --coffee-dark: #442713;
    --coffee-caramel: #A5754A;
    --coffee-medium: #B18A61;
    --coffee-brown: #644B37;
    --border-color: #E8DEC8;
    --bg-page: #FAF7F2;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg-page);
    color: var(--coffee-dark);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    text-align: center;
  }
  .card {
    background: #FFFFFF;
    border: 1px solid var(--border-color);
    border-radius: 32px;
    padding: 2.5rem 1.75rem;
    max-width: 380px;
    box-shadow: 0 10px 30px rgba(68,39,19,0.06);
  }
  .icon {
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 50%;
    background: #F6F1EA;
    color: var(--coffee-caramel);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1.25rem;
  }
  h1 { font-size: 1.35rem; font-weight: 800; margin-bottom: 0.5rem; color: var(--coffee-dark); }
  p { font-size: 0.85rem; color: var(--coffee-brown); line-height: 1.5; }
</style>
</head>
<body>
<div class="card">
  <div class="icon">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
  </div>
  <h1>Ticket Expired</h1>
  <p>This payment session has concluded or timed out. Please initiate a new order on the TRICOFF kiosk touchscreen.</p>
</div>
</body>
</html>`;
}

// ─── Server ────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
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

  // 13. Update pour duration per slot (seconds)
  app.patch('/api/admin/slots/:slot/seconds', requireAdmin, (req, res) => {
    const slot = parseInt(req.params.slot, 10);
    const { seconds } = req.body as { seconds?: number };
    if (![1, 2, 3].includes(slot) || !seconds || seconds < 1 || seconds > 60) {
      res.status(400).json({ ok: false, error: 'Slot must be 1-3, seconds 1-60.' });
      return;
    }
    slotSeconds[slot] = seconds;
    broadcast('admin:seconds_updated', { slot, seconds });
    res.json({ ok: true, slot, seconds, slotSeconds });
  });

  // 14. Test pour one slot (1 second burst)
  app.post('/api/admin/slots/:slot/test', requireAdmin, async (req, res) => {
    const slot = parseInt(req.params.slot, 10);
    if (![1, 2, 3].includes(slot)) {
      res.status(400).json({ ok: false, error: 'Slot must be 1-3.' });
      return;
    }
    const drink = Object.values(DRINKS).find((d) => d.slot === slot);
    if (!drink) { res.status(400).json({ ok: false, error: 'No drink for that slot.' }); return; }

    if (ESP32_MOCK) {
      console.log(`[MOCK ESP32] Test pour: slot ${slot} (line ${drink.line}, 1s)`);
      broadcast('admin:test_pour', { slot, mock: true });
      res.json({ ok: true, slot, mock: true });
      return;
    }
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`http://${ESP32_IP}/pour`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: 'TEST', line: drink.line, seconds: 1 }),
        signal: controller.signal,
      });
      clearTimeout(to);
      broadcast('admin:test_pour', { slot, ok: response.ok });
      res.json({ ok: response.ok, slot });
    } catch {
      res.status(503).json({ ok: false, error: 'ESP32 unreachable.' });
    }
  });

  // 15. Export all orders as styled HTML report
  app.get('/api/admin/orders/export', requireAdmin, (_req, res) => {
    const now = new Date();
    const exportDate = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const exportTime = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

    const totalOrders = allOrdersStore.length;
    const completedOrders = allOrdersStore.filter(o => o.status === 'done').length;
    const totalRevenue = allOrdersStore.filter(o => o.status === 'done').reduce((sum, o) => sum + (o.price ?? 0), 0);
    const failedOrders = allOrdersStore.filter(o => o.status === 'failed').length;

    const statusColor: Record<string, string> = {
      done:     '#2d6a4f',
      paid:     '#1d4ed8',
      pouring:  '#92400e',
      created:  '#6b7280',
      failed:   '#991b1b',
    };
    const statusBg: Record<string, string> = {
      done:     '#d1fae5',
      paid:     '#dbeafe',
      pouring:  '#fef3c7',
      created:  '#f3f4f6',
      failed:   '#fee2e2',
    };

    const escape = (s: string | number | undefined) =>
      String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const formatDt = (iso: string | undefined) => {
      if (!iso) return '<span style="color:#aaa">—</span>';
      const d = new Date(iso);
      return `${d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} ${d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}`;
    };

    const rows = allOrdersStore.map((o, i) => {
      const st = o.status ?? 'created';
      return `
        <tr style="background:${i % 2 === 0 ? '#faf7f2' : '#ffffff'}">
          <td style="padding:10px 14px;color:#888;font-size:11px;font-family:monospace">${escape(o.id).slice(0, 8)}…</td>
          <td style="padding:10px 14px;font-weight:600;color:#442713">${escape(o.drinkName)}</td>
          <td style="padding:10px 14px;text-align:center;color:#644B37">Slot ${escape(o.slot)}</td>
          <td style="padding:10px 14px;text-align:right;font-weight:700;color:#442713;font-family:monospace">₱${escape(o.price)}.00</td>
          <td style="padding:10px 14px;text-align:center">
            <span style="background:${statusBg[st] ?? '#f3f4f6'};color:${statusColor[st] ?? '#374151'};padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;text-transform:capitalize">${escape(st)}</span>
          </td>
          <td style="padding:10px 14px;font-size:12px;color:#6b7280">${formatDt(o.createdAt)}</td>
          <td style="padding:10px 14px;font-size:12px;color:#6b7280">${formatDt(o.paidAt)}</td>
          <td style="padding:10px 14px;font-size:12px;color:#6b7280">${formatDt(o.doneAt)}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TriCoff Order Report — ${exportDate}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f0e8; color: #442713; padding: 32px 24px; }
    .page { max-width: 1100px; margin: 0 auto; }

    /* Header */
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-dot { width: 44px; height: 44px; background: #442713; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
    .brand-dot span { color: #faf7f2; font-weight: 800; font-size: 18px; letter-spacing: -1px; }
    .brand-title { font-size: 22px; font-weight: 800; color: #442713; letter-spacing: -0.5px; }
    .brand-sub { font-size: 12px; color: #a5754a; margin-top: 2px; }
    .export-meta { text-align: right; font-size: 12px; color: #a5754a; line-height: 1.6; }

    /* Summary cards */
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 28px; }
    .stat-card { background: #fff; border-radius: 16px; padding: 18px 20px; border: 1px solid #ede5d8; }
    .stat-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #a5754a; margin-bottom: 6px; }
    .stat-value { font-size: 28px; font-weight: 800; color: #442713; letter-spacing: -1px; }
    .stat-value.green { color: #2d6a4f; }
    .stat-value.red { color: #991b1b; }

    /* Table */
    .table-wrap { background: #fff; border-radius: 20px; overflow: hidden; border: 1px solid #ede5d8; box-shadow: 0 4px 20px rgba(68,39,19,0.06); }
    .table-header-bar { padding: 18px 20px; border-bottom: 1px solid #ede5d8; display: flex; align-items: center; justify-content: space-between; }
    .table-header-bar h2 { font-size: 15px; font-weight: 700; color: #442713; }
    .table-header-bar span { font-size: 12px; color: #a5754a; }
    table { width: 100%; border-collapse: collapse; }
    thead th { padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #a5754a; background: #faf7f2; border-bottom: 1px solid #ede5d8; }
    thead th:nth-child(3), thead th:nth-child(4), thead th:nth-child(5) { text-align: center; }
    thead th:nth-child(4) { text-align: right; }
    tbody tr:last-child td { border-bottom: none; }
    tbody td { border-bottom: 1px solid #f0ebe3; }

    /* Footer */
    .footer { text-align: center; margin-top: 24px; font-size: 11px; color: #b8a090; }

    @media print {
      body { background: white; padding: 16px; }
      .stat-card, .table-wrap { box-shadow: none; border: 1px solid #ddd; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="brand">
        <div class="brand-dot"><span>TC</span></div>
        <div>
          <div class="brand-title">TriCoff</div>
          <div class="brand-sub">Order History Report</div>
        </div>
      </div>
      <div class="export-meta">
        <div><strong>Exported on</strong> ${exportDate}</div>
        <div>at ${exportTime}</div>
      </div>
    </div>

    <div class="stats">
      <div class="stat-card">
        <div class="stat-label">Total Orders</div>
        <div class="stat-value">${totalOrders}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Completed</div>
        <div class="stat-value green">${completedOrders}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Revenue</div>
        <div class="stat-value">₱${totalRevenue}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Failed</div>
        <div class="stat-value red">${failedOrders}</div>
      </div>
    </div>

    <div class="table-wrap">
      <div class="table-header-bar">
        <h2>All Orders</h2>
        <span>${totalOrders} record${totalOrders !== 1 ? 's' : ''}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Drink</th>
            <th>Slot</th>
            <th>Price</th>
            <th>Status</th>
            <th>Created</th>
            <th>Paid</th>
            <th>Done</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>

    <div class="footer">Generated by TriCoff Kiosk · ${exportDate} · ${totalOrders} orders</div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tricoff-report-${now.toISOString().slice(0,10)}.html"`);
    res.send(html);
  });

  // 16. Export all orders as plain CSV
  app.get('/api/admin/orders/export/csv', requireAdmin, (_req, res) => {
    const header = 'Order ID,Drink,Slot,Price,Status,Created At,Paid At,Done At\n';
    const rows = allOrdersStore
      .map((o) =>
        [o.id, o.drinkName, o.slot, o.price, o.status, o.createdAt, o.paidAt ?? '', o.doneAt ?? ''].join(',')
      )
      .join('\n');
    const now = new Date();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="tricoff-orders-${now.toISOString().slice(0,10)}.csv"`);
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
    console.log(`  Pour spec  : ${POUR_SECONDS}s open → ~${VOLUME_ML} ml`);
    console.log(`  Orders DB  : ${ORDERS_FILE}`);
    console.log(`  History    : ${allOrdersStore.length} orders loaded from disk`);
  });

  setInterval(pollEsp32Status, STATUS_POLL_MS);
  pollEsp32Status();
}

startServer();
