import { useState, useEffect, useRef, useCallback } from 'react';
import type { Order, KioskSnapshot } from './useTricoffBroker';

export interface AdminStats {
  ordersToday: number;
  revenueToday: number;
  totalOrders: number;
  successfulPours: number;
}

export interface AdminSnapshot extends KioskSnapshot {
  allOrders: Order[];
  stats: AdminStats;
  slotPresses: Record<number, number>;
}

const DEFAULT_STATS: AdminStats = {
  ordersToday: 0,
  revenueToday: 0,
  totalOrders: 0,
  successfulPours: 0,
};

const DEFAULT: AdminSnapshot = {
  machineOnline: false,
  esp32Mock: false,
  activeOrder: null,
  recentOrders: [],
  allOrders: [],
  drinks: {} as AdminSnapshot['drinks'],
  volumeMl: 200,
  pressPerCup: 8,
  slotPresses: { 1: 8, 2: 8, 3: 8 },
  stats: DEFAULT_STATS,
};

export function useAdminBroker(authed: boolean) {
  const [data, setData] = useState<AdminSnapshot>(DEFAULT);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/state', { credentials: 'include' });
      const json = await res.json();
      if (json?.ok) setData((prev) => ({ ...prev, ...json }));
    } catch { /* ignore */ }
  }, []);

  // WebSocket for real-time updates + initial REST fetch
  useEffect(() => {
    if (!authed) return;
    let mounted = true;
    fetchState();

    function connect() {
      if (!mounted) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/api/ws`);
      wsRef.current = ws;
      ws.onopen = () => { if (mounted) setWsConnected(true); };
      ws.onmessage = (e) => {
        if (!mounted) return;
        try {
          const msg = JSON.parse(e.data);
          if (msg?.snapshot) {
            setData((prev) => ({ ...prev, ...msg.snapshot }));
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        if (!mounted) return;
        setWsConnected(false);
        reconnectTimer.current = window.setTimeout(connect, 1500);
      };
      ws.onerror = () => ws.close();
    }
    connect();
    // Re-fetch stats every 30s to keep today's numbers fresh
    const poll = setInterval(fetchState, 30_000);

    return () => {
      mounted = false;
      clearInterval(poll);
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [authed, fetchState]);

  const updatePresses = useCallback(async (slot: number, presses: number) => {
    const res = await fetch(`/api/admin/slots/${slot}/presses`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ presses }),
    });
    const json = await res.json();
    if (json?.ok) {
      setData((prev) => ({ ...prev, slotPresses: json.slotPresses }));
    }
    return json;
  }, []);

  const testPress = useCallback(async (slot: number) => {
    const res = await fetch(`/api/admin/slots/${slot}/test`, {
      method: 'POST',
      credentials: 'include',
    });
    return res.json();
  }, []);

  const exportCsv = useCallback(() => {
    window.location.href = '/api/admin/orders/export';
  }, []);

  const resetKiosk = useCallback(async () => {
    await fetch('/api/kiosk/reset', { method: 'POST', credentials: 'include' });
    await fetchState();
  }, [fetchState]);

  return { data, wsConnected, updatePresses, testPress, exportCsv, resetKiosk };
}
