import React, { useEffect, useState, useRef } from 'react';
import { Volume2, VolumeX, Sparkles } from 'lucide-react';
import type { Order } from '../hooks/useTricoffBroker';

interface CoffeeBrewingPourAnimationProps {
  order: Order;
  volumeMl?: number;
}

export const CoffeeBrewingPourAnimation: React.FC<CoffeeBrewingPourAnimationProps> = ({
  order,
  volumeMl = 200,
}) => {
  // Estimated pour time based on server press count (1s initial + presses * 1s)
  const totalDurationSec = Math.max(6, 1 + order.presses);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundNodesRef = useRef<{ gain: GainNode; filter: BiquadFilterNode } | null>(null);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const current = (Date.now() - start) / 1000;
      setElapsedSec(Math.min(totalDurationSec, current));
    }, 50);
    return () => clearInterval(interval);
  }, [totalDurationSec]);

  const progressPercent = Math.min(100, Math.round((elapsedSec / totalDurationSec) * 100));
  const isPouringActive = progressPercent > 2 && progressPercent < 97;
  const currentMl = Math.min(volumeMl, Math.round((progressPercent / 100) * volumeMl));
  const currentPress = Math.min(order.presses, Math.max(1, Math.ceil((progressPercent / 100) * order.presses)));

  // Coffee level inside cup rises smoothly from 12% to 88%
  const fillHeightPercent = 12 + (progressPercent / 100) * 76;
  const liquidTopY = 336 - (212 * fillHeightPercent) / 100;
  const cremaRx = 56 + (fillHeightPercent / 100) * 14;
  const cremaRy = 9 + (fillHeightPercent / 100) * 3.5;

  // Gentle synthetic sound for realistic pour ambiance (optional toggle)
  const toggleSound = () => {
    if (!soundEnabled) {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;

        // Create pink/brown noise for warm liquid trickle sound
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          data[i] = (lastOut + 0.02 * white) / 1.02;
          lastOut = data[i];
          data[i] *= 2.5;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 650;
        filter.Q.value = 2.5;

        const gain = ctx.createGain();
        gain.gain.value = 0.12;

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(0);

        soundNodesRef.current = { gain, filter };
        setSoundEnabled(true);
      } catch {
        // AudioContext disabled or restricted
      }
    } else {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      soundNodesRef.current = null;
      setSoundEnabled(false);
    }
  };

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center">
      {/* Header status */}
      <div className="text-center mb-4 sm:mb-5">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#FAF7F2] text-[#644B37] text-xs font-semibold mb-2.5 shadow-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-[#A5754A] animate-ping" />
          <span>Step 4 · Airpot Dispensing Active · Slot {order.slot}</span>
        </div>
        <h2 className="font-serif-display text-2xl sm:text-3xl lg:text-4xl font-bold text-[#442713] tracking-tight">
          Pouring your {order.drinkName}
        </h2>
        <p className="text-xs sm:text-sm text-[#644B37] mt-1.5 max-w-md mx-auto leading-relaxed">
          Keep your cup placed directly beneath <strong className="text-[#442713]">Slot {order.slot}</strong>. Fresh highland brew is being extracted.
        </p>
      </div>

      {/* Animation Stage */}
      <div className="relative w-full max-w-md h-[390px] sm:h-[410px] flex items-center justify-center bg-gradient-to-b from-[#FAF7F2] via-[#F4EDE2] to-[#E9DFD2] rounded-[36px] p-5 shadow-[0_16px_36px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.04)] overflow-hidden">
        
        {/* Soft background ambient warmth */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-80 h-80 rounded-full bg-[#B18A61]/25 blur-3xl animate-pulse" />
          <div className="w-48 h-48 rounded-full bg-[#E5B582]/20 blur-2xl" />
        </div>

        {/* Audio Ambiance Toggle in Top-Right */}
        <button
          type="button"
          onClick={toggleSound}
          title={soundEnabled ? 'Mute pour sound' : 'Enable pour sound ambiance'}
          className="absolute top-3.5 right-3.5 z-20 p-2 rounded-full bg-white/80 hover:bg-white text-[#644B37] hover:text-[#442713] shadow-xs backdrop-blur-xs transition-all duration-200 cursor-pointer"
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-[#A5754A]" /> : <VolumeX className="w-4 h-4 opacity-60" />}
        </button>

        {/* Live Extraction Rate Gauge in Top-Left */}
        <div className="absolute top-3.5 left-3.5 z-20 px-3 py-1 rounded-full bg-white/85 backdrop-blur-xs shadow-xs flex items-center gap-1.5 text-[11px] font-semibold text-[#442713]">
          <Sparkles className="w-3.5 h-3.5 text-[#A5754A]" />
          <span>88°C Hot Bypass</span>
        </div>

        {/* SVG Drawing of Precision Airpot Nozzle + Laminar Stream + 3D Paper Cup */}
        <svg
          viewBox="0 0 340 380"
          className="w-full h-full max-w-[325px] max-h-[380px] drop-shadow-md overflow-visible select-none"
        >
          <defs>
            {/* Core coffee stream gradient */}
            <linearGradient id="streamBodyGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#2E160A" />
              <stop offset="25%" stopColor="#442713" />
              <stop offset="60%" stopColor="#7E5632" />
              <stop offset="85%" stopColor="#B18A61" />
              <stop offset="100%" stopColor="#2E160A" />
            </linearGradient>

            {/* Flowing shimmer for stream core */}
            <linearGradient id="shimmerGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FAF1E4" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#E2A669" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#FAF1E4" stopOpacity="0.9" />
            </linearGradient>

            {/* Crema top surface gradient */}
            <radialGradient id="cremaRadialGrad" cx="50%" cy="45%" r="55%">
              <stop offset="0%" stopColor="#E5B582" />
              <stop offset="40%" stopColor="#C4966A" />
              <stop offset="75%" stopColor="#966C44" />
              <stop offset="100%" stopColor="#5A3A1F" />
            </radialGradient>

            {/* Metallic nozzle chrome gradient */}
            <linearGradient id="chromeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4A4540" />
              <stop offset="25%" stopColor="#8C847C" />
              <stop offset="50%" stopColor="#D9D4CC" />
              <stop offset="75%" stopColor="#8C847C" />
              <stop offset="100%" stopColor="#3A3530" />
            </linearGradient>

            {/* Paper cup gradient shading for 3D depth */}
            <linearGradient id="paperCupShading" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#E8E2D6" />
              <stop offset="12%" stopColor="#FAF7F2" />
              <stop offset="50%" stopColor="#FFFFFF" />
              <stop offset="85%" stopColor="#F6F1EA" />
              <stop offset="100%" stopColor="#D8D0C2" />
            </linearGradient>

            {/* Interior liquid clip path */}
            <clipPath id="cupInteriorClip">
              <polygon points="98,124 242,124 226,336 114,336" />
            </clipPath>

            {/* Filter for smooth steam diffusion */}
            <filter id="softSteamBlur" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3.5" />
            </filter>
          </defs>

          {/* ── 1. Airpot Dispenser Nozzle & Mounting Head ── */}
          <g id="airpotDispenserHead">
            {/* Top mounting block */}
            <rect x="130" y="4" width="80" height="14" rx="4" fill="#2E2C2A" />
            <rect x="142" y="18" width="56" height="8" fill="url(#chromeGrad)" />
            
            {/* Conical chrome spout nozzle */}
            <path d="M154 26 L186 26 L178 52 L162 52 Z" fill="url(#chromeGrad)" />
            <ellipse cx="170" cy="52" rx="8" ry="3" fill="#252321" />
            <ellipse cx="170" cy="52" rx="5" ry="1.8" fill="#141312" />

            {/* Glowing amber extraction ring when actively pouring */}
            {isPouringActive && (
              <ellipse
                cx="170"
                cy="52"
                rx="9"
                ry="3.5"
                fill="none"
                stroke="#E5B582"
                strokeWidth="1.5"
                opacity="0.8"
                className="animate-ping"
              />
            )}
          </g>

          {/* ── 2. Takeaway Paper Coffee Cup (Behind the Stream) ── */}
          <g id="paperCoffeeCup">
            {/* Cup Base Cast Shadow on Tray */}
            <ellipse cx="170" cy="346" rx="68" ry="11" fill="#2E2015" opacity="0.16" />
            <ellipse cx="170" cy="344" rx="56" ry="7" fill="#1C130D" opacity="0.14" />

            {/* Cup Interior Back Wall (dark hollow interior before liquid reaches) */}
            <ellipse cx="170" cy="124" rx="72" ry="16" fill="#3D2B1F" />
            <ellipse cx="170" cy="126" rx="69" ry="14" fill="#241810" />

            {/* Liquid Fill Inside Cup (masked strictly inside the cup interior) */}
            <g clipPath="url(#cupInteriorClip)">
              {/* Coffee Liquid Deep Body */}
              <rect
                x="90"
                y={liquidTopY}
                width="160"
                height={336 - liquidTopY + 10}
                fill="#26140A"
              />

              {/* Rich Crema Layer with Elliptical 3D Surface */}
              <ellipse
                cx="170"
                cy={liquidTopY}
                rx={cremaRx}
                ry={cremaRy}
                fill="url(#cremaRadialGrad)"
              />

              {/* Crema swirling rings & foam ripples */}
              {isPouringActive && (
                <>
                  {/* Expanding ripple ring 1 */}
                  <ellipse
                    cx="170"
                    cy={liquidTopY}
                    rx="14"
                    ry="3.5"
                    fill="none"
                    stroke="#FCE4C8"
                    strokeWidth="1.8"
                    opacity="0.85"
                  >
                    <animate attributeName="rx" values="10;36;10" dur="1.2s" repeatCount="indefinite" />
                    <animate attributeName="ry" values="2.5;9;2.5" dur="1.2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.9;0.1;0.9" dur="1.2s" repeatCount="indefinite" />
                  </ellipse>

                  {/* Expanding ripple ring 2 (delayed) */}
                  <ellipse
                    cx="170"
                    cy={liquidTopY}
                    rx="22"
                    ry="5.5"
                    fill="none"
                    stroke="#E5B582"
                    strokeWidth="1.2"
                    opacity="0.6"
                  >
                    <animate attributeName="rx" values="18;48;18" dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="ry" values="4.5;12;4.5" dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.7;0.05;0.7" dur="1.5s" repeatCount="indefinite" />
                  </ellipse>

                  {/* Swirling crema froth bubble cluster */}
                  <circle cx="156" cy={liquidTopY - 1} r="2.2" fill="#FCE4C8" opacity="0.7">
                    <animate attributeName="cx" values="156;158;156" dur="0.8s" repeatCount="indefinite" />
                  </circle>
                  <circle cx="184" cy={liquidTopY + 1} r="2" fill="#E8BD93" opacity="0.65">
                    <animate attributeName="cx" values="184;182;184" dur="0.9s" repeatCount="indefinite" />
                  </circle>
                  <circle cx="178" cy={liquidTopY - 2} r="1.6" fill="#FCE4C8" opacity="0.75" />
                  <circle cx="163" cy={liquidTopY + 2} r="1.8" fill="#E8BD93" opacity="0.6" />
                </>
              )}
            </g>

            {/* Cup Outer Body (Paper Cup Front with 3D Shading) */}
            <path
              d="M96 124 L114 338 C114 343 226 343 226 338 L244 124 C244 136 96 136 96 124 Z"
              fill="url(#paperCupShading)"
            />

            {/* Cup Body Texture Highlight and Shading Crease */}
            <path
              d="M128 132 L137 334"
              stroke="#FFFFFF"
              strokeWidth="7"
              strokeOpacity="0.5"
              fill="none"
            />
            <path
              d="M212 132 L203 334"
              stroke="#D1C9BE"
              strokeWidth="6"
              strokeOpacity="0.35"
              fill="none"
            />

            {/* Rolled Paper Top Rim Lip */}
            <ellipse
              cx="170"
              cy="124"
              rx="74"
              ry="10.5"
              fill="#FFFFFF"
              stroke="#DDD6CA"
              strokeWidth="1.2"
            />
            <ellipse
              cx="170"
              cy="124"
              rx="71"
              ry="7.8"
              fill="none"
              stroke="#EFEBE4"
              strokeWidth="1.2"
            />

            {/* Official TRICOFF Logo Centered on Front of Paper Cup */}
            <g transform="translate(108, 180)">
              <image
                href="/assets/aistudio/green_minimalist_online_wallet_logo__2__5ed61fe2.png"
                x="0"
                y="0"
                width="124"
                height="75"
                preserveAspectRatio="xMidYMid meet"
                style={{ mixBlendMode: 'multiply' }}
                opacity="0.95"
              />
            </g>

            {/* Drink Subtitle / Spec Line on Cup Front */}
            <text
              x="170"
              y="266"
              textAnchor="middle"
              fill="#8B6B4D"
              fontSize="9"
              fontWeight="600"
              letterSpacing="1.5"
              fontFamily="system-ui, sans-serif"
            >
              {order.drinkName.toUpperCase()}
            </text>

            <text
              x="170"
              y="280"
              textAnchor="middle"
              fill="#A99583"
              fontSize="7.5"
              fontWeight="500"
              letterSpacing="0.8"
              fontFamily="system-ui, sans-serif"
            >
              {volumeMl} ML · AIRPOT EXTRACTED
            </text>

            {/* Cup Bottom Rolled Base Lip */}
            <path
              d="M112 334 Q170 344 228 334 L226 339 Q170 348 114 339 Z"
              fill="#D9D3C7"
            />
          </g>

          {/* ── 3. Flowing Coffee Stream (In Front of Cup Rim, Into Liquid) ── */}
          {isPouringActive && (
            <g id="activePouringStream">
              {/* Outer rich dark stream with natural gravity curve */}
              <path
                d={`M166 52 Q169 110 167 190 Q165 240 168 ${Math.max(140, liquidTopY)}`}
                stroke="url(#streamBodyGrad)"
                strokeWidth="6"
                strokeLinecap="round"
                fill="none"
              />

              {/* Inner glowing amber fluid highlight */}
              <path
                d={`M168 52 Q171 110 169 190 Q167 240 170 ${Math.max(140, liquidTopY)}`}
                stroke="url(#shimmerGrad)"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeDasharray="16 8"
                fill="none"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  values="0;-48"
                  dur="0.4s"
                  repeatCount="indefinite"
                />
              </path>

              {/* Sparkling fine light beam */}
              <path
                d={`M170 52 Q172 110 170.5 190 Q168.5 240 171 ${Math.max(140, liquidTopY)}`}
                stroke="#FFFFFF"
                strokeWidth="0.8"
                strokeOpacity="0.75"
                fill="none"
              />

              {/* Energetic splashing droplets at stream landing point */}
              <g id="splashDroplets">
                {/* Droplet 1 (Left arching) */}
                <circle cx="163" cy={liquidTopY - 4} r="2.2" fill="#E5B582">
                  <animate attributeName="cx" values="163;156;153" dur="0.32s" repeatCount="indefinite" />
                  <animate attributeName="cy" values={`${liquidTopY - 2};${liquidTopY - 14};${liquidTopY - 2}`} dur="0.32s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0.7;0" dur="0.32s" repeatCount="indefinite" />
                </circle>

                {/* Droplet 2 (Right arching) */}
                <circle cx="174" cy={liquidTopY - 3} r="1.9" fill="#FCE4C8">
                  <animate attributeName="cx" values="174;182;186" dur="0.28s" repeatCount="indefinite" />
                  <animate attributeName="cy" values={`${liquidTopY - 2};${liquidTopY - 12};${liquidTopY - 1}`} dur="0.28s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0.6;0" dur="0.28s" repeatCount="indefinite" />
                </circle>

                {/* Droplet 3 (High bounce center) */}
                <circle cx="169" cy={liquidTopY - 5} r="2" fill="#D49964">
                  <animate attributeName="cy" values={`${liquidTopY - 3};${liquidTopY - 18};${liquidTopY - 4}`} dur="0.25s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.95;0.8;0" dur="0.25s" repeatCount="indefinite" />
                </circle>

                {/* Droplet 4 (Fine mist micro-drop) */}
                <circle cx="176" cy={liquidTopY - 6} r="1.4" fill="#FFFFFF">
                  <animate attributeName="cx" values="176;184;188" dur="0.35s" repeatCount="indefinite" />
                  <animate attributeName="cy" values={`${liquidTopY - 4};${liquidTopY - 16};${liquidTopY - 2}`} dur="0.35s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.8;0.3;0" dur="0.35s" repeatCount="indefinite" />
                </circle>
              </g>
            </g>
          )}

          {/* ── 4. Multi-Layer Realistic Rising Steam Wisps ── */}
          <g id="risingCoffeeSteam" opacity="0.75" filter="url(#softSteamBlur)">
            {/* Steam trail 1 */}
            <path
              d="M148 116 Q140 82 150 56 T144 20"
              fill="none"
              stroke="#E8E2D6"
              strokeWidth="4.5"
              strokeLinecap="round"
            >
              <animate
                attributeName="d"
                values="M148 116 Q140 82 150 56 T144 20; M148 116 Q154 82 144 56 T150 20; M148 116 Q140 82 150 56 T144 20"
                dur="3.2s"
                repeatCount="indefinite"
              />
              <animate attributeName="opacity" values="0.2;0.7;0.2" dur="3.2s" repeatCount="indefinite" />
            </path>

            {/* Steam trail 2 */}
            <path
              d="M186 112 Q194 78 182 50 T188 18"
              fill="none"
              stroke="#FAF7F2"
              strokeWidth="4"
              strokeLinecap="round"
            >
              <animate
                attributeName="d"
                values="M186 112 Q194 78 182 50 T188 18; M186 112 Q178 78 190 50 T180 18; M186 112 Q194 78 182 50 T188 18"
                dur="2.7s"
                repeatCount="indefinite"
              />
              <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2.7s" repeatCount="indefinite" />
            </path>

            {/* Steam trail 3 (Center subtle waft) */}
            <path
              d="M168 118 Q162 88 172 60 T164 26"
              fill="none"
              stroke="#DDD6CA"
              strokeWidth="3.2"
              strokeLinecap="round"
            >
              <animate
                attributeName="d"
                values="M168 118 Q162 88 172 60 T164 26; M168 118 Q174 88 162 60 T170 26; M168 118 Q162 88 172 60 T164 26"
                dur="3.8s"
                repeatCount="indefinite"
              />
              <animate attributeName="opacity" values="0.2;0.65;0.2" dur="3.8s" repeatCount="indefinite" />
            </path>
          </g>
        </svg>

        {/* Live Filling Gauge Pill on Bottom Right */}
        <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-xs px-3.5 py-1.5 rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.08)] flex items-center gap-2 z-10">
          <div className="w-2.5 h-2.5 rounded-full bg-[#A5754A] animate-ping" />
          <span className="font-sans text-xs font-bold text-[#442713] tabular-nums">
            {currentMl} ml · {progressPercent}%
          </span>
        </div>

        {/* Live Servo Pulse Status on Bottom Left */}
        <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-xs px-3 py-1.5 rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.08)] flex items-center gap-1.5 z-10 text-[11px] font-semibold text-[#644B37]">
          <span>Airpot Servo</span>
          <span className="text-[#A5754A] font-mono tabular-nums">#{currentPress}/{order.presses}</span>
        </div>
      </div>

      {/* Progress bar and details */}
      <div className="w-full max-w-md mt-5 space-y-2.5">
        {/* Animated Fill Bar */}
        <div className="w-full bg-[#E8DEC8]/80 rounded-full h-3 overflow-hidden p-0.5 shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-[#A5754A] via-[#C4966A] to-[#442713] rounded-full transition-all duration-300 ease-out relative overflow-hidden"
            style={{ width: `${progressPercent}%` }}
          >
            {/* Shimmer light traversing progress bar */}
            {isPouringActive && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-pulse" />
            )}
          </div>
        </div>

        {/* Spec line */}
        <div className="flex items-center justify-between text-xs text-[#644B37] pt-0.5">
          <span className="font-semibold text-[#442713]">
            Slot {order.slot} · {order.drinkName}
          </span>
          <span className="font-sans font-medium tabular-nums text-[#644B37]">
            {currentMl} of {volumeMl} ml dispensed
          </span>
        </div>
      </div>
    </div>
  );
};
