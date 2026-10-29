import React from 'react';
import { ArrowLeft, X, Loader2 } from 'lucide-react';
import { QrCodeDisplay } from './QrCodeDisplay';
import type { Order } from '../hooks/useTricoffBroker';

export type PaymentRail = 'QRPh' | 'InstaPay';

interface PaymentQrPopupModalProps {
  isOpen: boolean;
  rail: PaymentRail;
  order: Order;
  onBack: () => void;
  onCancel: () => void;
}

export const PaymentQrPopupModal: React.FC<PaymentQrPopupModalProps> = ({
  isOpen,
  rail,
  order,
  onBack,
  onCancel,
}) => {
  if (!isOpen) return null;

  const isQrPh = rail === 'QRPh';

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-payment-heading"
    >
      <div className="w-full max-w-lg sm:max-w-xl rounded-[32px] sm:rounded-[36px] bg-[#FAF7F2] text-[#442713] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* ── Top Bar with Back and Cancel ── */}
        <div className="px-6 py-3 bg-[#F2ECE2] flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 py-1 px-3 rounded-lg text-[#644B37] hover:text-[#442713] hover:bg-white/70 transition-colors text-xs font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Change method</span>
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 py-1 px-3 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors text-xs font-medium cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </button>
        </div>

        {/* ── Main Content ── */}
        <div className="px-6 py-5 sm:px-8 sm:py-6 flex flex-col items-center text-center">
          
          {/* Rail Identity Badge */}
          <div className="mb-2">
            {isQrPh ? (
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-blue-50 text-blue-900">
                <span className="font-extrabold text-[11px] tracking-wider">
                  <span className="text-[#0038A8]">QR</span>
                  <span className="text-[#CE1126]">Ph</span>
                </span>
                <span className="text-stone-300">·</span>
                <span className="text-[11px] font-medium text-[#442713]">National QR Standard</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-red-50 text-red-900">
                <span className="font-extrabold text-[11px] tracking-wider">
                  <span className="text-[#00529B]">insta</span>
                  <span className="text-[#E11931]">Pay</span>
                </span>
                <span className="text-stone-300">·</span>
                <span className="text-[11px] font-medium text-[#442713]">Instant Bank Transfer</span>
              </div>
            )}
          </div>

          {/* Heading */}
          <h2 id="qr-payment-heading" className="font-sans text-2xl sm:text-[26px] font-bold text-[#442713]">
            Scan to Pay
          </h2>

          {/* Specific Instruction */}
          <p className="text-xs sm:text-sm text-[#644B37] mt-0.5 max-w-sm">
            {isQrPh
              ? 'Scan using your banking or e-wallet app.'
              : 'Scan using your supported banking app.'}
          </p>

          {/* Amount Badge */}
          <div className="my-3 px-5 py-2 rounded-xl bg-white shadow-2xs flex items-baseline justify-center gap-2">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-[#644B37]">
              Total Amount
            </span>
            <span className="font-mono text-2xl sm:text-3xl font-black text-[#442713] tabular-nums">
              ₱{order.price}.00
            </span>
          </div>

          {/* ── QR Container with Scanning Reticle & Quiet Zone ── */}
          <div className="relative p-3.5 bg-white rounded-2xl shadow-sm">
            {/* Animated corner scanner brackets */}
            <div className="absolute top-1.5 left-1.5 w-4 h-4 border-t-2 border-l-2 border-[#A5754A] rounded-tl-sm" />
            <div className="absolute top-1.5 right-1.5 w-4 h-4 border-t-2 border-r-2 border-[#A5754A] rounded-tr-sm" />
            <div className="absolute bottom-1.5 left-1.5 w-4 h-4 border-b-2 border-l-2 border-[#A5754A] rounded-bl-sm" />
            <div className="absolute bottom-1.5 right-1.5 w-4 h-4 border-b-2 border-r-2 border-[#A5754A] rounded-br-sm" />

            {/* Subtle animated scanning beam indicator */}
            <div className="absolute inset-x-3 top-3 h-0.5 bg-gradient-to-r from-transparent via-[#A5754A] to-transparent opacity-70 animate-pulse pointer-events-none" />

            {/* Scannable QR Code */}
            <div className="flex items-center justify-center">
              <QrCodeDisplay
                value={order.qrUrl}
                size={200}
                errorCorrectionLevel="M"
              />
            </div>
          </div>

          {/* ── Waiting for Payment Status ── */}
          <div className="mt-3.5 flex items-center justify-center gap-2 text-[#442713] text-xs font-medium">
            <Loader2 className="w-3.5 h-3.5 text-[#A5754A] animate-spin" />
            <span className="font-semibold">Waiting for payment…</span>
          </div>

        </div>
      </div>
    </div>
  );
};
