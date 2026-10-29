import { Routes, Route, Navigate } from 'react-router-dom';
import { useTricoffBroker } from './hooks/useTricoffBroker';
import { TricoffKioskMachine } from './components/TricoffKioskMachine';
import { AdminPage } from './admin/AdminPage';
import { ThemeProvider } from './context/ThemeContext';

export default function App() {
  const { snapshot, wsConnected, createOrder, resetKiosk } = useTricoffBroker();

  return (
    <Routes>
      {/* Kiosk screen — no auth, customer-facing */}
      <Route
        path="/kiosk"
        element={
          <TricoffKioskMachine
            snapshot={snapshot}
            wsConnected={wsConnected}
            onCreateOrder={createOrder}
            onReset={resetKiosk}
          />
        }
      />

      {/* Admin panel — password-protected */}
      <Route
        path="/admin"
        element={
          <ThemeProvider>
            <AdminPage />
          </ThemeProvider>
        }
      />

      {/* Default: redirect to kiosk */}
      <Route path="/" element={<Navigate to="/kiosk" replace />} />
      <Route path="*" element={<Navigate to="/kiosk" replace />} />
    </Routes>
  );
}
