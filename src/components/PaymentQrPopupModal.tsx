import React from 'react';
import { ArrowLeft, X, Loader2, ExternalLink } from 'lucide-react';
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
      <div className="w-full max-w-[340px] sm:max-w-[360px] rounded-[26px] sm:rounded-[30px] bg-[#FAF7F2] text-[#442713] shadow-[0_20px_50px_rgba(0,0,0,0.22)] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* ── Top Bar with Back and Cancel ── */}
        <div className="px-4 py-2 sm:px-5 sm:py-2.5 bg-[#F2ECE2] flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-[#644B37] hover:text-white hover:bg-[#442713] transition-all duration-200 text-xs font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 py-1 px-2.5 rounded-lg text-stone-500 hover:text-white hover:bg-red-700/90 transition-all duration-200 text-xs font-medium cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </button>
        </div>

        {/* ── Main Content ── */}
        <div className="px-5 py-3.5 sm:px-6 sm:py-4 flex flex-col items-center text-center">
          
          {/* Step 3 Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white text-[#644B37] text-[11px] font-semibold shadow-2xs mb-1.5">
            <span>Step 3 · Scan to Pay</span>
          </div>

          {/* Rail Identity Badge */}
          <div className="mb-1">
            {isQrPh ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-50 text-blue-900 shadow-2xs">
                <span className="font-extrabold text-[11px] tracking-wider">
                  <span className="text-[#0038A8]">QR</span>
                  <span className="text-[#CE1126]">Ph</span>
                </span>
                <span className="text-stone-300">·</span>
                <span className="text-[11px] font-medium text-[#442713]">National QR</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-red-50 text-red-900 shadow-2xs">
                <span className="font-extrabold text-[11px] tracking-wider">
                  <span className="text-[#00529B]">insta</span>
                  <span className="text-[#E11931]">Pay</span>
                </span>
                <span className="text-stone-300">·</span>
                <span className="text-[11px] font-medium text-[#442713]">Interbank QR</span>
              </div>
            )}
          </div>

          {/* Specific Instruction */}
          <p className="text-[11px] sm:text-xs text-[#644B37] mt-0.5 max-w-[280px]">
            {isQrPh
              ? 'Scan using your banking or e-wallet app.'
              : 'Scan using your supported banking app.'}
          </p>

          {/* Amount Badge (clean, transparent background seamlessly on card) */}
          <div className="my-1.5 flex items-baseline justify-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-[#644B37]">
              Total Amount:
            </span>
            <span className="font-sans text-2xl sm:text-[26px] font-extrabold text-[#442713] tabular-nums">
              ₱{order.price}.00
            </span>
          </div>

          {/* ── QR Container with Quiet Zone and No Caramel Outlines (Clickable test link) ── */}
          <a
            href={`/pay/${order.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Click to open simulated mobile payment page"
            className="relative p-3 bg-white rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.06)] block cursor-pointer hover:scale-[1.01] transition-transform duration-200"
          >
            {/* Scannable QR Code */}
            <div className="flex items-center justify-center">
              <QrCodeDisplay
                value={order.qrUrl}
                size={175}
                errorCorrectionLevel="M"
              />
            </div>
          </a>

          {/* ── Waiting for Payment Status ── */}
          <div className="mt-2.5 flex items-center justify-center gap-2 text-[#442713] text-xs font-medium">
            <Loader2 className="w-3.5 h-3.5 text-[#A5754A] animate-spin" />
            <span className="font-semibold">Waiting for payment…</span>
          </div>

          {/* Simulated Payment Link for Testing & Verification */}
          <div className="mt-2.5 pt-2 border-t border-stone-200/50 w-full flex flex-col items-center gap-1">
            <a
              href={`/pay/${order.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white hover:bg-[#442713] text-[#A5754A] hover:text-white text-[11px] font-semibold shadow-2xs hover:shadow-xs transition-all duration-200 cursor-pointer"
            >
              <span>Open simulated payment page</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

        </div>
      </div>
    </div>
  );
};
