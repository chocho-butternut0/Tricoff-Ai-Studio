import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  X,
  Loader2,
  ArrowLeft,
  Clock,
} from 'lucide-react';
import tricoffLogo from '../assets/images/tricoff_logo.svg';
import type { DrinkId } from '../data/tricoffData';
import { DRINKS, VOLUME_ML } from '../data/tricoffData';
import type { KioskSnapshot, Order } from '../hooks/useTricoffBroker';
import { ResilientImage } from './ResilientImage';
import { QrCodeDisplay } from './QrCodeDisplay';
import { CoffeeBrewingPourAnimation } from './CoffeeBrewingPourAnimation';
import type { PaymentRail } from './PaymentQrPopupModal';

interface TricoffKioskMachineProps {
  snapshot: KioskSnapshot;
  wsConnected: boolean;
  onCreateOrder: (drink: DrinkId) => Promise<Order | null>;
  onReset: () => Promise<void>;
}

export const TricoffKioskMachine: React.FC<TricoffKioskMachineProps> = ({
  snapshot,
  wsConnected,
  onCreateOrder,
  onReset,
}) => {
  const { machineOnline, activeOrder, esp32Mock } = snapshot;
  const [isCreating, setIsCreating] = useState(false);
  const [pendingDrinkId, setPendingDrinkId] = useState<DrinkId | null>(null);

  // Two-step payment flow: 'select' (choose rail) -> 'qr' (scan single QR)
  const [paymentStep, setPaymentStep] = useState<'select' | 'qr'>('select');
  const [selectedRail, setSelectedRail] = useState<PaymentRail>('QRPh');

  const order = activeOrder;
  const orderStatus = order?.status ?? null;
  const isIdle = !order || orderStatus === null;
  const showSelection = isIdle || orderStatus === 'failed';

  // Reset internal payment step when order is cleared or transitions
  useEffect(() => {
    if (!order || orderStatus !== 'created') {
      setPaymentStep('select');
    }
  }, [order, orderStatus]);

  // Auto-reset 8 s after done
  useEffect(() => {
    if (orderStatus === 'done') {
      const timer = setTimeout(() => onReset(), 8000);
      return () => clearTimeout(timer);
    }
  }, [orderStatus, onReset]);

  // Idle timeout: cancel a 'created' order after 3 minutes of no payment
  const IDLE_TIMEOUT_MS = 3 * 60 * 1000;
  const [idleSecondsLeft, setIdleSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (orderStatus !== 'created') {
      setIdleSecondsLeft(null);
      return;
    }
    const totalSecs = Math.round(IDLE_TIMEOUT_MS / 1000);
    setIdleSecondsLeft(totalSecs);

    const tick = setInterval(() => {
      setIdleSecondsLeft((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    const cancel = setTimeout(() => {
      onReset();
    }, IDLE_TIMEOUT_MS);

    return () => {
      clearInterval(tick);
      clearTimeout(cancel);
      setIdleSecondsLeft(null);
    };
  }, [orderStatus, onReset]);

  const handleSelect = async (drink: DrinkId) => {
    if (!machineOnline && !esp32Mock) return;
    if (isCreating) return;
    setPendingDrinkId(drink);
    setIsCreating(true);
    await onCreateOrder(drink);
    setIsCreating(false);
    setPendingDrinkId(null);
    setPaymentStep('select');
  };

  const handleSelectRail = (rail: PaymentRail) => {
    setSelectedRail(rail);
    setPaymentStep('qr');
  };

  const handleBackToSelect = () => {
    setPaymentStep('select');
  };

  const handleReset = async () => {
    setPaymentStep('select');
    await onReset();
  };

  return (
    <div className="h-screen w-screen overflow-y-auto lg:overflow-hidden bg-white text-[#442713] flex flex-col font-sans selection:bg-[#E8DEC8]">
      
      {/* Offline Alert Banner */}
      {!machineOnline && !esp32Mock && (
        <div className="px-6 py-2 bg-red-50 border-b border-red-200 text-center shrink-0">
          <p className="text-xs sm:text-sm text-red-700 font-medium">
            Machine currently unavailable. Waiting for hardware controller reconnect.
          </p>
        </div>
      )}

      {/* ── Main Kiosk Stage ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 md:px-8 py-3 md:py-4 w-full max-h-screen">
        <div className="w-full max-w-4xl lg:max-w-[960px] mx-auto my-auto flex flex-col justify-center">

          {/* ════════════════════════════════════════════════
              STATE 1: IDLE / PRODUCT SELECTION GRID
              (Modeled faithfully from the reference card style)
          ════════════════════════════════════════════════ */}
          {showSelection && !(orderStatus === 'failed') && (
            <div className="space-y-3.5 sm:space-y-4 animate-in fade-in duration-300 w-full my-auto">
              {/* Hero Banner Intro */}
              <div className="text-center max-w-xl mx-auto space-y-1">
                <div className="flex items-center justify-center pb-0.5">
                  <img
                    src={tricoffLogo}
                    alt="TRICOFF Coffee"
                    className="h-10 sm:h-12 w-auto object-contain drop-shadow-xs"
                  />
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FAF7F2] text-[#644B37] text-sm font-semibold shadow-xs mb-0.5">
                  <span>Step 1</span>
                </div>
                <h1 className="font-serif-display text-2xl sm:text-3xl lg:text-[34px] font-bold text-[#442713] tracking-tight leading-tight">
                  Select your coffee
                </h1>
                <p className="text-[#644B37] text-xs sm:text-[13px] leading-relaxed max-w-md mx-auto">
                  Touch a craft brew to place your order.
                </p>
              </div>

              {/* 3-Column Drink Cards with Clean Modern Card Style */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4 lg:gap-5 items-stretch">
                {DRINKS.map((drink) => {
                  const disabled = (!machineOnline && !esp32Mock) || isCreating;
                  const isLoading = isCreating && pendingDrinkId === drink.id;

                  return (
                    <article
                      key={drink.id}
                      onClick={() => !disabled && handleSelect(drink.id)}
                      className={`group relative rounded-[24px] sm:rounded-[28px] bg-[#FAF7F2] hover:bg-[#442713] p-2.5 sm:p-3 shadow-[0_10px_25px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_18px_38px_rgba(0,0,0,0.16),0_4px_12px_rgba(0,0,0,0.08)] transition-all duration-300 ease-out flex flex-col justify-between text-left cursor-pointer ${
                        disabled ? 'opacity-60 pointer-events-none' : 'hover:-translate-y-1'
                      }`}
                    >
                      {/* Top Media Frame: Square with rounded corners, picture takes the entire space */}
                      <div className="relative rounded-[18px] sm:rounded-[22px] overflow-hidden aspect-square select-none w-full bg-[#EDE5D8]">
                        
                        {/* Beverage Cup Image taking the whole space of the square with rounded corners */}
                        <ResilientImage
                          src={drink.image}
                          alt={`${drink.name} served in a white paper TRICOFF cup`}
                          fallbackTitle={drink.name}
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                        />

                        {/* Slot Badge in Top-Left (clean sans font, no monospace) */}
                        <div className="absolute top-2.5 left-2.5 z-10">
                          <span className="font-sans text-[11px] sm:text-xs font-semibold text-[#442713] group-hover:text-white bg-white/95 group-hover:bg-black/40 backdrop-blur-xs px-2.5 py-0.5 rounded-full shadow-xs transition-colors duration-300">
                            Slot {drink.slot}
                          </span>
                        </div>

                        {/* Layered Curved Ribbon across bottom of photo container */}
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent text-white text-[10px] sm:text-[11px] font-medium pt-5 pb-2 px-3 text-center flex items-center justify-center gap-1.5 z-10 transition-colors duration-300">
                          <span className="drop-shadow-xs">{drink.badgeNote}</span>
                        </div>
                      </div>

                      {/* Card Lower Content Area */}
                      <div className="px-1 pt-2.5 pb-0.5 flex flex-col flex-1 justify-between gap-2">
                        <div>
                          {/* Drink Title & Price on the Side */}
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-sans text-base sm:text-lg font-bold text-[#442713] group-hover:text-white tracking-tight transition-colors duration-300 leading-snug">
                                {drink.name}
                              </h3>
                            </div>

                            <div className="shrink-0 flex items-center gap-1">
                              {isLoading ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#A5754A] group-hover:text-[#E8DEC8]">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                </span>
                              ) : (
                                <span className="font-sans font-extrabold text-xl sm:text-[22px] text-[#442713] group-hover:text-white tracking-tight tabular-nums leading-none transition-colors duration-300">
                                  ₱{drink.price}.00
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Complete Product Description (natural wrap, fully visible) */}
                          <p className="text-[11px] sm:text-xs text-[#644B37] group-hover:text-[#EDE5D8] leading-relaxed transition-colors duration-300">
                            {drink.description}
                          </p>
                        </div>

                        {/* Tactile Pills Row (without divider outline) */}
                        <div className="flex flex-wrap items-center gap-1 pt-2 mt-auto transition-colors duration-300">
                          {drink.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/90 text-[#644B37] group-hover:bg-white/15 group-hover:text-white/95 shadow-2xs transition-colors duration-300"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════
              STATE 2A: ORDER CREATED — STEP 1: SELECT PAYMENT METHOD
              (Clean, non-cluttered, two large touchscreen options)
          ════════════════════════════════════════════════ */}
          {orderStatus === 'created' && order && paymentStep === 'select' && (
            <div className="max-w-2xl mx-auto space-y-5 sm:space-y-6 animate-in fade-in zoom-in-98 duration-200 text-center my-auto">
              
              {/* Screen Title & Countdown */}
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FAF7F2] text-[#644B37] text-sm font-semibold shadow-xs">
                  <span>Step 2</span>
                </div>

                <h2 className="font-serif-display text-2xl sm:text-3xl font-bold text-[#442713] tracking-tight">
                  Select payment method
                </h2>
                
                <p className="text-xs sm:text-sm text-[#644B37] max-w-md mx-auto">
                  Ordering <strong className="text-[#442713]">{order.drinkName}</strong> (₱{order.price}.00) for{' '}
                  <strong className="text-[#A5754A]">Slot {order.slot}</strong>. 
                </p>
                <p className="text-xs sm:text-sm text-[#644B37] max-w-md mx-auto">Choose a payment option to generate your QR code.</p>
                {idleSecondsLeft !== null && (
                  <p className="text-xs font-sans text-[#B18A61] tabular-nums flex items-center justify-center gap-1.5 pt-0.5 font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Expires in {Math.floor(idleSecondsLeft / 60)}:{String(idleSecondsLeft % 60).padStart(2, '0')}</span>
                  </p>
                )}
              </div>

              {/* ── Two Prominent Touchscreen Options (Spacious & Balanced) ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 max-w-2xl mx-auto text-left items-stretch">
                
                {/* 1. QRPH Option Card */}
                <button
                  type="button"
                  onClick={() => handleSelectRail('QRPh')}
                  className="group relative p-6 sm:p-7 rounded-[26px] sm:rounded-[28px] bg-[#FAF7F2] hover:bg-[#442713] shadow-[0_10px_25px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_18px_38px_rgba(0,0,0,0.16),0_4px_12px_rgba(0,0,0,0.08)] transition-all duration-300 ease-out cursor-pointer flex flex-col justify-between hover:-translate-y-1 min-h-[260px]"
                >
                  <div>
                    {/* Header: Logo mark + price tag */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="px-3 py-1.5 rounded-xl bg-white group-hover:bg-white/15 flex items-center gap-1.5 shadow-2xs transition-colors duration-300">
                        <span className="font-extrabold text-sm tracking-wider leading-none">
                          <span className="text-[#0038A8] group-hover:text-white">QR</span>
                          <span className="text-[#CE1126] group-hover:text-[#FFA3AE]">Ph</span>
                        </span>
                        <div className="w-2 h-1 rounded-full bg-[#FCD116]" />
                      </div>
                      <span className="font-sans font-extrabold text-xl sm:text-2xl text-[#442713] group-hover:text-white tabular-nums transition-colors duration-300">
                        ₱{order.price}.00
                      </span>
                    </div>

                    <h3 className="font-serif-display text-xl sm:text-2xl font-bold text-[#442713] group-hover:text-white transition-colors duration-300 leading-snug">
                      QRPh Standard
                    </h3>
                    
                    <p className="text-xs text-[#A5754A] group-hover:text-[#E8DEC8] font-semibold mt-1 mb-2.5 transition-colors duration-300">
                      National QR Standard · All BSP E-Wallets & Banks
                    </p>

                    <p className="text-xs text-[#644B37] group-hover:text-[#EDE5D8] leading-relaxed transition-colors duration-300">
                      Pay instantly with GCash, Maya, ShopeePay, GoTyme, GrabPay, BPI Vybe, and any BSP-licensed QRPh app.
                    </p>
                  </div>
                </button>

                {/* 2. InstaPay Option Card */}
                <button
                  type="button"
                  onClick={() => handleSelectRail('InstaPay')}
                  className="group relative p-6 sm:p-7 rounded-[26px] sm:rounded-[28px] bg-[#FAF7F2] hover:bg-[#442713] shadow-[0_10px_25px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_18px_38px_rgba(0,0,0,0.16),0_4px_12px_rgba(0,0,0,0.08)] transition-all duration-300 ease-out cursor-pointer flex flex-col justify-between hover:-translate-y-1 min-h-[260px]"
                >
                  <div>
                    {/* Header: Logo mark + price tag */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="px-3 py-1.5 rounded-xl bg-white group-hover:bg-white/15 flex items-center gap-1 shadow-2xs transition-colors duration-300">
                        <span className="font-extrabold text-xs text-[#00529B] group-hover:text-[#90CDF4] leading-none">insta</span>
                        <span className="font-black text-xs text-[#E11931] group-hover:text-[#FEB2B2] leading-none">Pay</span>
                      </div>
                      <span className="font-sans font-extrabold text-xl sm:text-2xl text-[#442713] group-hover:text-white tabular-nums transition-colors duration-300">
                        ₱{order.price}.00
                      </span>
                    </div>

                    <h3 className="font-serif-display text-xl sm:text-2xl font-bold text-[#442713] group-hover:text-white transition-colors duration-300 leading-snug">
                      InstaPay Transfer
                    </h3>

                    <p className="text-xs text-[#A5754A] group-hover:text-[#E8DEC8] font-semibold mt-1 mb-2.5 transition-colors duration-300">
                      Direct Mobile Banking · Universal Interbank QR
                    </p>

                    <p className="text-xs text-[#644B37] group-hover:text-[#EDE5D8] leading-relaxed transition-colors duration-300">
                      Pay using BDO Pay, BPI, UnionBank, Metrobank, LandBank, RCBC, Chinabank, and all participating InstaPay apps.
                    </p>
                  </div>
                </button>

              </div>

              {/* Cancel Order Action */}
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  onClick={handleReset}
                  className="py-2.5 px-6 rounded-2xl bg-[#FAF7F2] hover:bg-[#442713] text-[#644B37] hover:text-white text-xs font-semibold flex items-center gap-2 transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md hover:-translate-y-0.5"
                >
                  <X className="w-4 h-4" />
                  <span>Cancel Order</span>
                </button>
              </div>

            </div>
          )}

          {/* ════════════════════════════════════════════════
              STATE 2B: ORDER CREATED — STEP 3: SIMPLIFIED QR PAYMENT SCREEN
              (Compact width card, transparent total amount, quiet zone QR,
               and waiting state)
          ════════════════════════════════════════════════ */}
          {orderStatus === 'created' && order && paymentStep === 'qr' && (
            <div className="w-full max-w-[340px] sm:max-w-[360px] mx-auto rounded-[26px] sm:rounded-[30px] bg-[#EFE36E] shadow-[0_16px_36px_rgba(0,0,0,0.09),0_4px_12px_rgba(0,0,0,0.05)] overflow-hidden animate-in fade-in duration-200 my-auto">
              
              {/* Header Navigation: Back + Cancel (clean, no divider line) */}
              <div className="px-4 py-2 sm:px-5 sm:py-2.5 bg-[#F2ECE2] flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleBackToSelect}
                  className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-[#644B37] hover:text-white hover:bg-[#442713] transition-all duration-200 text-xs font-semibold cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1 py-1 px-2.5 rounded-lg text-stone-500 hover:text-white hover:bg-red-700/90 transition-all duration-200 text-xs font-medium cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>
              </div>

              {/* Main QR Screen Body */}
              <div className="px-5 py-3.5 sm:px-6 sm:py-4 flex flex-col items-center text-center">
                
                {/* Step 3 Badge */}
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white text-[#644B37] text-[11px] font-semibold shadow-2xs mb-1.5">
                  <span>Step 3 · Scan to Pay</span>
                </div>

                {/* Method Identification Badge */}
                <div className="mb-1">
                  {selectedRail === 'QRPh' ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-50 shadow-2xs">
                      <span className="font-extrabold text-[11px] tracking-wider">
                        <span className="text-[#0038A8]">QR</span>
                        <span className="text-[#CE1126]">Ph</span>
                      </span>
                      <span className="text-stone-300">·</span>
                      <span className="text-[11px] font-medium text-[#442713]">National QR</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-red-50 shadow-2xs">
                      <span className="font-extrabold text-[11px] tracking-wider">
                        <span className="text-[#00529B]">insta</span>
                        <span className="text-[#E11931]">Pay</span>
                      </span>
                      <span className="text-stone-300">·</span>
                      <span className="text-[11px] font-medium text-[#442713]">Interbank QR</span>
                    </div>
                  )}
                </div>

                {/* Specific Method Instruction */}
                <p className="text-[11px] sm:text-xs text-[#644B37] mt-0.5 max-w-[280px]">
                  {selectedRail === 'QRPh'
                    ? 'Scan using your banking or e-wallet app.'
                    : 'Scan using your supported banking app.'}
                </p>

                {/* Prominent Amount (clean, NO white background box) */}
                <div className="my-1.5 flex items-baseline justify-center gap-1.5">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-[#644B37]">
                    Total Amount:
                  </span>
                  <span className="font-sans font-extrabold text-lg sm:text-xl text-[#442713] tabular-nums">
                    ₱{order.price}.00
                  </span>
                </div>

                {/* QR Code Container with clean white quiet zone (clickable test link) */}
                <a
                  href={`/pay/${order.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Click to open simulated payment page"
                  className="relative p-3 bg-white rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.06)] block cursor-pointer hover:scale-[1.01] transition-transform duration-200"
                >
                  {/* Scannable QR Matrix */}
                  <div className="flex items-center justify-center">
                    <QrCodeDisplay
                      value={order.qrUrl}
                      size={175}
                      errorCorrectionLevel="M"
                    />
                  </div>
                </a>

                {/* Waiting State Indicator */}
                <div className="mt-2.5 flex items-center justify-center gap-2 text-[#442713] text-xs font-semibold">
                  <Loader2 className="w-3.5 h-3.5 text-[#A5754A] animate-spin" />
                  <span>Waiting for payment…</span>
                </div>



              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════
              STATE 3: POURING / BREWING ANIMATION
              (Realistic white paper takeaway cup with TRICOFF logo,
               flowing stream, rising coffee level, and steam)
          ════════════════════════════════════════════════ */}
          {(orderStatus === 'paid' || orderStatus === 'pouring') && order && (
            <div className="py-4 animate-in fade-in duration-300">
              <CoffeeBrewingPourAnimation order={order} volumeMl={VOLUME_ML} />
            </div>
          )}

          {/* ════════════════════════════════════════════════
              STATE 4: DONE — TAKE YOUR COFFEE
          ════════════════════════════════════════════════ */}
          {orderStatus === 'done' && order && (
            <div className="max-w-md mx-auto rounded-[26px] sm:rounded-[30px] bg-[#FAF7F2] shadow-[0_16px_36px_rgba(0,0,0,0.09),0_4px_12px_rgba(0,0,0,0.05)] p-6 sm:p-7 text-center space-y-4 animate-in zoom-in-95 duration-300 my-auto">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto shadow-2xs">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>

              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-100/70 text-emerald-900 text-[11px] font-semibold">
                  <span>Step 5 · Brewing Complete</span>
                </div>
                <h2 className="font-serif-display text-2xl sm:text-3xl font-bold text-[#442713]">
                  Your coffee is ready!
                </h2>
                <p className="text-xs sm:text-sm text-[#644B37]">
                  Please collect your freshly brewed cup from <strong className="text-[#442713]">Slot {order.slot}</strong>.
                </p>
              </div>

              {/* Order receipt mini pill */}
              <div className="p-3.5 rounded-xl bg-white shadow-xs text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[#644B37]">Drink</span>
                  <span className="font-semibold text-[#442713]">{order.drinkName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#644B37]">Cup Slot</span>
                  <span className="font-sans font-semibold text-[#A5754A]">Slot {order.slot}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#644B37]">Amount</span>
                  <span className="font-sans tabular-nums text-[#442713] font-bold">₱{order.price}.00 (Settled)</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="w-full py-3.5 px-6 rounded-2xl bg-[#442713] hover:bg-[#321C0E] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer shadow-md hover:shadow-lg active:scale-[0.99]"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Start New Order</span>
              </button>

              <p className="text-[11px] text-[#B18A61]">
                Kiosk automatically returns to menu in a few seconds…
              </p>
            </div>
          )}

          {/* ════════════════════════════════════════════════
              STATE 5: FAILED / CANCELLED
          ════════════════════════════════════════════════ */}
          {orderStatus === 'failed' && order && (
            <div className="max-w-sm mx-auto rounded-[26px] sm:rounded-[30px] bg-[#EFE36E] shadow-[0_16px_36px_rgba(0,0,0,0.09),0_4px_12px_rgba(0,0,0,0.05)] p-6 sm:p-7 text-center space-y-4 animate-in zoom-in-95 duration-200 my-auto">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto shadow-2xs">
                <XCircle className="w-7 h-7 text-red-500" />
              </div>

              <div className="space-y-1">
                <h2 className="font-serif-display text-xl sm:text-2xl font-bold text-[#442713]">
                  Payment cancelled
                </h2>
                <p className="text-xs text-[#644B37]">
                  No coffee was dispensed and no charges were made.
                </p>
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="w-full py-3.5 px-6 rounded-2xl bg-[#442713] hover:bg-[#321C0E] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md active:scale-[0.99]"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Try Again</span>
              </button>
            </div>
          )}

        </div>
      </main>

    </div>
  );
};
