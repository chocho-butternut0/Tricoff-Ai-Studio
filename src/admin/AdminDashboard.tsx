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
  TrendingUp,
  ShoppingBag,
  PhilippinePeso,
  Cpu,
  ChevronRight,
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
      cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
      dot: 'bg-amber-500',
    },
    paid: {
      label: 'Payment Verified',
      cls: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
      dot: 'bg-blue-500',
    },
    pouring: {
      label: 'Dispensing Coffee',
      cls: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20 animate-pulse',
      dot: 'bg-purple-500 animate-ping',
    },
    done: {
      label: 'Fulfilled',
      cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
      dot: 'bg-emerald-500',
    },
    failed: {
      label: 'Cancelled / Failed',
      cls: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20',
      dot: 'bg-red-500',
    },
  };
  const config = map[status] ?? map.created;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${config.cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span>{config.label}</span>
    </span>
  );
}

// ── Main Dashboard Component ────────────────────────────────────────

export function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const { data, wsConnected, updatePresses, testPress, exportCsv, resetKiosk } =
    useAdminBroker(true);

  const [testingSlot, setTestingSlot] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<Record<number, 'ok' | 'err'>>({});
  const [pressInputs, setPressInputs] = useState<Record<number, string>>({});
  const [savingSlot, setSavingSlot] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'feed' | 'history'>('feed');
  const [historyFilter, setHistoryFilter] = useState<'all' | Order['status']>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { stats, allOrders, activeOrder, machineOnline, esp32Mock, slotPresses } = data;

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
    setPressInputs((prev) => {
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
      <header className="admin-header px-6 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-4">
          <img
            src={tricoffLogo}
            alt="TRICOFF"
            className="h-8 w-auto"
          />
          <div className="hidden sm:block h-5 w-px bg-stone-300 dark:bg-stone-700" />
          <div className="hidden sm:flex items-center gap-2">
            <span className="font-semibold text-sm admin-text">Kiosk Operations Console</span>
            <span className="text-[11px] font-mono admin-faint px-1.5 py-0.5 rounded bg-stone-200/60 dark:bg-stone-800">
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
            <div className="admin-card p-5 relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold admin-text-3">Revenue Today</span>
                <div className="w-8 h-8 rounded-xl bg-[#A5754A]/10 flex items-center justify-center text-[#A5754A]">
                  <PhilippinePeso className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold font-mono text-[#442713] dark:text-[#FBF9F5] tabular-nums">
                ₱{stats.revenueToday}.00
              </p>
              <p className="text-[11px] admin-faint mt-1">Confirmed settled orders</p>
            </div>

            {/* Orders Today */}
            <div className="admin-card p-5 relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold admin-text-3">Orders Today</span>
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <ShoppingBag className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold font-mono admin-text tabular-nums">
                {stats.ordersToday}
              </p>
              <p className="text-[11px] admin-faint mt-1">Created since midnight</p>
            </div>

            {/* Successful Pours */}
            <div className="admin-card p-5 relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold admin-text-3">Completed Pours</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                {stats.successfulPours}
              </p>
              <p className="text-[11px] admin-faint mt-1">Successfully dispensed cups</p>
            </div>

            {/* Total Registered Orders */}
            <div className="admin-card p-5 relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold admin-text-3">Total Historical Orders</span>
                <div className="w-8 h-8 rounded-xl bg-stone-500/10 flex items-center justify-center text-stone-600 dark:text-stone-300">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold font-mono admin-text tabular-nums">
                {stats.totalOrders}
              </p>
              <p className="text-[11px] admin-faint mt-1">Recorded in orders.json</p>
            </div>
          </div>
        </section>

        {/* ── 2. Airpot Servos & Dispenser Calibration ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider admin-text-3 flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-amber-500" />
                <span>Airpot Servo Calibration & Arm Testing</span>
              </h2>
              <p className="text-xs admin-text-3 mt-0.5">
                Configure servo presses per cup to match the {VOLUME_ML} ml cup target. Use test press to calibrate mechanical throw.
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
              const pressVal = getPresses(slot);
              const numVal = parseInt(pressVal, 10);
              const isEdited = pressInputs[slot] !== undefined;
              const isTesting = testingSlot === slot;
              const isSaving = savingSlot === slot;
              const result = testResult[slot];

              return (
                <div
                  key={slot}
                  className="admin-card p-6 flex flex-col justify-between border border-stone-200/90 dark:border-stone-800"
                >
                  <div>
                    {/* Slot Header */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-400 font-extrabold flex items-center justify-center text-base font-mono">
                          {slot}
                        </span>
                        <div>
                          <h3 className="font-serif-display text-lg font-bold admin-text">
                            {drink.name}
                          </h3>
                          <p className="text-xs admin-text-3">
                            Slot {slot} · {drink.functionCode} · ₱{drink.price}.00
                          </p>
                        </div>
                      </div>

                      {/* Small Product Photo Thumbnail */}
                      <img
                        src={drink.image}
                        alt={drink.name}
                        className="w-10 h-10 rounded-xl object-contain bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700"
                      />
                    </div>

                    {/* Spec Summary */}
                    <div className="p-3 admin-inset rounded-xl text-xs space-y-1 mb-5">
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

                    {/* Presses Stepper Controller */}
                    <div className="mb-4">
                      <label className="block text-xs font-semibold admin-text-2 mb-2">
                        Servo Presses per Cup (1–30)
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setPressInputs((prev) => ({
                              ...prev,
                              [slot]: String(Math.max(1, (parseInt(getPresses(slot), 10) || 1) - 1)),
                            }))
                          }
                          className="admin-btn-secondary w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg cursor-pointer"
                        >
                          -
                        </button>

                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={pressVal}
                          onChange={(e) =>
                            setPressInputs((prev) => ({ ...prev, [slot]: e.target.value }))
                          }
                          className="admin-input flex-1 h-10 rounded-xl text-center font-mono font-bold text-base"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            setPressInputs((prev) => ({
                              ...prev,
                              [slot]: String(Math.min(30, (parseInt(getPresses(slot), 10) || 1) + 1)),
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
                  <div className="space-y-2 pt-2 border-t border-stone-200/60 dark:border-stone-800">
                    {/* Save Changes Button */}
                    <button
                      type="button"
                      disabled={!isEdited || isSaving}
                      onClick={() => handleSavePresses(slot)}
                      className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        isEdited
                          ? 'bg-[#442713] hover:bg-[#644B37] text-white shadow-xs'
                          : 'bg-stone-200/50 text-stone-400 dark:bg-stone-800/40 dark:text-stone-600 cursor-not-allowed'
                      }`}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <span>{isEdited ? 'Save New Press Count' : 'Press Count Synced'}</span>
                      )}
                    </button>

                    {/* Test Fire Servo Button */}
                    <button
                      type="button"
                      disabled={isTesting}
                      onClick={() => handleTestPress(slot)}
                      className="admin-btn-secondary w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {isTesting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Firing Test Press…</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          <span>Test Fire 1 Press</span>
                        </>
                      )}
                    </button>

                    {/* Result alert */}
                    {result === 'ok' && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Arm actuated successfully</span>
                      </p>
                    )}
                    {result === 'err' && (
                      <p className="text-[11px] text-red-600 dark:text-red-400 flex items-center justify-center gap-1">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Could not communicate with servo</span>
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
                      Slot {activeOrder.slot} · {activeOrder.presses} servo presses · ₱{activeOrder.price}.00
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

            <div className="mt-6 pt-4 border-t border-stone-200/60 dark:border-stone-800 flex items-center justify-between text-xs admin-faint">
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
                  <div className="flex p-0.5 bg-stone-200/60 dark:bg-stone-800 rounded-xl">
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
                      className="admin-input w-full h-8 pl-8 pr-3 text-xs rounded-xl"
                    />
                  </div>

                  {/* Export CSV button */}
                  <button
                    type="button"
                    onClick={exportCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-xs font-semibold admin-text-2 transition-colors cursor-pointer shrink-0"
                    title="Export complete order history as CSV"
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
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize transition-colors cursor-pointer ${
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
                      className="p-3 admin-inset rounded-2xl flex items-center justify-between gap-4 text-xs hover:border-stone-300 dark:hover:border-stone-700 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <StatusBadge status={order.status} />
                        <div className="min-w-0">
                          <p className="font-bold admin-text truncate">{order.drinkName}</p>
                          <p className="admin-text-3 font-mono text-[11px]">
                            {order.id} · Slot {order.slot} ({order.presses} presses)
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="font-mono font-bold text-amber-700 dark:text-amber-400">
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

            <div className="pt-3 mt-4 border-t border-stone-200/60 dark:border-stone-800 flex items-center justify-between text-[11px] admin-faint">
              <span>Showing {filteredOrders.length} transaction records</span>
              <span>Persisted locally to orders.json</span>
            </div>
          </div>

        </section>

      </main>
    </div>
  );
}
