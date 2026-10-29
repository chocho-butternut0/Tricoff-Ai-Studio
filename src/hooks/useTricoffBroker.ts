import { useState, useEffect, useRef, useCallback } from 'react';
import type { DrinkId } from '../data/tricoffData';

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

export interface KioskSnapshot {
  machineOnline: boolean;
  esp32Mock: boolean;
  activeOrder: Order | null;
  recentOrders: Order[];
  drinks: Record<DrinkId, { id: DrinkId; name: string; shortLabel: string; slot: number; line: number; presses: number; price: number; description: string }>;
  volumeMl: number;
  pressPerCup: number;
}

const DEFAULT_SNAPSHOT: KioskSnapshot = {
  machineOnline: false,
  esp32Mock: false,
  activeOrder: null,
  recentOrders: [],
  drinks: {} as KioskSnapshot['drinks'],
  volumeMl: 200,
  pressPerCup: 8,
};

export function useTricoffBroker() {
  const [snapshot, setSnapshot] = useState<KioskSnapshot>(DEFAULT_SNAPSHOT);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  // Short-lived HMAC reset token fetched from the server.
  // Refreshed every 4 minutes (tokens expire after 5).
  const resetTokenRef = useRef<string>('');

  const refreshResetToken = useCallback(async () => {
    try {
      const res = await fetch('/api/kiosk/reset-token');
      const data = await res.json();
      if (data?.resetToken) resetTokenRef.current = data.resetToken;
    } catch {
      // Token stays stale; reset will fall back gracefully
    }
  }, []);

  const applySnapshot = useCallback((data: Partial<KioskSnapshot> | undefined) => {
    if (!data) return;
    setSnapshot((prev) => ({ ...prev, ...data }));
  }, []);

  // Initial REST fetch + WebSocket with auto-reconnect
  useEffect(() => {
    let mounted = true;

    fetch('/api/state')
      .then((r) => r.json())
      .then((data) => {
        if (mounted && data?.ok) {
          const { ok, ...rest } = data;
          applySnapshot(rest);
        }
      })
      .catch(() => {});

    // Fetch an initial reset token immediately
    refreshResetToken();
    // Refresh it every 4 minutes so it never expires while the kiosk is open
    const tokenInterval = window.setInterval(refreshResetToken, 4 * 60 * 1000);

    function connect() {
      if (!mounted) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/api/ws`);
      wsRef.current = ws;

      ws.onopen = () => { if (mounted) setWsConnected(true); };

      ws.onmessage = (event) => {
        if (!mounted) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg?.snapshot) applySnapshot(msg.snapshot);
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

    return () => {
      mounted = false;
      window.clearInterval(tokenInterval);
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [applySnapshot, refreshResetToken]);

  // Create an order
  const createOrder = useCallback(
    async (drink: DrinkId): Promise<Order | null> => {
      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drink }),
        });
        const data = await res.json();
        if (data?.ok) {
          applySnapshot(data.snapshot);
          return data.order as Order;
        }
      } catch { /* server unreachable */ }
      return null;
    },
    [applySnapshot]
  );

  // Reset kiosk — sends the short-lived HMAC token for auth
  const resetKiosk = useCallback(async () => {
    try {
      const res = await fetch('/api/kiosk/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken: resetTokenRef.current }),
      });
      const data = await res.json();
      if (data?.ok) {
        applySnapshot(data);
        // Immediately refresh the token so next reset also works
        await refreshResetToken();
      }
    } catch {
      // Fallback: send via WS
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          action: 'kiosk:reset',
          data: { resetToken: resetTokenRef.current },
        }));
      }
    }
  }, [applySnapshot, refreshResetToken]);

  return { snapshot, wsConnected, createOrder, resetKiosk };
}
