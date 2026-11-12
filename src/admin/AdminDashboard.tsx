import React, { useState, useMemo } from 'react';
import {
  Wifi,
  WifiOff,
  LogOut,
  ExternalLink,
  Download,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Cpu,
  Search,
  Sliders,
  Play,
  Loader2,
  Activity,
  Layers,
} from 'lucide-react';
import type { Order } from '../hooks/useTricoffBroker';
import { useAdminBroker } from '../hooks/useAdminBroker';
import { DRINKS, VOLUME_ML } from '../data/tricoffData';
import { ThemeToggle } from './ThemeToggle';
import tricoffLogo from '../assets/images/tricoff_logo.svg';

interface AdminDashboardProps {
  onLogout: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatTime(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-PH', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: Order['status'] }) {
  const map: Record<Order['status'], { label: string; cls: string; dot: string }> = {
    created: {
      label: 'Waiting Payment',
      cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
      dot: 'bg-amber-500',
    },
    paid: {
      label: 'Payment Verified',
      cls: 'bg-blue-500/15 text-blue-800 dark:text-blue-300',
      dot: 'bg-blue-500',
    },
    pouring: {
      label: 'Dispensing Coffee',
      cls: 'bg-purple-500/15 text-purple-800 dark:text-purple-300 animate-pulse',
      dot: 'bg-purple-500 animate-ping',
    },
    done: {
      label: 'Fulfilled',
      cls: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
      dot: 'bg-emerald-500',
    },
    failed: {
      label: 'Cancelled / Failed',
      cls: 'bg-red-500/15 text-red-800 dark:text-red-300',
      dot: 'bg-red-500',
    },
  };
  const config = map[status] ?? map.created;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold shadow-2xs ${config.cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span>{config.label}</span>
    </span>
  );
}

// ── Custom Artisanal SVG Symbols for Today's Performance ────────────

function RevenueMetricSvg({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className} aria-label="Revenue Icon">
      <defs>
        <linearGradient id="kpiRevGrad" x1="2" y1="2" x2="26" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#C4915C" />
          <stop offset="60%" stopColor="#A5754A" />
          <stop offset="100%" stopColor="#644B37" />
        </linearGradient>
      </defs>
      {/* Outer Coin Rim with Subtle Milled Marks */}
      <circle cx="14" cy="14" r="12" fill="#A5754A" fillOpacity="0.1" />
      <circle cx="14" cy="14" r="11.5" stroke="url(#kpiRevGrad)" strokeWidth="1.8" />
      <circle cx="14" cy="14" r="9" stroke="#C4915C" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="1.5 2" />
      {/* Authentic Philippine Peso Glyph with Double Crossbar */}
      <path
        d="M10.5 7.5h5a3.5 3.5 0 0 1 0 7h-5V20.5"
        stroke="url(#kpiRevGrad)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 10h7.5M8.5 12.2h7.5"
        stroke="url(#kpiRevGrad)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* Radiant Gleam Sparkle */}
      <path
        d="M20 5.5v3M18.5 7h3"
        stroke="#C4915C"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function OrdersMetricSvg({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className} aria-label="Orders Icon">
      <defs>
        <linearGradient id="kpiOrderGrad" x1="3" y1="3" x2="25" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      {/* Background Soft Glow */}
      <rect x="2" y="2" width="24" height="24" rx="8" fill="#3B82F6" fillOpacity="0.08" />
      {/* Takeaway Paper Cup Body */}
      <path
        d="M8 9.5l1.4 12c.1 1.1 1.1 1.9 2.2 1.9h4.8c1.1 0 2.1-.8 2.2-1.9l1.4-12H8z"
        fill="#3B82F6"
        fillOpacity="0.16"
        stroke="url(#kpiOrderGrad)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Cup Lid with Beveled Lip */}
      <path
        d="M6.5 8h15c.8 0 1.5-.6 1.5-1.4 0-.8-.7-1.4-1.5-1.4h-15C5.7 5.2 5 5.8 5 6.6c0 .8.7 1.4 1.5 1.4z"
        fill="#2563EB"
        fillOpacity="0.25"
        stroke="url(#kpiOrderGrad)"
        strokeWidth="1.6"
      />
      {/* Cup Sleeve Grip Band */}
      <path
        d="M8.7 13.5h10.6l-.6 5H9.3l-.6-5z"
        fill="url(#kpiOrderGrad)"
        fillOpacity="0.3"
      />
      {/* Steam Wisps */}
      <path
        d="M11.5 3.5c.5-.8 1.5-1.2 2.5-.8M16.5 4c.4-.7 1.2-1 2-.6"
        stroke="#3B82F6"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PoursMetricSvg({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className} aria-label="Completed Pours Icon">
      <defs>
        <linearGradient id="kpiPourGrad" x1="3" y1="3" x2="25" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      {/* Background Soft Glow */}
      <rect x="2" y="2" width="24" height="24" rx="8" fill="#10B981" fillOpacity="0.08" />
      {/* Automated Airpot Spout & Relay Head */}
      <rect x="10" y="3" width="8" height="3" rx="1.5" fill="url(#kpiPourGrad)" />
      <path d="M12.5 6v2.5M15.5 6v2.5" stroke="#059669" strokeWidth="1.6" strokeLinecap="round" />
      {/* Dynamic Pouring Stream */}
      <path
        d="M14 8.5v5.5"
        stroke="url(#kpiPourGrad)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeDasharray="1.5 2"
      />
      {/* Receiver Cup with Verified Checkmark */}
      <path
        d="M7 15l1.2 7c.1.9.9 1.6 1.8 1.6h8c.9 0 1.7-.7 1.8-1.6l1.2-7H7z"
        fill="#10B981"
        fillOpacity="0.18"
        stroke="url(#kpiPourGrad)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Confirmed Success Checkmark inside Cup */}
      <path
        d="M10.8 19.2l2.2 2.2 4.4-4.6"
        stroke="#047857"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LedgerMetricSvg({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className} aria-label="Historical Orders Icon">
      <defs>
        <linearGradient id="kpiLedgerGrad" x1="3" y1="3" x2="25" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      {/* Background Soft Glow */}
      <rect x="2" y="2" width="24" height="24" rx="8" fill="#8B5CF6" fillOpacity="0.08" />
      {/* Stepped Performance Bars */}
      <rect x="5.5" y="16.5" width="4" height="6.5" rx="1.8" fill="url(#kpiLedgerGrad)" fillOpacity="0.4" />
      <rect x="12" y="12" width="4" height="11" rx="1.8" fill="url(#kpiLedgerGrad)" fillOpacity="0.7" />
      <rect x="18.5" y="7.5" width="4" height="15.5" rx="1.8" fill="url(#kpiLedgerGrad)" />
      {/* Ascending Trend Trajectory with Directional Arrow */}
      <path
        d="M6.5 12.5l5.2-4.5 4.5 3 5.5-5.5"
        stroke="#6D28D9"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21.7 5.5h-4.2M21.7 5.5v4.2"
        stroke="#6D28D9"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Main Dashboard Component ────────────────────────────────────────

export function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const { data, wsConnected, updateSeconds, testPress, exportCsv, exportHtml, resetKiosk } =
    useAdminBroker(true);

  const [testingSlot, setTestingSlot] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<Record<number, 'ok' | 'err'>>({});
  const [secInputs, setSecInputs] = useState<Record<number, string>>({});
  const [savingSlot, setSavingSlot] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'feed' | 'history'>('feed');
  const [historyFilter, setHistoryFilter] = useState<'all' | Order['status']>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { stats, allOrders, activeOrder, machineOnline, esp32Mock, slotSeconds } = data;

  const getSeconds = (slot: number) =>
    secInputs[slot] !== undefined ? secInputs[slot] : String(slotSeconds[slot] ?? 6);

  const handleTestPour = async (slot: number) => {
    setTestingSlot(slot);
    setTestResult((prev) => ({ ...prev, [slot]: undefined as unknown as 'ok' }));
    const res = await testPress(slot);
    setTestResult((prev) => ({ ...prev, [slot]: res.ok ? 'ok' : 'err' }));
    setTestingSlot(null);
  };

  const handleSaveSeconds = async (slot: number) => {
    const val = parseInt(getSeconds(slot), 10);
    if (isNaN(val) || val < 1 || val > 60) return;
    setSavingSlot(slot);
    await updateSeconds(slot, val);
    setSavingSlot(null);
    setSecInputs((prev) => {
      const n = { ...prev };
      delete n[slot];
      return n;
    });
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    onLogout();
  };

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    const baseList = activeTab === 'feed' ? data.recentOrders : allOrders;
    return baseList.filter((o) => {
      const matchesFilter = historyFilter === 'all' || o.status === historyFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        o.id.toLowerCase().includes(q) ||
        o.drinkName.toLowerCase().includes(q) ||
        String(o.slot).includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [activeTab, data.recentOrders, allOrders, historyFilter, searchQuery]);

  return (
    <div className="admin-page min-h-screen pb-16 font-sans">
      
      {/* ── Top Navigation Bar ── */}
      <header className="admin-header px-6 py-3.5 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <img
            src={tricoffLogo}
            alt="TRICOFF"
            className="h-8 w-auto"
          />
          <div className="hidden sm:block h-4 w-1 rounded-full bg-black/10 dark:bg-white/10" />
          <div className="hidden sm:flex items-center gap-2">
            <span className="font-semibold text-sm admin-text">Kiosk Operations Console</span>
            <span className="text-[11px] font-mono admin-faint px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06]">
              Rev. 2 Airpot
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          {/* Machine Hardware Status */}
          <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-stone-200/50 dark:bg-stone-800/60">
            {machineOnline || esp32Mock ? (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <Wifi className="w-3.5 h-3.5" />
                <span>{esp32Mock ? 'ESP32 Mock' : 'ESP32 Online'}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                <WifiOff className="w-3.5 h-3.5" />
                <span>ESP32 Offline</span>
              </span>
            )}
          </div>

          {/* WebSocket Live Indicator */}
          <div className="hidden md:flex items-center gap-1.5 text-xs admin-text-3">
            <span
              className={`w-2 h-2 rounded-full ${
                wsConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
              }`}
            />
            <span>{wsConnected ? 'Live Broker' : 'Reconnecting'}</span>
          </div>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Open Kiosk in new tab */}
          <a
            href="/kiosk"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#442713] hover:bg-[#644B37] text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
          >
            <span>Customer Kiosk</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            className="admin-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        
        {/* ── 1. Key Performance Metrics ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#644B37] dark:text-stone-400 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-[#A5754A]" />
              <span>Today's Performance & Dispenser Telemetry</span>
            </h2>
            <span className="text-[11px] admin-faint font-mono">
              Auto-updating via WebSocket
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Revenue Today */}
            <div className="admin-card p-5 relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-bold text-[#644B37] dark:text-stone-300">Revenue Today</span>
                <div className="w-10 h-10 rounded-2xl bg-white dark:bg-stone-800 shadow-2xs flex items-center justify-center p-2 text-[#A5754A] dark:text-amber-400">
                  <RevenueMetricSvg className="w-6 h-6" />
                </div>
              </div>
              <p className="text-3xl font-extrabold font-money text-[#442713] dark:text-[#FBF9F5] tabular-nums tracking-tight">
                ₱{stats.revenueToday}.00
              </p>
              <p className="text-[11px] text-[#A5754A] dark:text-amber-400 font-medium mt-1">Confirmed settled orders</p>
            </div>

            {/* Orders Today */}
            <div className="admin-card p-5 relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-bold text-[#644B37] dark:text-stone-300">Orders Today</span>
                <div className="w-10 h-10 rounded-2xl bg-white dark:bg-stone-800 shadow-2xs flex items-center justify-center p-2 text-blue-600 dark:text-blue-400">
                  <OrdersMetricSvg className="w-6 h-6" />
                </div>
              </div>
              <p className="text-3xl font-extrabold font-mono text-[#442713] dark:text-stone-100 tabular-nums tracking-tight">
                {stats.ordersToday}
              </p>
              <p className="text-[11px] text-blue-600 dark:text-blue-400 font-medium mt-1">Created since midnight</p>
            </div>

            {/* Successful Pours */}
            <div className="admin-card p-5 relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-bold text-[#644B37] dark:text-stone-300">Completed Pours</span>
                <div className="w-10 h-10 rounded-2xl bg-white dark:bg-stone-800 shadow-2xs flex items-center justify-center p-2 text-emerald-600 dark:text-emerald-400">
                  <PoursMetricSvg className="w-6 h-6" />
                </div>
              </div>
              <p className="text-3xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums tracking-tight">
                {stats.successfulPours}
              </p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1">Successfully dispensed cups</p>
            </div>

            {/* Total Registered Orders */}
            <div className="admin-card p-5 relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-bold text-[#644B37] dark:text-stone-300">Total Historical Orders</span>
                <div className="w-10 h-10 rounded-2xl bg-white dark:bg-stone-800 shadow-2xs flex items-center justify-center p-2 text-purple-600 dark:text-purple-400">
                  <LedgerMetricSvg className="w-6 h-6" />
                </div>
              </div>
              <p className="text-3xl font-extrabold font-mono text-[#442713] dark:text-stone-100 tabular-nums tracking-tight">
                {stats.totalOrders}
              </p>
              <p className="text-[11px] text-purple-600 dark:text-purple-400 font-medium mt-1">Recorded in orders.json</p>
            </div>
          </div>
        </section>

        {/* ── 2. Airpot Servos & Dispenser Calibration ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider admin-text-3 flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-amber-500" />
                <span>Airpot Pour Duration Calibration</span>
              </h2>
              <p className="text-xs admin-text-3 mt-0.5">
                Set how many seconds each airpot relay stays open per cup. Use test pour to verify flow volume.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs admin-faint">
              <Cpu className="w-3.5 h-3.5" />
              <span>{esp32Mock ? 'Simulation active (Safe test mode)' : 'Hardware wired @ 192.168.4.1'}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {DRINKS.map((drink) => {
              const slot = drink.slot;
              const secVal = getSeconds(slot);
              const numVal = parseInt(secVal, 10);
              const isEdited = secInputs[slot] !== undefined;
              const isTesting = testingSlot === slot;
              const isSaving = savingSlot === slot;
              const result = testResult[slot];

              return (
                <div
                  key={slot}
                  className="admin-card p-6 flex flex-col justify-between"
                >
                  <div>
                    {/* Slot Header */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-800 dark:text-amber-400 font-extrabold flex items-center justify-center text-base font-mono">
                          {slot}
                        </span>
                        <div>
                          <h3 className="font-serif-display text-lg font-bold admin-text">
                            {drink.name}
                          </h3>
                          <p className="text-xs admin-text-3">
                            Slot {slot} · {drink.functionCode} · <span className="font-money font-semibold">₱{drink.price}.00</span>
                          </p>
                        </div>
                      </div>

                      {/* Small Product Photo Thumbnail */}
                      <img
                        src={drink.image}
                        alt={drink.name}
                        className="w-11 h-11 rounded-2xl object-cover bg-stone-100 dark:bg-stone-800 shadow-2xs"
                      />
                    </div>

                    {/* Spec Summary */}
                    <div className="p-3.5 admin-inset rounded-2xl text-xs space-y-1.5 mb-5">
                      <div className="flex justify-between">
                        <span className="admin-text-3">Target Volume:</span>
                        <span className="font-semibold admin-text">{drink.volume}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="admin-text-3">Extraction Flow:</span>
                        <span className="font-semibold admin-text">{drink.extractionSeconds}s @ {drink.temperature}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="admin-text-3">Profile:</span>
                        <span className="font-semibold admin-text truncate max-w-[140px]">{drink.sweetnessProfile}</span>
                      </div>
                    </div>

                    {/* Pour Duration Stepper Controller */}
                    <div className="mb-4">
                      <label className="block text-xs font-semibold admin-text-2 mb-2">
                        Pour Duration in Seconds (1–60)
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSecInputs((prev) => ({
                              ...prev,
                              [slot]: String(Math.max(1, (parseInt(getSeconds(slot), 10) || 1) - 1)),
                            }))
                          }
                          className="admin-btn-secondary w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg cursor-pointer"
                        >
                          -
                        </button>

                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={secVal}
                          onChange={(e) =>
                            setSecInputs((prev) => ({ ...prev, [slot]: e.target.value }))
                          }
                          className="admin-input flex-1 h-10 rounded-xl text-center font-mono font-bold text-base"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            setSecInputs((prev) => ({
                              ...prev,
                              [slot]: String(Math.min(60, (parseInt(getSeconds(slot), 10) || 1) + 1)),
                            }))
                          }
                          className="admin-btn-secondary w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Actions for this Slot */}
                  <div className="space-y-2 pt-3">
                    {/* Save Changes Button */}
                    <button
                      type="button"
                      disabled={!isEdited || isSaving}
                      onClick={() => handleSaveSeconds(slot)}
                      className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        isEdited
                          ? 'bg-[#442713] hover:bg-[#644B37] text-white shadow-xs'
                          : 'bg-black/[0.04] text-stone-400 dark:bg-white/[0.05] dark:text-stone-600 cursor-not-allowed'
                      }`}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <span>{isEdited ? 'Save New Duration' : 'Duration Synced'}</span>
                      )}
                    </button>

                    {/* Test Pour Button */}
                    <button
                      type="button"
                      disabled={isTesting}
                      onClick={() => handleTestPour(slot)}
                      className="admin-btn-secondary w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      {isTesting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Firing Test Pour…</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          <span>Test Pour (1s)</span>
                        </>
                      )}
                    </button>

                    {/* Result alert */}
                    {result === 'ok' && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1 pt-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Arm actuated successfully</span>
                      </p>
                    )}
                    {result === 'err' && (
                      <p className="text-[11px] text-red-600 dark:text-red-400 flex items-center justify-center gap-1 pt-1">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Could not communicate with airpot relay</span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 3. Active Terminal Session & Historical Ledger ── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Active Kiosk Terminal Status */}
          <div className="admin-card p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold admin-text-2 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-500" />
                  <span>Kiosk Terminal Monitor</span>
                </h3>
                {activeOrder && (
                  <button
                    type="button"
                    onClick={resetKiosk}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Force Reset</span>
                  </button>
                )}
              </div>

              {activeOrder ? (
                <div className="space-y-4">
                  <div className="p-4 admin-inset rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                        {activeOrder.id}
                      </span>
                      <StatusBadge status={activeOrder.status} />
                    </div>

                    <h4 className="font-serif-display text-xl font-bold admin-text">
                      {activeOrder.drinkName}
                    </h4>

                    <p className="text-xs admin-text-3">
                      Slot {activeOrder.slot} · {activeOrder.pourSeconds}s pour · <span className="font-money font-semibold">₱{activeOrder.price}.00</span>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-3 admin-inset rounded-xl">
                      <span className="admin-text-3 block text-[11px] mb-0.5">Created At</span>
                      <span className="font-mono font-medium admin-text">
                        {formatTime(activeOrder.createdAt)}
                      </span>
                    </div>
                    <div className="p-3 admin-inset rounded-xl">
                      <span className="admin-text-3 block text-[11px] mb-0.5">Paid At</span>
                      <span className="font-mono font-medium admin-text">
                        {formatTime(activeOrder.paidAt)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-400">
                    <Clock className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold admin-text-2">Kiosk is Idle</p>
                  <p className="text-xs admin-text-3 max-w-[220px]">
                    Customer touch screen is currently waiting for beverage selection.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 pt-3 flex items-center justify-between text-xs admin-faint">
              <span>QR Payment Broker:</span>
              <span className="font-mono text-stone-600 dark:text-stone-300">Port 3000 WebSocket</span>
            </div>
          </div>

          {/* Searchable Transaction Ledger & Live Feed */}
          <div className="lg:col-span-2 admin-card p-6 flex flex-col justify-between">
            <div>
              {/* Header with Switcher & Actions */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-bold admin-text-2 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-500" />
                    <span>Transactions</span>
                  </h3>

                  {/* Feed vs History tab */}
                  <div className="flex p-0.5 bg-black/[0.05] dark:bg-white/[0.06] rounded-xl">
                    <button
                      type="button"
                      onClick={() => setActiveTab('feed')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        activeTab === 'feed'
                          ? 'bg-white text-stone-900 dark:bg-stone-700 dark:text-white shadow-xs'
                          : 'admin-quiet'
                      }`}
                    >
                      Recent Feed ({data.recentOrders.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('history')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        activeTab === 'history'
                          ? 'bg-white text-stone-900 dark:bg-stone-700 dark:text-white shadow-xs'
                          : 'admin-quiet'
                      }`}
                    >
                      Full Ledger ({allOrders.length})
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {/* Search Bar */}
                  <div className="relative flex-1 sm:w-48">
                    <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search ticket, drink..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="admin-input w-full h-8.5 pl-8 pr-3 text-xs rounded-xl"
                    />
                  </div>

                  {/* Export buttons */}
                  <button
                    type="button"
                    onClick={exportHtml}
                    className="admin-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 shadow-2xs"
                    title="Export styled HTML report"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>HTML</span>
                  </button>
                  <button
                    type="button"
                    onClick={exportCsv}
                    className="admin-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 shadow-2xs"
                    title="Export plain CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              {/* Status Filter Tabs (when in history or feed) */}
              <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1 text-xs">
                {(['all', 'done', 'pouring', 'created', 'failed'] as const).map((filter) => {
                  const active = historyFilter === filter;
                  return (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setHistoryFilter(filter)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold capitalize transition-all cursor-pointer ${
                        active
                          ? 'bg-[#442713] text-white shadow-xs dark:bg-[#A5754A]'
                          : 'admin-btn-secondary'
                      }`}
                    >
                      {filter === 'all' ? 'All Statuses' : filter}
                    </button>
                  );
                })}
              </div>

              {/* Transaction Rows */}
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {filteredOrders.length === 0 ? (
                  <div className="py-12 text-center text-xs admin-faint">
                    No transactions match your current filters.
                  </div>
                ) : (
                  filteredOrders.map((order) => (
                    <div
                      key={order.id}
                      className="p-3.5 admin-inset rounded-2xl flex items-center justify-between gap-4 text-xs hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <StatusBadge status={order.status} />
                        <div className="min-w-0">
                          <p className="font-bold admin-text truncate">{order.drinkName}</p>
                          <p className="admin-text-3 font-mono text-[11px]">
                            {order.id} · Slot {order.slot} ({order.pourSeconds}s)
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="font-money font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                          ₱{order.price}.00
                        </p>
                        <p className="admin-faint text-[10px]">
                          {formatDate(order.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="pt-3 mt-4 flex items-center justify-between text-[11px] admin-faint">
              <span>Showing {filteredOrders.length} transaction records</span>
              <span>Persisted locally to orders.json</span>
            </div>
          </div>

        </section>

      </main>
    </div>
  );
}
