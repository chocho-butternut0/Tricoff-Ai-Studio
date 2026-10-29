import React, { useState } from 'react';
import {
  Coffee,
  Wifi,
  WifiOff,
  LogOut,
  ExternalLink,
  Download,
  RotateCcw,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  ShoppingBag,
  PhilippinePeso,
  Cpu,
  ChevronUp,
  ChevronDown,
  Minus,
} from 'lucide-react';
import type { Order } from '../hooks/useTricoffBroker';
import { useAdminBroker } from '../hooks/useAdminBroker';
import { DRINKS } from '../data/tricoffData';
import { ThemeToggle } from './ThemeToggle';

interface AdminDashboardProps {
  onLogout: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatTime(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-PH', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: Order['status'] }) {
  const map: Record<Order['status'], { label: string; cls: string }> = {
    created:  { label: 'Waiting',  cls: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300' },
    paid:     { label: 'Paid',     cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
    pouring:  { label: 'Pouring',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 animate-pulse' },
    done:     { label: 'Done',     cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
    failed:   { label: 'Failed',   cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  };
  const { label, cls } = map[status] ?? map.created;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function StatCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent: string;
}) {
  const iconBg = accent.includes('amber')
    ? 'bg-amber-500/10'
    : accent.includes('emerald')
    ? 'bg-emerald-500/10'
    : accent.includes('blue')
    ? 'bg-blue-500/10'
    : 'bg-stone-200 dark:bg-stone-800';
  return (
    <div className="admin-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium admin-text-3 mb-1">{label}</p>
          <p className={`text-3xl font-bold tabular-nums ${accent}`}>{value}</p>
          {sub && <p className="text-xs admin-text-3 mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-5 h-5 ${accent}`} />
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

export function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const { data, wsConnected, updatePresses, testPress, exportCsv, resetKiosk } =
    useAdminBroker(true);

  const [testingSlot, setTestingSlot] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<Record<number, 'ok' | 'err'>>({});
  const [pressInputs, setPressInputs] = useState<Record<number, string>>({});
  const [savingSlot, setSavingSlot] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'orders' | 'history'>('orders');
  const [historyFilter, setHistoryFilter] = useState<'all' | Order['status']>('all');

  const { stats, allOrders, activeOrder, machineOnline, esp32Mock, slotPresses } = data;

  // Derive current press values (admin input overrides, else server value)
  const getPresses = (slot: number) =>
    pressInputs[slot] !== undefined ? pressInputs[slot] : String(slotPresses[slot] ?? 8);

  const handleTestPress = async (slot: number) => {
    setTestingSlot(slot);
    setTestResult((prev) => ({ ...prev, [slot]: undefined as unknown as 'ok' }));
    const res = await testPress(slot);
    setTestResult((prev) => ({ ...prev, [slot]: res.ok ? 'ok' : 'err' }));
    setTestingSlot(null);
  };

  const handleSavePresses = async (slot: number) => {
    const val = parseInt(getPresses(slot), 10);
    if (isNaN(val) || val < 1 || val > 30) return;
    setSavingSlot(slot);
    await updatePresses(slot, val);
    setSavingSlot(null);
    setPressInputs((prev) => { const n = { ...prev }; delete n[slot]; return n; });
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    onLogout();
  };

  const filteredHistory = allOrders.filter(
    (o) => historyFilter === 'all' || o.status === historyFilter
  );

  return (
    <div className="admin-page min-h-screen">

      {/* ── Top nav ── */}
      <header className="admin-header px-6 py-3.5 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Coffee className="w-6 h-6 text-amber-500" />
          <div className="flex items-center gap-2">
            <span className="font-serif-display text-xl font-bold admin-text">TRICOFF</span>
            <span className="admin-faint text-sm">Admin</span>
          </div>
        </div>

        <div className="flex items-center gap-5">
          {/* Machine status */}
          {machineOnline || esp32Mock ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <Wifi className="w-3.5 h-3.5" />
              {esp32Mock ? 'Machine Online (Mock)' : 'Machine Online'}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
              <WifiOff className="w-3.5 h-3.5" />Machine Offline
            </span>
          )}

          {/* WS dot */}
          <span className="flex items-center gap-1.5 text-xs admin-text-3">
            <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-stone-400 dark:bg-stone-600 animate-pulse'}`} />
            {wsConnected ? 'Live' : 'Reconnecting'}
          </span>

          {/* Theme toggle */}
          <ThemeToggle />

          {/* Launch kiosk */}
          <a
            href="/kiosk"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Kiosk Screen
          </a>

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            className="admin-btn-secondary flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />Logout
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* ── Overview cards ── */}
        <section>
          <h2 className="text-xs font-semibold admin-text-3 uppercase tracking-wider mb-4">
            Today's Overview
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Orders Today"
              value={stats.ordersToday}
              sub="since midnight"
              icon={ShoppingBag}
              accent="text-blue-600 dark:text-blue-400"
            />
            <StatCard
              label="Revenue Today"
              value={`₱${stats.revenueToday}`}
              sub="successful pours only"
              icon={PhilippinePeso}
              accent="text-amber-600 dark:text-amber-400"
            />
            <StatCard
              label="Successful Pours"
              value={stats.successfulPours}
              sub="all-time"
              icon={CheckCircle2}
              accent="text-emerald-600 dark:text-emerald-400"
            />
            <StatCard
              label="Total Orders"
              value={stats.totalOrders}
              sub="all-time"
              icon={TrendingUp}
              accent="text-stone-700 dark:text-stone-300"
            />
          </div>
        </section>

        {/* ── Active order + live feed ── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Active order */}
          <div className="admin-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold admin-text-2">Active Order</h2>
              {activeOrder && (
                <button
                  type="button"
                  onClick={resetKiosk}
                  className="admin-quiet flex items-center gap-1 text-xs cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />Reset
                </button>
              )}
            </div>

            {activeOrder ? (
              <div className="space-y-3">
                <div className="p-3.5 admin-inset rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs admin-text-3">{activeOrder.id}</span>
                    <StatusBadge status={activeOrder.status} />
                  </div>
                  <p className="font-serif-display text-lg font-bold admin-text">
                    {activeOrder.drinkName}
                  </p>
                  <p className="text-xs admin-text-3 mt-0.5">
                    Slot {activeOrder.slot} · {activeOrder.presses} presses · ₱{activeOrder.price}.00
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 admin-inset rounded-lg">
                    <p className="admin-text-3 mb-0.5">Created</p>
                    <p className="font-mono admin-text-2">{formatTime(activeOrder.createdAt)}</p>
                  </div>
                  <div className="p-2.5 admin-inset rounded-lg">
                    <p className="admin-text-3 mb-0.5">Paid at</p>
                    <p className="font-mono admin-text-2">{formatTime(activeOrder.paidAt)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <Clock className="w-8 h-8 admin-faint mb-2" />
                <p className="text-sm admin-faint">No active order</p>
                <p className="text-xs admin-faint mt-1">Waiting for a customer to select a drink</p>
              </div>
            )}
          </div>

          {/* Live order feed */}
          <div className="lg:col-span-2 admin-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold admin-text-2">Live Order Feed</h2>
                <div className="flex gap-1">
                  {(['orders', 'history'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize cursor-pointer ${
                        activeTab === tab ? 'admin-tab-active' : 'admin-quiet'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>
              {activeTab === 'history' && (
                <button
                  type="button"
                  onClick={exportCsv}
                  className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-500 dark:text-amber-500 dark:hover:text-amber-400 cursor-pointer transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />Export CSV
                </button>
              )}
            </div>

            {activeTab === 'orders' ? (
              /* Recent 10 orders live feed */
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {data.recentOrders.length === 0 ? (
                  <p className="text-sm admin-faint text-center py-8">No orders yet</p>
                ) : (
                  data.recentOrders.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between gap-3 p-3 admin-inset rounded-xl text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <StatusBadge status={order.status} />
                        <div className="min-w-0">
                          <p className="font-medium admin-text truncate">{order.drinkName}</p>
                          <p className="admin-text-3 font-mono">{order.id} · Slot {order.slot}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono text-amber-600 dark:text-amber-400">₱{order.price}</p>
                        <p className="admin-faint">{formatTime(order.createdAt)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* Full history with filter */
              <div>
                <div className="flex gap-1.5 mb-3 flex-wrap">
                  {(['all', 'done', 'pouring', 'failed', 'created'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setHistoryFilter(f)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize cursor-pointer transition-colors ${
                        historyFilter === f ? 'admin-tab-active' : 'admin-quiet'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {filteredHistory.length === 0 ? (
                    <p className="text-sm admin-faint text-center py-6">No orders match this filter</p>
                  ) : (
                    filteredHistory.map((order) => (
                      <div
                        key={order.id}
                        className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2.5 admin-inset rounded-lg text-xs"
                      >
                        <StatusBadge status={order.status} />
                        <div className="min-w-0">
                          <span className="font-medium admin-text-2">{order.drinkName}</span>
                          <span className="admin-faint ml-2 font-mono">{order.id}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-amber-600 dark:text-amber-400">₱{order.price}</span>
                          <span className="admin-faint ml-2">{formatDate(order.createdAt)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Servo / Slot settings ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold admin-text-2">Airpot Servo Settings</h2>
              <p className="text-xs admin-text-3 mt-0.5">
                Adjust presses per cup per slot. Test fires one press to check arm position.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs admin-text-3">
              <Cpu className="w-3.5 h-3.5" />
              <span>{esp32Mock ? 'Mock mode — test presses are simulated' : `ESP32 @ 192.168.4.1`}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {DRINKS.map((drink) => {
              const slot = drink.slot;
              const pressVal = getPresses(slot);
              const numVal = parseInt(pressVal, 10);
              const isEdited = pressInputs[slot] !== undefined;
              const isTesting = testingSlot === slot;
              const isSaving = savingSlot === slot;
              const result = testResult[slot];

              return (
                <div key={slot} className="admin-card p-5">
                  {/* Slot header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center text-sm font-black">
                        {slot}
                      </span>
                      <div>
                        <p className="text-sm font-semibold admin-text">{drink.name}</p>
                        <p className="text-[11px] admin-text-3">{drink.shortLabel} · ₱{drink.price}</p>
                      </div>
                    </div>
                    {result === 'ok' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    )}
                    {result === 'err' && (
                      <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                    )}
                  </div>

                  {/* Presses input */}
                  <div className="mb-4">
                    <label className="block text-[11px] font-medium admin-text-3 mb-1.5">
                      Presses per cup (1–30)
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPressInputs((p) => ({ ...p, [slot]: String(Math.max(1, (parseInt(getPresses(slot), 10) || 1) - 1) ) }))}
                        className="admin-btn-secondary w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={pressVal}
                        onChange={(e) => setPressInputs((p) => ({ ...p, [slot]: e.target.value }))}
                        className="admin-input flex-1 text-sm font-mono text-center rounded-lg px-3 py-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        type="button"
                        onClick={() => setPressInputs((p) => ({ ...p, [slot]: String(Math.min(30, (parseInt(getPresses(slot), 10) || 1) + 1) ) }))}
                        className="admin-btn-secondary w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-[11px] admin-faint mt-1.5">
                      ≈ {isNaN(numVal) ? '?' : Math.round(numVal * 25)} ml estimated
                      {' '}(25 ml/press baseline)
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!isEdited || isSaving || isNaN(numVal) || numVal < 1 || numVal > 30}
                      onClick={() => handleSavePresses(slot)}
                      className="flex-1 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      {isSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      disabled={isTesting}
                      onClick={() => handleTestPress(slot)}
                      className="admin-btn-secondary flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      {isTesting ? 'Testing…' : 'Test 1×'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Quick actions ── */}
        <section className="pb-8">
          <h2 className="text-xs font-semibold admin-text-3 uppercase tracking-wider mb-4">
            Quick Actions
          </h2>
          <div className="flex flex-wrap gap-3">
            <a
              href="/kiosk"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-colors cursor-pointer shadow-md"
            >
              <ExternalLink className="w-4 h-4" />
              Open Kiosk Screen
            </a>
            <button
              type="button"
              onClick={resetKiosk}
              className="admin-btn-secondary flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium"
            >
              <RotateCcw className="w-4 h-4" />
              Reset Kiosk
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="admin-btn-secondary flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Export Orders CSV
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
