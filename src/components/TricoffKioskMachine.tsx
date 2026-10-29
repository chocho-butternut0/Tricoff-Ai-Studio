import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  RotateCcw,
  X,
  Loader2,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  ExternalLink,
  Clock,
  Sparkles,
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
    <div className="min-h-screen bg-[#FAF7F2] text-stone-900 flex flex-col font-sans selection:bg-amber-200">
      
      {/* ── Top Bar ── */}
      <header className="px-6 sm:px-10 py-4 bg-white/80 backdrop-blur-md border-b border-stone-200/80 sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img
            src={tricoffLogo}
            alt="TRICOFF Coffee"
            className="h-9 sm:h-10 w-auto"
          />
          <div className="hidden sm:block h-6 w-px bg-stone-200" />
          <p className="text-xs text-stone-500 font-medium tracking-tight hidden sm:block">
            Self-Service Coffee Kiosk · Benguet & Bukidnon Harvest · 240 ml
          </p>
        </div>

        <div className="flex items-center gap-4 sm:gap-6">
          {/* Live machine status */}
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                machineOnline || esp32Mock ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'
              }`}
            />
            <span className="text-xs font-semibold text-stone-700 hidden md:inline">
              {machineOnline || esp32Mock ? 'Kiosk Ready' : 'Machine Offline'}
            </span>
          </div>

          {/* Admin link */}
          <Link
            to="/admin"
            className="text-xs font-medium text-stone-500 hover:text-stone-900 transition-colors py-1.5 px-3 rounded-lg hover:bg-stone-100"
          >
            Admin
          </Link>
        </div>
      </header>

      {/* Offline Alert Banner */}
      {!machineOnline && !esp32Mock && (
        <div className="px-6 py-3 bg-red-50 border-b border-red-200 text-center">
          <p className="text-sm text-red-700 font-medium">
            Machine currently unavailable. Waiting for hardware controller reconnect.
          </p>
        </div>
      )}

      {/* ── Main Kiosk Stage ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 py-8 md:py-12">
        <div className="w-full max-w-6xl mx-auto">

          {/* ════════════════════════════════════════════════
              STATE 1: IDLE / PRODUCT SELECTION GRID
          ════════════════════════════════════════════════ */}
          {showSelection && !(orderStatus === 'failed') && (
            <div className="space-y-8 sm:space-y-10 animate-in fade-in duration-300">
              {/* Hero Banner Intro */}
              <div className="text-center max-w-2xl mx-auto space-y-2.5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100/70 border border-amber-200/70 text-amber-900 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>Freshly Extracted · Automated 240 ml Cups</span>
                </div>
                <h1 className="font-serif-display text-4xl sm:text-5xl font-bold text-stone-900 tracking-tight">
                  Select your coffee
                </h1>
                <p className="text-stone-600 text-sm sm:text-base leading-relaxed">
                  Touch a craft brew to place your order. Instant QR payment activates our precision airpot dispenser.
                </p>
              </div>

              {/* 3-Column Drink Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 items-stretch">
                {DRINKS.map((drink) => {
                  const disabled = (!machineOnline && !esp32Mock) || isCreating;
                  const isLoading = isCreating && pendingDrinkId === drink.id;

                  return (
                    <article
                      key={drink.id}
                      onClick={() => !disabled && handleSelect(drink.id)}
                      className={`group relative rounded-3xl bg-white border border-stone-200/90 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden text-left cursor-pointer ${
                        disabled ? 'opacity-60 pointer-events-none' : 'hover:-translate-y-1'
                      }`}
                    >
                      {/* Slot & Code Header */}
                      <div className="p-4 bg-stone-50/80 border-b border-stone-100 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md font-mono">
                            Slot {drink.slot}
                          </span>
                          <span className="text-stone-400">·</span>
                          <span className="font-mono text-stone-500">{drink.functionCode}</span>
                        </div>
                        <span className="text-stone-500 font-medium">{drink.volume}</span>
                      </div>

                      {/* Branded Product Image Frame */}
                      <div className="relative aspect-[4/3] w-full bg-[#FAF8F5] overflow-hidden flex items-center justify-center p-3">
                        <ResilientImage
                          src={drink.image}
                          alt={`${drink.name} served in a white paper TRICOFF cup`}
                          fallbackTitle={drink.name}
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                        />
                      </div>

                      {/* Card Details */}
                      <div className="p-6 flex flex-col flex-1">
                        <div className="flex items-baseline justify-between gap-3 mb-1">
                          <h3 className="font-serif-display text-2xl font-bold text-stone-900 group-hover:text-amber-800 transition-colors">
                            {drink.name}
                          </h3>
                          <span className="font-mono text-2xl font-extrabold text-amber-700 tabular-nums shrink-0">
                            ₱{drink.price}.00
                          </span>
                        </div>

                        <p className="text-xs font-semibold text-stone-500 mb-2">
                          {drink.subtitle}
                        </p>

                        <p className="text-xs text-stone-600 leading-relaxed mb-4 flex-1">
                          {drink.description}
                        </p>

                        {/* Tasting Notes */}
                        <div className="pt-3 border-t border-stone-100 space-y-1.5 text-xs text-stone-600 mb-5">
                          <div className="flex items-center justify-between">
                            <span className="text-stone-400">Profile</span>
                            <span className="font-medium text-stone-800 truncate max-w-[180px]">
                              {drink.sweetnessProfile}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-stone-400">Notes</span>
                            <span className="text-stone-700 truncate max-w-[180px]">
                              {drink.tastingNotes}
                            </span>
                          </div>
                        </div>

                        {/* Large Touch-friendly Button */}
                        <button
                          type="button"
                          disabled={disabled}
                          className="w-full py-3.5 px-4 rounded-2xl bg-stone-900 group-hover:bg-amber-700 text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Preparing order…</span>
                            </>
                          ) : (
                            <>
                              <span>Select {drink.shortLabel}</span>
                              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </>
                          )}
                        </button>
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
            <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in zoom-in-98 duration-200 text-center">
              
              {/* Screen Title & Countdown */}
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100/70 border border-amber-200/70 text-amber-900 text-xs font-semibold">
                  <span>Step 1 of 2 · Payment Method</span>
                </div>

                <h2 className="font-serif-display text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight">
                  Select a payment method
                </h2>
                
                <p className="text-sm text-stone-600 max-w-lg mx-auto">
                  Ordering <strong className="text-stone-900">{order.drinkName}</strong> (₱{order.price}.00) for{' '}
                  <strong className="text-amber-800">Slot {order.slot}</strong>. Choose a payment option to generate your QR code.
                </p>

                {idleSecondsLeft !== null && (
                  <p className="text-xs font-mono text-stone-400 tabular-nums flex items-center justify-center gap-1.5 pt-1">
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
                  className="group relative p-6 sm:p-8 rounded-3xl bg-white border-2 border-stone-200/90 hover:border-amber-500 hover:shadow-xl transition-all duration-200 cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Logo mark + price tag */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="px-3.5 py-1.5 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center gap-1.5">
                        <span className="font-extrabold text-base tracking-wider leading-none">
                          <span className="text-[#0038A8]">QR</span>
                          <span className="text-[#CE1126]">Ph</span>
                        </span>
                        <div className="w-2.5 h-1 rounded-full bg-[#FCD116]" />
                      </div>
                      <span className="font-mono text-2xl font-bold text-amber-700 tabular-nums">
                        ₱{order.price}.00
                      </span>
                    </div>

                    <h3 className="font-serif-display text-2xl font-bold text-stone-900 group-hover:text-amber-800 transition-colors">
                      QRPh Standard
                    </h3>
                    
                    <p className="text-xs text-stone-500 font-medium mt-1 mb-3">
                      National QR Standard · All BSP E-Wallets & Banks
                    </p>

                    <p className="text-xs text-stone-600 leading-relaxed">
                      Pay instantly with GCash, Maya, ShopeePay, GoTyme, GrabPay, BPI Vybe, and any BSP-licensed QRPh app.
                    </p>
                  </div>

                  {/* Touch CTA */}
                  <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between text-xs font-semibold text-amber-700 group-hover:text-amber-800">
                    <span>Pay with QRPh</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
                  </div>
                </button>

                {/* 2. InstaPay Option Card */}
                <button
                  type="button"
                  onClick={() => handleSelectRail('InstaPay')}
                  className="group relative p-6 sm:p-8 rounded-3xl bg-white border-2 border-stone-200/90 hover:border-amber-500 hover:shadow-xl transition-all duration-200 cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Logo mark + price tag */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="px-3.5 py-1.5 rounded-xl bg-red-50 border border-red-200/80 flex items-center gap-1">
                        <span className="font-extrabold text-sm text-[#00529B] leading-none">insta</span>
                        <span className="font-black text-sm text-[#E11931] leading-none">Pay</span>
                      </div>
                      <span className="font-mono text-2xl font-bold text-amber-700 tabular-nums">
                        ₱{order.price}.00
                      </span>
                    </div>

                    <h3 className="font-serif-display text-2xl font-bold text-stone-900 group-hover:text-amber-800 transition-colors">
                      InstaPay Transfer
                    </h3>

                    <p className="text-xs text-stone-500 font-medium mt-1 mb-3">
                      Direct Mobile Banking · Universal Interbank QR
                    </p>

                    <p className="text-xs text-stone-600 leading-relaxed">
                      Pay using BDO Pay, BPI, UnionBank, Metrobank, LandBank, RCBC, Chinabank, and all participating InstaPay apps.
                    </p>
                  </div>

                  {/* Touch CTA */}
                  <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between text-xs font-semibold text-amber-700 group-hover:text-amber-800">
                    <span>Pay with InstaPay</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
                  </div>
                </button>

              </div>

              {/* Cancel Order Action */}
              <div className="pt-4 flex justify-center">
                <button
                  type="button"
                  onClick={handleReset}
                  className="py-3 px-6 rounded-2xl bg-white hover:bg-stone-100 text-stone-600 hover:text-stone-900 border border-stone-200/80 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
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
            <div className="max-w-xl mx-auto rounded-3xl bg-white border border-stone-200 shadow-xl overflow-hidden animate-in fade-in duration-200">
              
              {/* Header Navigation: Back + Cancel */}
              <div className="px-6 py-4 bg-stone-50/70 border-b border-stone-200/80 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleBackToSelect}
                  className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl text-stone-700 hover:text-stone-950 hover:bg-stone-200/60 transition-colors text-xs font-semibold cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Change payment method</span>
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors text-xs font-medium cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>Cancel order</span>
                </button>
              </div>

              {/* Main QR Screen Body */}
              <div className="p-6 sm:p-8 flex flex-col items-center text-center">
                
                {/* Method Identification Badge */}
                <div className="mb-3">
                  {selectedRail === 'QRPh' ? (
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200/80">
                      <span className="font-extrabold text-xs tracking-wider">
                        <span className="text-[#0038A8]">QR</span>
                        <span className="text-[#CE1126]">Ph</span>
                      </span>
                      <span className="text-stone-300">·</span>
                      <span className="text-xs font-medium text-stone-700">National QR Standard</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-50 border border-red-200/80">
                      <span className="font-extrabold text-xs tracking-wider">
                        <span className="text-[#00529B]">insta</span>
                        <span className="text-[#E11931]">Pay</span>
                      </span>
                      <span className="text-stone-300">·</span>
                      <span className="text-xs font-medium text-stone-700">Instant Bank Transfer</span>
                    </div>
                  )}
                </div>

                {/* Primary Heading */}
                <h2 className="font-serif-display text-3xl font-bold text-stone-900 tracking-tight">
                  Scan to Pay
                </h2>

                {/* Specific Method Instruction */}
                <p className="text-xs sm:text-sm text-stone-600 mt-1 max-w-sm">
                  {selectedRail === 'QRPh'
                    ? 'Scan the QRPH code using your banking or e-wallet app.'
                    : 'Scan the InstaPay QR code using your supported banking app.'}
                </p>

                {/* Prominent Amount */}
                <div className="my-5 px-6 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-baseline justify-center gap-2">
                  <span className="text-xs uppercase tracking-wider font-semibold text-amber-800">
                    Total Amount
                  </span>
                  <span className="font-mono text-3xl font-bold text-amber-700 tabular-nums">
                    ₱{order.price}.00
                  </span>
                </div>

                {/* QR Code Container with Scanner Reticle Frame */}
                <div className="relative p-5 bg-white rounded-2xl border border-stone-200 shadow-md">
                  {/* Animated Scanner Corner Brackets */}
                  <div className="absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-amber-500 rounded-tl-md" />
                  <div className="absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-amber-500 rounded-tr-md" />
                  <div className="absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-amber-500 rounded-bl-md" />
                  <div className="absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-amber-500 rounded-br-md" />

                  {/* Gentle pulsing scanning line */}
                  <div className="absolute inset-x-4 top-4 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent opacity-75 animate-pulse pointer-events-none" />

                  {/* Scannable QR Matrix */}
                  <div className="flex items-center justify-center">
                    <QrCodeDisplay
                      value={order.qrUrl}
                      size={230}
                      errorCorrectionLevel="M"
                    />
                  </div>
                </div>

                {/* Waiting State Indicator */}
                <div className="mt-5 flex items-center justify-center gap-2 text-stone-700 text-xs font-semibold">
                  <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
                  <span>Waiting for payment…</span>
                  <span className="text-stone-400 font-normal">cup slot unlocks automatically</span>
                </div>

                {/* Supported Apps Guide */}
                <div className="mt-4 p-3 rounded-xl bg-stone-50 border border-stone-200/80 w-full text-[11px] text-stone-600">
                  <p className="font-semibold text-stone-800 mb-0.5">
                    {selectedRail === 'QRPh' ? 'Compatible Apps:' : 'Compatible Banking Apps:'}
                  </p>
                  <p className="text-stone-500 leading-relaxed">
                    {selectedRail === 'QRPh'
                      ? 'GCash · Maya · ShopeePay · GoTyme · BPI Vybe · GrabPay · All BSP QRPh apps'
                      : 'BDO Pay · BPI · UnionBank · Metrobank · LandBank · RCBC · Any InstaPay app'}
                  </p>
                </div>

                {/* In-Browser Test Link */}
                <div className="mt-4 pt-3 border-t border-stone-100 w-full flex flex-col items-center">
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
                    <span>Simulated QR payment · Unlocks kiosk dispenser on tap</span>
                  </p>
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
            <div className="max-w-lg mx-auto rounded-3xl bg-white border border-stone-200/90 shadow-xl p-8 sm:p-10 text-center space-y-6 animate-in zoom-in-95 duration-300">
              <div className="w-20 h-20 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100/70 text-emerald-900 text-xs font-semibold">
                  <span>Brewing Complete</span>
                </div>
                <h2 className="font-serif-display text-3xl sm:text-4xl font-bold text-stone-900">
                  Your coffee is ready!
                </h2>
                <p className="text-sm text-stone-600">
                  Please collect your freshly brewed cup from <strong className="text-stone-900">Slot {order.slot}</strong>.
                </p>
              </div>

              {/* Order receipt mini pill */}
              <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-stone-200/80 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-stone-500">Drink</span>
                  <span className="font-semibold text-stone-800">{order.drinkName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-500">Cup Slot</span>
                  <span className="font-mono font-bold text-amber-700">Slot {order.slot}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-500">Amount</span>
                  <span className="font-mono tabular-nums text-stone-700">₱{order.price}.00 (Settled)</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="w-full py-3.5 px-6 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Start New Order</span>
              </button>

              <p className="text-xs text-stone-400">
                Kiosk automatically returns to menu in a few seconds…
              </p>
            </div>
          )}

          {/* ════════════════════════════════════════════════
              STATE 5: FAILED / CANCELLED
          ════════════════════════════════════════════════ */}
          {orderStatus === 'failed' && order && (
            <div className="max-w-md mx-auto rounded-3xl bg-white border border-stone-200/90 shadow-xl p-8 sm:p-10 text-center space-y-6 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto">
                <XCircle className="w-8 h-8 text-red-500" />
              </div>

              <div className="space-y-1.5">
                <h2 className="font-serif-display text-2xl font-bold text-stone-900">
                  Payment cancelled
                </h2>
                <p className="text-xs text-stone-500">
                  No coffee was dispensed and no charges were made.
                </p>
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="w-full py-3.5 px-6 rounded-2xl bg-amber-700 hover:bg-amber-600 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Try Again</span>
              </button>
            </div>
          )}

        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="px-6 py-4 bg-white/70 border-t border-stone-200/80 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-500 gap-2">
        <span>TRICOFF Self-Service Coffee Kiosk · Rev. 2 Airpot System</span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-stone-400">
            {esp32Mock ? 'CONTROLLER: MOCK' : `CONTROLLER: ${machineOnline ? 'ONLINE' : 'OFFLINE'}`}
          </span>
          <span className="text-stone-300">·</span>
          <Link to="/admin" className="hover:text-stone-800 transition-colors">
            Operator Settings
          </Link>
        </div>
      </footer>

    </div>
  );
};
