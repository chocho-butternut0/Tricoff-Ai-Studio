import React from 'react';
import { ArrowLeft, X, ShieldCheck, Loader2, ExternalLink } from 'lucide-react';
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
      <div className="w-full max-w-lg rounded-3xl bg-[#FAF8F5] text-stone-900 border border-stone-200/90 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* ── Top Bar with Back and Cancel ── */}
        <div className="px-6 py-4 bg-white border-b border-stone-200/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 py-2 px-3 rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors text-xs font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Change payment method</span>
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors text-xs font-medium cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Cancel order</span>
          </button>
        </div>

        {/* ── Main Content ── */}
        <div className="p-6 sm:p-8 flex flex-col items-center text-center">
          
          {/* Rail Identity Badge */}
          <div className="mb-3">
            {isQrPh ? (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200/80 text-blue-900">
                <span className="font-extrabold text-xs tracking-wider">
                  <span className="text-[#0038A8]">QR</span>
                  <span className="text-[#CE1126]">Ph</span>
                </span>
                <span className="text-stone-300">·</span>
                <span className="text-xs font-medium text-stone-700">National QR Standard</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-50 border border-red-200/80 text-red-900">
                <span className="font-extrabold text-xs tracking-wider">
                  <span className="text-[#00529B]">insta</span>
                  <span className="text-[#E11931]">Pay</span>
                </span>
                <span className="text-stone-300">·</span>
                <span className="text-xs font-medium text-stone-700">Instant Bank Transfer</span>
              </div>
            )}
          </div>

          {/* Heading */}
          <h2 id="qr-payment-heading" className="font-serif-display text-2xl sm:text-3xl font-bold text-stone-900">
            Scan to Pay
          </h2>

          {/* Specific Instruction */}
          <p className="text-xs sm:text-sm text-stone-600 mt-1 max-w-sm">
            {isQrPh
              ? 'Scan the QRPH code using your banking or e-wallet app.'
              : 'Scan the InstaPay QR code using your supported banking app.'}
          </p>

          {/* Amount Badge */}
          <div className="my-5 px-6 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-baseline justify-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-amber-800">
              Total Amount
            </span>
            <span className="font-mono text-3xl font-bold text-amber-700 tabular-nums">
              ₱{order.price}.00
            </span>
          </div>

          {/* ── QR Container with Scanning Reticle & Quiet Zone ── */}
          <div className="relative p-5 sm:p-6 bg-white rounded-2xl border border-stone-200 shadow-md">
            {/* Animated corner scanner brackets */}
            <div className="absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-amber-500 rounded-tl-md" />
            <div className="absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-amber-500 rounded-tr-md" />
            <div className="absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-amber-500 rounded-bl-md" />
            <div className="absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-amber-500 rounded-br-md" />

            {/* Subtle animated scanning beam indicator */}
            <div className="absolute inset-x-4 top-4 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent opacity-70 animate-pulse pointer-events-none" />

            {/* Scannable QR Code */}
            <div className="flex items-center justify-center">
              <QrCodeDisplay
                value={order.qrUrl}
                size={230}
                errorCorrectionLevel="M"
              />
            </div>
          </div>

          {/* ── Waiting for Payment Status ── */}
          <div className="mt-5 flex items-center justify-center gap-2 text-stone-600 text-xs font-medium">
            <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
            <span className="text-stone-800 font-semibold">Waiting for payment…</span>
            <span className="text-stone-400">machine unlocks automatically</span>
          </div>

          {/* Supported Apps List */}
          <div className="mt-4 p-3 rounded-xl bg-stone-100/80 border border-stone-200/70 w-full max-w-sm text-[11px] text-stone-600">
            <p className="font-semibold text-stone-800 mb-0.5">
              {isQrPh ? 'Supported E-Wallets & Banks:' : 'Supported Banking Apps:'}
            </p>
            <p className="text-stone-500 leading-relaxed">
              {isQrPh
                ? 'GCash · Maya · ShopeePay · GoTyme · BPI Vybe · GrabPay · All BSP QRPh apps'
                : 'BDO Pay · BPI · UnionBank · Metrobank · LandBank · RCBC · Chinabank · Any InstaPay app'}
            </p>
          </div>

          {/* Interactive Phone Simulation Link for Testing */}
          <div className="mt-4 pt-3 border-t border-stone-200/70 w-full flex flex-col items-center">
            <a
              href={order.qrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 font-medium underline underline-offset-2 transition-colors cursor-pointer"
            >
              <span>Test checkout in browser (simulated payment)</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <p className="text-[10px] text-stone-400 mt-1 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-stone-500" />
              <span>Simulated QR payment · No real charges will be made</span>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};
