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
  image: string;
  badgeNote: string;
  tags: string[];
}

const DRINKS: Record<DrinkId, DrinkSpec> = {
  regular: {
    id: 'regular', name: 'Regular Roast', shortLabel: 'Regular',
    slot: 1, line: 1, presses: PRESS_PER_CUP, price: 45,
    description: 'Pure unsweetened highland Benguet Arabica extracted at 9 bars',
    image: '/src/assets/images/tricoff_regular_cup_1793250304524.jpg',
    badgeNote: 'Benguet Harvest · 88°C Hot',
    tags: ['Benguet Arabica', 'Zero Sugar', '9-Bar Extract', '240 ml'],
  },
  sweetened: {
    id: 'sweetened', name: 'Sweetened Blend', shortLabel: 'Sweetened',
    slot: 2, line: 2, presses: PRESS_PER_CUP, price: 50,
    description: 'Balanced roast blended with warm Negros Occidental muscovado cane',
    image: '/src/assets/images/tricoff_sweetened_cup_1793250304427.jpg',
    badgeNote: 'Raw Muscovado Infusion · 87°C',
    tags: ['Double Shot', 'Raw Muscovado', 'Caramel Crema', '240 ml'],
  },
  decaf: {
    id: 'decaf', name: 'Swiss Water Decaf', shortLabel: 'Decaf',
    slot: 3, line: 3, presses: PRESS_PER_CUP, price: 55,
    description: '99.9% caffeine-free single-origin Swiss Water osmosis roast',
    image: '/src/assets/images/tricoff_decaf_cup_1793250304874.jpg',
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
    presses: order.presses,
    price: order.price,
    description: 'Freshly extracted highland craft coffee.',
    image: '/src/assets/images/tricoff_regular_cup_1793250304524.jpg',
    badgeNote: 'Benguet Harvest · 88°C Hot',
    tags: ['Highland Arabica', '240 ml Cup', 'Hot Extraction'],
  };

  const tagsHtml = (drink.tags || ['Highland Harvest', '240 ml Cup'])
    .map((tag) => `<span class="pill-chip">${tag}</span>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>TRICOFF — Mobile QR Payment</title>
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
    --success: #059669;
    --danger: #DC2626;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background-color: var(--bg-page);
    color: var(--coffee-dark);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 1rem 0.85rem;
    -webkit-font-smoothing: antialiased;
  }
  .app-container {
    width: 100%;
    max-width: 410px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding-bottom: 2.5rem;
  }
  /* Top App Bar */
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.25rem;
  }
  .brand-lockup {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .brand-title {
    font-size: 1.25rem;
    font-weight: 900;
    letter-spacing: -0.02em;
    color: var(--coffee-dark);
  }
  .brand-tag {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.2rem 0.5rem;
    background: #F6F1EA;
    color: var(--coffee-brown);
    border: 1px solid var(--border-color);
    border-radius: 999px;
    letter-spacing: 0.05em;
  }
  .security-pill {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--coffee-dark);
    background: #F6F1EA;
    border: 1px solid var(--border-color);
    padding: 0.25rem 0.65rem;
    border-radius: 999px;
  }

  /* ── Reference Card Design adapted for Mobile Phone ── */
  .product-ref-card {
    background: #FFFFFF;
    border: 1px solid var(--border-color);
    border-radius: 32px;
    padding: 0.75rem;
    box-shadow: 0 10px 30px rgba(68, 39, 19, 0.06);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    overflow: hidden;
  }
  .ref-media-frame {
    position: relative;
    border-radius: 24px;
    background: linear-gradient(180deg, #F7F2EB 0%, #ECE2D6 100%);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding-top: 1rem;
    aspect-ratio: 4/3.2;
  }
  .ref-price-badge {
    position: absolute;
    top: 0;
    right: 0;
    background: #FFFFFF;
    padding: 0.35rem 0.9rem;
    border-radius: 0 24px 0 16px;
    border-left: 1px solid rgba(232, 222, 200, 0.8);
    border-bottom: 1px solid rgba(232, 222, 200, 0.8);
    font-weight: 900;
    font-size: 1.25rem;
    color: var(--coffee-dark);
    box-shadow: 0 2px 6px rgba(0,0,0,0.03);
    z-index: 2;
  }
  .ref-slot-badge {
    position: absolute;
    top: 0.65rem;
    left: 0.65rem;
    background: rgba(255, 255, 255, 0.92);
    font-family: ui-monospace, monospace;
    font-size: 0.7rem;
    font-weight: 800;
    color: var(--coffee-dark);
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    border: 1px solid var(--border-color);
    z-index: 2;
  }
  .ref-cup-img {
    height: 135px;
    width: auto;
    object-fit: contain;
    filter: drop-shadow(0 10px 18px rgba(68, 39, 19, 0.2));
    margin: auto 0;
    z-index: 1;
  }
  .ref-ribbon {
    width: 100%;
    background: rgba(177, 138, 97, 0.28);
    backdrop-filter: blur(4px);
    color: var(--coffee-dark);
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.45rem 0.6rem;
    text-align: center;
    border-top: 1px solid rgba(177, 138, 97, 0.25);
    z-index: 2;
  }
  .ref-content {
    padding: 0.25rem 0.4rem 0.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .ref-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .ref-title {
    font-size: 1.35rem;
    font-weight: 800;
    color: var(--coffee-dark);
    letter-spacing: -0.01em;
  }
  .ref-order-tag {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--coffee-caramel);
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }
  .ref-desc {
    font-size: 0.75rem;
    color: var(--coffee-brown);
    line-height: 1.4;
  }
  .pills-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding-top: 0.4rem;
    border-top: 1px solid rgba(232, 222, 200, 0.7);
  }
  .pill-chip {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--coffee-brown);
    background: #F6F1EA;
    border: 1px solid var(--border-color);
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
  }

  /* Kiosk Slot Notice */
  .slot-banner {
    background: #FAF7F2;
    border: 1px solid var(--border-color);
    border-radius: 1.25rem;
    padding: 0.85rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .slot-banner-num {
    background: var(--coffee-dark);
    color: #FFFFFF;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 1.15rem;
    flex-shrink: 0;
  }
  .slot-banner-text {
    font-size: 0.75rem;
    color: var(--coffee-brown);
    line-height: 1.4;
  }
  .slot-banner-text strong {
    color: var(--coffee-dark);
    font-weight: 800;
  }

  /* Payment Source Simulator Selector */
  .app-picker-label {
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--coffee-brown);
    margin-bottom: 0.5rem;
  }
  .app-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .app-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1rem;
    border-radius: 1rem;
    border: 1.5px solid var(--border-color);
    background: #FFFFFF;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .app-option.selected {
    border-color: var(--coffee-caramel);
    background: #F6F1EA;
    box-shadow: 0 4px 12px rgba(165, 117, 74, 0.12);
  }
  .app-left {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--coffee-dark);
  }
  .app-badge-dot {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 50%;
    background: var(--coffee-caramel);
  }
  .app-balance {
    font-size: 0.75rem;
    color: var(--coffee-brown);
    font-family: ui-monospace, monospace;
    font-weight: 600;
  }

  /* Action Buttons */
  .action-group {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    margin-top: 0.25rem;
  }
  .btn {
    width: 100%;
    padding: 1.05rem;
    border-radius: 1.15rem;
    font-size: 1rem;
    font-weight: 800;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    transition: all 0.15s ease;
    border: none;
  }
  .btn:active {
    transform: scale(0.98);
  }
  .btn-pay {
    background: var(--coffee-dark);
    color: #FFFFFF;
    box-shadow: 0 6px 18px rgba(68, 39, 19, 0.25);
  }
  .btn-pay:hover {
    background: var(--coffee-brown);
  }
  .btn-cancel {
    background: transparent;
    color: var(--coffee-brown);
    font-size: 0.85rem;
    font-weight: 600;
    padding: 0.65rem;
  }
  .btn-cancel:hover {
    color: var(--danger);
  }

  /* Result Screens */
  .result-view {
    display: none;
    padding: 2.5rem 1.5rem;
    text-align: center;
    background: #FFFFFF;
    border: 1px solid var(--border-color);
    border-radius: 32px;
    box-shadow: 0 10px 30px rgba(68, 39, 19, 0.06);
  }
  .result-view.active {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .result-icon-circle {
    width: 4.5rem;
    height: 4.5rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 1.25rem;
  }
  .result-icon-circle.success {
    background: #ECFDF5;
    border: 2px solid #A7F3D0;
    color: #059669;
  }
  .result-icon-circle.fail {
    background: #FEF2F2;
    border: 2px solid #FECACA;
    color: #DC2626;
  }
  .result-title {
    font-size: 1.5rem;
    font-weight: 900;
    margin-bottom: 0.5rem;
    letter-spacing: -0.02em;
  }
  .result-msg {
    font-size: 0.85rem;
    color: var(--coffee-brown);
    line-height: 1.5;
    margin-bottom: 1.5rem;
    max-width: 300px;
  }
  .status-pill {
    background: #FAF7F2;
    border: 1px solid var(--border-color);
    border-radius: 1.25rem;
    padding: 1rem;
    width: 100%;
    text-align: left;
    font-size: 0.8rem;
    margin-bottom: 1.5rem;
  }
  .status-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.4rem;
  }
  .status-row:last-child {
    margin-bottom: 0;
  }

  /* Spinner */
  .spinner {
    width: 1.25rem;
    height: 1.25rem;
    border: 2.5px solid rgba(255, 255, 255, 0.3);
    border-top-color: #FFFFFF;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
</head>
<body>
<div class="app-container">
  
  {/* Top App Bar */}
  <header class="top-bar">
    <div class="brand-lockup">
      <span class="brand-title">TRICOFF</span>
      <span class="brand-tag">REV. 2 EXPRESS</span>
    </div>
    <div class="security-pill">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <span>QRPh & InstaPay</span>
    </div>
  </header>

  {/* Active Order Stage */}
  <main id="orderBody" style="display:flex; flex-direction:column; gap:1rem;">
    
    {/* Product Reference Card */}
    <article class="product-ref-card">
      <div class="ref-media-frame">
        <div class="ref-price-badge">${order.price}₱</div>
        <div class="ref-slot-badge">Slot ${order.slot}</div>
        <img src="${drink.image}" alt="${order.drinkName}" class="ref-cup-img">
        <div class="ref-ribbon">${drink.badgeNote || 'Benguet Harvest · 88°C Hot'}</div>
      </div>

      <div class="ref-content">
        <div class="ref-title-row">
          <h2 class="ref-title">${order.drinkName}</h2>
          <span class="ref-order-tag">Order Ready ↗</span>
        </div>
        <p class="ref-desc">${drink.description}</p>
        
        <div class="pills-row">
          ${tagsHtml}
        </div>
      </div>
    </article>

    {/* Kiosk Slot Notice */}
    <div class="slot-banner">
      <div class="slot-banner-num">${order.slot}</div>
      <div class="slot-banner-text">
        Place your 240 ml takeaway paper cup under <strong>Slot ${order.slot}</strong> on the kiosk. Dispenser activates upon payment.
      </div>
    </div>

    {/* Simulated Payment Account Picker */}
    <div>
      <div class="app-picker-label">Pay from (Simulated Account)</div>
      <div class="app-options">
        <div class="app-option selected" onclick="selectApp(this, 'GCash')">
          <div class="app-left">
            <span class="app-badge-dot"></span>
            <span>GCash (0995 028 ••••)</span>
          </div>
          <span class="app-balance">₱1,250.00</span>
        </div>
        <div class="app-option" onclick="selectApp(this, 'Maya')">
          <div class="app-left">
            <span class="app-badge-dot" style="background:var(--coffee-medium)"></span>
            <span>Maya Wallet</span>
          </div>
          <span class="app-balance">₱3,400.00</span>
        </div>
        <div class="app-option" onclick="selectApp(this, 'BPI')">
          <div class="app-left">
            <span class="app-badge-dot" style="background:var(--coffee-brown)"></span>
            <span>BPI Vybe / Online</span>
          </div>
          <span class="app-balance">₱8,120.00</span>
        </div>
      </div>
    </div>

    {/* Action Buttons */}
    <div class="action-group">
      <button class="btn btn-pay" id="payBtn" onclick="executePayment()">
        <span>Authorize & Pay ₱${order.price}.00</span>
      </button>
      <button class="btn btn-cancel" onclick="executeCancel()">
        <span>Decline & Cancel Order</span>
      </button>
    </div>
  </main>

  {/* Success View */}
  <div class="result-view" id="successView">
    <div class="result-icon-circle success">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <h2 class="result-title" style="color:var(--coffee-dark)">Payment Approved</h2>
    <p class="result-msg">
      ₱${order.price}.00 authorized via <strong id="selectedAppName">GCash</strong>.<br>
      Your <strong>${order.drinkName}</strong> is pouring at the kiosk now!
    </p>

    <div class="status-pill">
      <div class="status-row">
        <span style="color:var(--coffee-brown)">Order Reference</span>
        <span style="font-family:ui-monospace, monospace; font-weight:700">${order.id}</span>
      </div>
      <div class="status-row">
        <span style="color:var(--coffee-brown)">Dispenser Location</span>
        <span style="color:var(--coffee-caramel); font-weight:800">Slot ${order.slot} (Line ${order.line})</span>
      </div>
      <div class="status-row">
        <span style="color:var(--coffee-brown)">Status</span>
        <span style="color:#059669; font-weight:800">Dispensing in Progress</span>
      </div>
    </div>

    <p style="font-size:0.75rem; color:var(--coffee-brown); line-height:1.4">
      Please wait at the kiosk machine. Your cup will be filled to ~240 ml.
    </p>
  </div>

  {/* Cancelled View */}
  <div class="result-view" id="cancelView">
    <div class="result-icon-circle fail">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </div>
    <h2 class="result-title" style="color:var(--danger)">Order Cancelled</h2>
    <p class="result-msg">
      The transaction for ${order.id} has been safely cancelled. No charges were made to your account.
    </p>
    <p style="font-size:0.75rem; color:var(--coffee-brown)">
      You can initiate a new order at the TRICOFF kiosk terminal.
    </p>
  </div>
</div>

<script>
var orderId = ${JSON.stringify(order.id)};
var selectedSource = 'GCash';

function selectApp(el, name) {
  document.querySelectorAll('.app-option').forEach(function(o) { o.classList.remove('selected'); });
  el.classList.add('selected');
  selectedSource = name;
}

function executePayment() {
  var btn = document.getElementById('payBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div><span>Authorizing payment...</span>';

  fetch('/api/orders/' + orderId + '/pay', { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      document.getElementById('orderBody').style.display = 'none';
      document.getElementById('selectedAppName').innerText = selectedSource;
      document.getElementById('successView').classList.add('active');
    })
    .catch(function() {
      // Fallback display in case network glitch
      document.getElementById('orderBody').style.display = 'none';
      document.getElementById('selectedAppName').innerText = selectedSource;
      document.getElementById('successView').classList.add('active');
    });
}

function executeCancel() {
  fetch('/api/orders/' + orderId + '/fail', { method: 'POST' })
    .finally(function() {
      document.getElementById('orderBody').style.display = 'none';
      document.getElementById('cancelView').classList.add('active');
    });
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
