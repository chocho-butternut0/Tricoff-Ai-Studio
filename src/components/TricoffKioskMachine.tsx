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
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 md:px-8 py-3 md:py-5 w-full max-h-screen">
        <div className="w-full max-w-5xl xl:max-w-6xl mx-auto my-auto flex flex-col justify-center">

          {/* ════════════════════════════════════════════════
              STATE 1: IDLE / PRODUCT SELECTION GRID
              (Modeled faithfully from the reference card style)
          ════════════════════════════════════════════════ */}
          {showSelection && !(orderStatus === 'failed') && (
            <div className="space-y-4 md:space-y-6 animate-in fade-in duration-300 w-full my-auto">
              {/* Hero Banner Intro */}
              <div className="text-center max-w-2xl mx-auto space-y-1.5 md:space-y-2">
                <div className="flex items-center justify-center pb-0.5">
                  <img
                    src={tricoffLogo}
                    alt="TRICOFF Coffee"
                    className="h-11 sm:h-13 md:h-14 w-auto object-contain drop-shadow-xs"
                  />
                </div>
                <h1 className="font-serif-display text-3xl sm:text-4xl lg:text-[40px] font-bold text-[#442713] tracking-tight leading-tight">
                  Select your coffee
                </h1>
                <p className="text-[#644B37] text-xs sm:text-sm leading-relaxed max-w-lg mx-auto">
                  Touch a craft brew to place your order. Instant QR payment activates our precision airpot dispenser.
                </p>
              </div>

              {/* 3-Column Drink Cards with Reference Card Style */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 items-stretch">
                {DRINKS.map((drink) => {
                  const disabled = (!machineOnline && !esp32Mock) || isCreating;
                  const isLoading = isCreating && pendingDrinkId === drink.id;

                  return (
                    <article
                      key={drink.id}
                      onClick={() => !disabled && handleSelect(drink.id)}
                      className={`group relative rounded-[30px] sm:rounded-[34px] bg-[#FAF7F2] hover:bg-[#442713] p-3 sm:p-3.5 shadow-[0_8px_24px_rgba(68,39,19,0.06)] hover:shadow-[0_20px_40px_rgba(68,39,19,0.28)] transition-all duration-300 flex flex-col justify-between text-left cursor-pointer ${
                        disabled ? 'opacity-60 pointer-events-none' : 'hover:-translate-y-1.5'
                      }`}
                    >
                      {/* Top Media Frame with Coffee-tinted Backdrop & Organic Curved Layer */}
                      <div className="relative rounded-[22px] sm:rounded-[26px] overflow-hidden bg-gradient-to-b from-white to-[#EDE5D8] group-hover:from-[#5A3820] group-hover:to-[#442713] transition-colors duration-300 flex flex-col items-center justify-between pt-3 pb-0 aspect-[4/3] sm:aspect-[4/3.1] select-none">
                        
                        {/* Slot Badge in Top-Left (no harsh outline) */}
                        <div className="absolute top-2.5 left-2.5 z-10">
                          <span className="font-mono text-[10px] sm:text-[11px] font-bold text-[#442713] group-hover:text-white bg-white/95 group-hover:bg-black/35 backdrop-blur-xs px-2.5 py-0.5 rounded-full shadow-2xs transition-colors duration-300">
                            Slot {drink.slot}
                          </span>
                        </div>

                        {/* Beverage Cup Image with Gentle Hover Depth */}
                        <div className="relative w-full h-full flex items-center justify-center p-2 z-0">
                          <ResilientImage
                            src={drink.image}
                            alt={`${drink.name} served in a white paper TRICOFF cup`}
                            fallbackTitle={drink.name}
                            className="w-full h-full max-h-36 sm:max-h-40 md:max-h-44 object-contain drop-shadow-[0_10px_18px_rgba(68,39,19,0.16)] group-hover:scale-105 group-hover:-translate-y-1 transition-transform duration-500 ease-out"
                          />
                        </div>

                        {/* Layered Curved Ribbon across bottom of photo container (no outline) */}
                        <div className="w-full bg-[#B18A61]/20 group-hover:bg-black/30 backdrop-blur-xs text-[#442713] group-hover:text-white/90 text-[10px] sm:text-[11px] font-medium py-1.5 px-3 text-center flex items-center justify-center gap-1.5 z-10 transition-colors duration-300">
                          <span>{drink.badgeNote}</span>
                        </div>
                      </div>

                      {/* Card Lower Content Area */}
                      <div className="px-1.5 pt-3 pb-0.5 flex flex-col flex-1 justify-between">
                        <div>
                          {/* Drink Title & Price on the Side */}
                          <div className="flex items-start justify-between gap-3 mb-1">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-sans text-lg sm:text-xl font-bold text-[#442713] group-hover:text-white tracking-tight transition-colors duration-300 leading-tight">
                                {drink.name}
                              </h3>
                              <p className="text-xs text-[#644B37] group-hover:text-[#D8C7B5] font-medium line-clamp-1 mt-0.5 transition-colors duration-300">
                                {drink.subtitle}
                              </p>
                            </div>

                            <div className="shrink-0 flex items-center gap-1.5 pt-0.5">
                              {isLoading ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#A5754A] group-hover:text-[#E8DEC8]">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                </span>
                              ) : (
                                <span className="font-sans font-black text-2xl sm:text-[26px] text-[#442713] group-hover:text-white tracking-tight tabular-nums leading-none transition-colors duration-300">
                                  {drink.price}₱
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Tactile Pills Row (Zero outline, clean soft pills) */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-2 mt-1">
                          {drink.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-white/90 text-[#644B37] group-hover:bg-white/15 group-hover:text-white/95 shadow-2xs transition-colors duration-300"
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
            <div className="max-w-3xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in zoom-in-98 duration-200 text-center my-auto">
              
              {/* Screen Title & Countdown */}
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#FAF7F2] text-[#644B37] text-xs font-semibold">
                  <span>Step 1 of 2 · Payment Method</span>
                </div>

                <h2 className="font-serif-display text-3xl sm:text-4xl font-bold text-[#442713] tracking-tight">
                  Select a payment method
                </h2>
                
                <p className="text-sm text-[#644B37] max-w-lg mx-auto">
                  Ordering <strong className="text-[#442713]">{order.drinkName}</strong> (₱{order.price}.00) for{' '}
                  <strong className="text-[#A5754A]">Slot {order.slot}</strong>. Choose a payment option to generate your QR code.
                </p>

                {idleSecondsLeft !== null && (
                  <p className="text-xs font-mono text-[#B18A61] tabular-nums flex items-center justify-center gap-1.5 pt-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Expires in {Math.floor(idleSecondsLeft / 60)}:{String(idleSecondsLeft % 60).padStart(2, '0')}</span>
                  </p>
                )}
              </div>

              {/* ── Two Prominent Touchscreen Options ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                
                {/* 1. QRPH Option Card */}
                <button
                  type="button"
                  onClick={() => handleSelectRail('QRPh')}
                  className="group relative p-6 sm:p-8 rounded-[32px] bg-[#FAF7F2] hover:bg-[#F2ECE2] shadow-[0_10px_30px_rgba(68,39,19,0.06)] hover:shadow-[0_20px_40px_rgba(68,39,19,0.12)] transition-all duration-200 cursor-pointer flex flex-col justify-between hover:-translate-y-1"
                >
                  <div>
                    {/* Header: Logo mark + price tag */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="px-3.5 py-1.5 rounded-xl bg-blue-50 flex items-center gap-1.5">
                        <span className="font-extrabold text-base tracking-wider leading-none">
                          <span className="text-[#0038A8]">QR</span>
                          <span className="text-[#CE1126]">Ph</span>
                        </span>
                        <div className="w-2.5 h-1 rounded-full bg-[#FCD116]" />
                      </div>
                      <span className="font-mono text-2xl font-bold text-[#442713] tabular-nums">
                        ₱{order.price}.00
                      </span>
                    </div>

                    <h3 className="font-serif-display text-2xl font-bold text-[#442713] group-hover:text-[#A5754A] transition-colors">
                      QRPh Standard
                    </h3>
                    
                    <p className="text-xs text-[#B18A61] font-semibold mt-1 mb-3">
                      National QR Standard · All BSP E-Wallets & Banks
                    </p>

                    <p className="text-xs text-[#644B37] leading-relaxed">
                      Pay instantly with GCash, Maya, ShopeePay, GoTyme, GrabPay, BPI Vybe, and any BSP-licensed QRPh app.
                    </p>
                  </div>
                </button>

                {/* 2. InstaPay Option Card */}
                <button
                  type="button"
                  onClick={() => handleSelectRail('InstaPay')}
                  className="group relative p-6 sm:p-8 rounded-[32px] bg-[#FAF7F2] hover:bg-[#F2ECE2] shadow-[0_10px_30px_rgba(68,39,19,0.06)] hover:shadow-[0_20px_40px_rgba(68,39,19,0.12)] transition-all duration-200 cursor-pointer flex flex-col justify-between hover:-translate-y-1"
                >
                  <div>
                    {/* Header: Logo mark + price tag */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="px-3.5 py-1.5 rounded-xl bg-red-50 flex items-center gap-1">
                        <span className="font-extrabold text-sm text-[#00529B] leading-none">insta</span>
                        <span className="font-black text-sm text-[#E11931] leading-none">Pay</span>
                      </div>
                      <span className="font-mono text-2xl font-bold text-[#442713] tabular-nums">
                        ₱{order.price}.00
                      </span>
                    </div>

                    <h3 className="font-serif-display text-2xl font-bold text-[#442713] group-hover:text-[#A5754A] transition-colors">
                      InstaPay Transfer
                    </h3>

                    <p className="text-xs text-[#B18A61] font-semibold mt-1 mb-3">
                      Direct Mobile Banking · Universal Interbank QR
                    </p>

                    <p className="text-xs text-[#644B37] leading-relaxed">
                      Pay using BDO Pay, BPI, UnionBank, Metrobank, LandBank, RCBC, Chinabank, and all participating InstaPay apps.
                    </p>
                  </div>
                </button>

              </div>

              {/* Cancel Order Action */}
              <div className="pt-4 flex justify-center">
                <button
                  type="button"
                  onClick={handleReset}
                  className="py-3 px-6 rounded-2xl bg-[#FAF7F2] hover:bg-[#F2ECE2] text-[#644B37] hover:text-[#442713] text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
                >
                  <X className="w-4 h-4" />
                  <span>Cancel Order</span>
                </button>
              </div>

            </div>
          )}

          {/* ════════════════════════════════════════════════
              STATE 2B: ORDER CREATED — STEP 2: SIMPLIFIED QR PAYMENT SCREEN
              (Shows ONLY the selected payment method, with Back button,
               quiet zone QR, scanner frame, and waiting state)
          ════════════════════════════════════════════════ */}
          {orderStatus === 'created' && order && paymentStep === 'qr' && (
            <div className="w-full max-w-lg sm:max-w-xl mx-auto rounded-[32px] sm:rounded-[36px] bg-[#FAF7F2] shadow-[0_20px_50px_rgba(68,39,19,0.1)] overflow-hidden animate-in fade-in duration-200 my-auto">
              
              {/* Header Navigation: Back + Cancel */}
              <div className="px-6 py-3 bg-[#F2ECE2] flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleBackToSelect}
                  className="inline-flex items-center gap-1.5 py-1 px-3 rounded-lg text-[#644B37] hover:text-[#442713] hover:bg-white/70 transition-colors text-xs font-semibold cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Change method</span>
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1 py-1 px-3 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors text-xs font-medium cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>
              </div>

              {/* Main QR Screen Body */}
              <div className="px-6 py-5 sm:px-8 sm:py-6 flex flex-col items-center text-center">
                
                {/* Method Identification Badge */}
                <div className="mb-2">
                  {selectedRail === 'QRPh' ? (
                    <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-blue-50">
                      <span className="font-extrabold text-[11px] tracking-wider">
                        <span className="text-[#0038A8]">QR</span>
                        <span className="text-[#CE1126]">Ph</span>
                      </span>
                      <span className="text-stone-300">·</span>
                      <span className="text-[11px] font-medium text-[#442713]">National QR Standard</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-red-50">
                      <span className="font-extrabold text-[11px] tracking-wider">
                        <span className="text-[#00529B]">insta</span>
                        <span className="text-[#E11931]">Pay</span>
                      </span>
                      <span className="text-stone-300">·</span>
                      <span className="text-[11px] font-medium text-[#442713]">Instant Bank Transfer</span>
                    </div>
                  )}
                </div>

                {/* Primary Heading */}
                <h2 className="font-sans text-2xl sm:text-[26px] font-bold text-[#442713] tracking-tight">
                  Scan to Pay
                </h2>

                {/* Specific Method Instruction */}
                <p className="text-xs sm:text-sm text-[#644B37] mt-0.5 max-w-sm">
                  {selectedRail === 'QRPh'
                    ? 'Scan using your banking or e-wallet app.'
                    : 'Scan using your supported banking app.'}
                </p>

                {/* Prominent Amount */}
                <div className="my-3 px-5 py-2 rounded-xl bg-white shadow-2xs flex items-baseline justify-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-[#644B37]">
                    Total Amount
                  </span>
                  <span className="font-mono text-2xl sm:text-3xl font-black text-[#442713] tabular-nums">
                    ₱{order.price}.00
                  </span>
                </div>

                {/* QR Code Container with Scanner Reticle Frame */}
                <div className="relative p-3.5 bg-white rounded-2xl shadow-sm">
                  {/* Animated Scanner Corner Brackets in Coffee Caramel */}
                  <div className="absolute top-1.5 left-1.5 w-4 h-4 border-t-2 border-l-2 border-[#A5754A] rounded-tl-sm" />
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 border-t-2 border-r-2 border-[#A5754A] rounded-tr-sm" />
                  <div className="absolute bottom-1.5 left-1.5 w-4 h-4 border-b-2 border-l-2 border-[#A5754A] rounded-bl-sm" />
                  <div className="absolute bottom-1.5 right-1.5 w-4 h-4 border-b-2 border-r-2 border-[#A5754A] rounded-br-sm" />

                  {/* Gentle pulsing scanning line */}
                  <div className="absolute inset-x-3 top-3 h-0.5 bg-gradient-to-r from-transparent via-[#A5754A] to-transparent opacity-75 animate-pulse pointer-events-none" />

                  {/* Scannable QR Matrix */}
                  <div className="flex items-center justify-center">
                    <QrCodeDisplay
                      value={order.qrUrl}
                      size={200}
                      errorCorrectionLevel="M"
                    />
                  </div>
                </div>

                {/* Waiting State Indicator */}
                <div className="mt-3.5 flex items-center justify-center gap-2 text-[#442713] text-xs font-semibold">
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
            <div className="max-w-lg mx-auto rounded-[36px] bg-[#FAF7F2] shadow-xl p-8 sm:p-10 text-center space-y-6 animate-in zoom-in-95 duration-300 my-auto">
              <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-100/70 text-emerald-900 text-xs font-semibold">
                  <span>Brewing Complete</span>
                </div>
                <h2 className="font-serif-display text-3xl sm:text-4xl font-bold text-[#442713]">
                  Your coffee is ready!
                </h2>
                <p className="text-sm text-[#644B37]">
                  Please collect your freshly brewed cup from <strong className="text-[#442713]">Slot {order.slot}</strong>.
                </p>
              </div>

              {/* Order receipt mini pill */}
              <div className="p-4 rounded-2xl bg-white shadow-2xs text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[#644B37]">Drink</span>
                  <span className="font-semibold text-[#442713]">{order.drinkName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#644B37]">Cup Slot</span>
                  <span className="font-mono font-bold text-[#A5754A]">Slot {order.slot}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#644B37]">Amount</span>
                  <span className="font-mono tabular-nums text-[#442713] font-bold">₱{order.price}.00 (Settled)</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="w-full py-4 px-6 rounded-2xl bg-[#442713] hover:bg-[#644B37] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Start New Order</span>
              </button>

              <p className="text-xs text-[#B18A61]">
                Kiosk automatically returns to menu in a few seconds…
              </p>
            </div>
          )}

          {/* ════════════════════════════════════════════════
              STATE 5: FAILED / CANCELLED
          ════════════════════════════════════════════════ */}
          {orderStatus === 'failed' && order && (
            <div className="max-w-md mx-auto rounded-[36px] bg-[#FAF7F2] shadow-xl p-8 sm:p-10 text-center space-y-6 animate-in zoom-in-95 duration-200 my-auto">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto">
                <XCircle className="w-8 h-8 text-red-500" />
              </div>

              <div className="space-y-1.5">
                <h2 className="font-serif-display text-2xl font-bold text-[#442713]">
                  Payment cancelled
                </h2>
                <p className="text-xs text-[#644B37]">
                  No coffee was dispensed and no charges were made.
                </p>
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="w-full py-3.5 px-6 rounded-2xl bg-[#442713] hover:bg-[#644B37] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
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
