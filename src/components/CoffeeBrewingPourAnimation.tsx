import React, { useEffect, useState } from 'react';
import tricoffLogo from '../assets/images/tricoff_logo.svg';
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

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const current = (Date.now() - start) / 1000;
      setElapsedSec(Math.min(totalDurationSec, current));
    }, 100);
    return () => clearInterval(interval);
  }, [totalDurationSec]);

  const progressPercent = Math.min(100, Math.round((elapsedSec / totalDurationSec) * 100));

  // Coffee level inside cup rises smoothly from 10% to 88%
  const fillHeightPercent = 10 + (progressPercent / 100) * 78;

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center">
      {/* Header status */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100/80 border border-amber-200/80 text-amber-900 text-xs font-semibold mb-3">
          <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
          <span>Dispensing Brew · Slot {order.slot}</span>
        </div>
        <h2 className="font-serif-display text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight">
          Pouring your {order.drinkName}
        </h2>
        <p className="text-sm text-stone-600 mt-2 max-w-md mx-auto">
          Please keep your cup positioned under <strong className="text-stone-900">Slot {order.slot}</strong>. The automated airpot servo is dispensing fresh coffee.
        </p>
      </div>

      {/* Animation Stage */}
      <div className="relative w-full max-w-md h-96 flex items-center justify-center bg-gradient-to-b from-stone-50/60 to-amber-50/30 rounded-3xl border border-stone-200/70 p-6 shadow-inner overflow-hidden">
        
        {/* Subtle background ambient rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-72 h-72 rounded-full bg-amber-100/40 blur-3xl animate-pulse" />
        </div>

        {/* SVG Drawing of Dispenser Nozzle + Stream + Branded Takeaway Cup */}
        <svg
          viewBox="0 0 340 380"
          className="w-full h-full max-w-[320px] max-h-[360px] drop-shadow-md overflow-visible"
        >
          <defs>
            {/* Coffee stream gradient */}
            <linearGradient id="coffeeStreamGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4A2511" />
              <stop offset="35%" stopColor="#8C4A20" />
              <stop offset="65%" stopColor="#B3662A" />
              <stop offset="100%" stopColor="#3E1E0D" />
            </linearGradient>

            {/* Coffee liquid surface gradient */}
            <linearGradient id="cremaGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#B87333" />
              <stop offset="20%" stopColor="#E09F5A" />
              <stop offset="50%" stopColor="#F4BE7E" />
              <stop offset="80%" stopColor="#D98E45" />
              <stop offset="100%" stopColor="#9E5B23" />
            </linearGradient>

            {/* Paper cup gradient shading for 3D cylinder depth */}
            <linearGradient id="paperCupShade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#EFECE6" />
              <stop offset="12%" stopColor="#FAF8F5" />
              <stop offset="45%" stopColor="#FFFFFF" />
              <stop offset="85%" stopColor="#F5F2EB" />
              <stop offset="100%" stopColor="#DDD8CE" />
            </linearGradient>

            {/* Clip path for the interior liquid filling the tapered cup */}
            <clipPath id="cupInteriorClip">
              <polygon points="98,124 242,124 226,336 114,336" />
            </clipPath>

            {/* Clip path for the cup outer shell */}
            <clipPath id="cupBodyClip">
              <polygon points="96,122 244,122 228,338 112,338" />
            </clipPath>

            {/* Filter for gentle steam blur */}
            <filter id="steamBlur" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>

          {/* ── 1. Dispenser Head / Spout ── */}
          <g id="spout">
            {/* Mounting bracket */}
            <rect x="135" y="8" width="70" height="14" rx="3" fill="#3D3A37" />
            <rect x="145" y="22" width="50" height="8" fill="#5E5852" />
            {/* Metallic nozzle */}
            <path d="M158 30 L182 30 L176 54 L164 54 Z" fill="#8E8881" />
            <ellipse cx="170" cy="54" rx="6" ry="2.5" fill="#2E2C2A" />
            <ellipse cx="170" cy="54" rx="4" ry="1.5" fill="#1C1B19" />
          </g>

          {/* ── 2. Coffee Flowing Stream ── */}
          <g id="stream">
            {/* Core flowing stream from nozzle to inside the cup */}
            <path
              d="M166 54 Q169 90 167 150 Q165 210 168 250"
              stroke="url(#coffeeStreamGrad)"
              strokeWidth="5.5"
              strokeLinecap="round"
              fill="none"
              className="animate-pulse"
            />
            {/* Subtle inner highlight stream */}
            <path
              d="M169 54 Q171 90 170 150 Q168 210 170 250"
              stroke="#E09F5A"
              strokeWidth="1.5"
              strokeOpacity="0.85"
              fill="none"
            />
            {/* Droplet splashes near landing point */}
            <circle cx="165" cy="246" r="2" fill="#D98E45" opacity="0.8">
              <animate attributeName="cy" values="248;244;248" dur="0.3s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.8;0.3;0.8" dur="0.3s" repeatCount="indefinite" />
            </circle>
            <circle cx="175" cy="247" r="1.5" fill="#F4BE7E" opacity="0.7">
              <animate attributeName="cy" values="249;243;249" dur="0.25s" repeatCount="indefinite" />
            </circle>
          </g>

          {/* ── 3. Rising Steam Wisps ── */}
          <g id="steam" opacity="0.65" filter="url(#steamBlur)">
            <path
              d="M150 115 Q145 85 152 65 T148 30"
              fill="none"
              stroke="#D6CEBE"
              strokeWidth="4"
              strokeLinecap="round"
            >
              <animate
                attributeName="d"
                values="M150 115 Q145 85 152 65 T148 30; M150 115 Q155 85 147 65 T153 30; M150 115 Q145 85 152 65 T148 30"
                dur="3s"
                repeatCount="indefinite"
              />
              <animate attributeName="opacity" values="0.3;0.7;0.3" dur="3s" repeatCount="indefinite" />
            </path>
            <path
              d="M185 110 Q192 80 184 55 T190 25"
              fill="none"
              stroke="#E4DDCE"
              strokeWidth="3.5"
              strokeLinecap="round"
            >
              <animate
                attributeName="d"
                values="M185 110 Q192 80 184 55 T190 25; M185 110 Q180 80 189 55 T182 25; M185 110 Q192 80 184 55 T190 25"
                dur="2.5s"
                repeatCount="indefinite"
              />
              <animate attributeName="opacity" values="0.2;0.6;0.2" dur="2.5s" repeatCount="indefinite" />
            </path>
          </g>

          {/* ── 4. Takeaway Paper Coffee Cup ── */}
          <g id="paperCup">
            {/* Cup Base Cast Shadow */}
            <ellipse cx="170" cy="344" rx="66" ry="10" fill="#2E2015" opacity="0.16" />
            <ellipse cx="170" cy="342" rx="58" ry="7" fill="#1C130D" opacity="0.12" />

            {/* Cup Interior Back Wall */}
            <ellipse cx="170" cy="124" rx="72" ry="16" fill="#3D2B1F" />
            <ellipse cx="170" cy="126" rx="69" ry="14" fill="#261A12" />

            {/* Liquid Fill Inside Cup (masked by interior clip) */}
            <g clipPath="url(#cupInteriorClip)">
              {/* Coffee Liquid Body */}
              <rect
                x="90"
                y={336 - (212 * fillHeightPercent) / 100}
                width="160"
                height={(212 * fillHeightPercent) / 100 + 10}
                fill="#2E160A"
              />
              {/* Rich Crema Surface Ellipse at current liquid top */}
              <ellipse
                cx="170"
                cy={336 - (212 * fillHeightPercent) / 100}
                rx={56 + (fillHeightPercent / 100) * 14}
                ry={9 + (fillHeightPercent / 100) * 4}
                fill="url(#cremaGrad)"
              />
              {/* Ripple on crema surface */}
              <ellipse
                cx="169"
                cy={336 - (212 * fillHeightPercent) / 100}
                rx={18}
                ry={4}
                fill="#F4BE7E"
                opacity="0.6"
              >
                <animate attributeName="rx" values="14;24;14" dur="1.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.7;0.2;0.7" dur="1.2s" repeatCount="indefinite" />
              </ellipse>
            </g>

            {/* Cup Outer Body (Paper Cup Front) */}
            <path
              d="M96 124 L114 338 C114 343 226 343 226 338 L244 124 C244 136 96 136 96 124 Z"
              fill="url(#paperCupShade)"
              stroke="#D3CDC2"
              strokeWidth="0.8"
            />

            {/* Cup Body Texture Highlight and Crease */}
            <path
              d="M128 132 L137 334"
              stroke="#FFFFFF"
              strokeWidth="6"
              strokeOpacity="0.45"
              fill="none"
            />
            <path
              d="M212 132 L203 334"
              stroke="#D1C9BE"
              strokeWidth="5"
              strokeOpacity="0.3"
              fill="none"
            />

            {/* Rolled Paper Top Rim Lip */}
            <ellipse
              cx="170"
              cy="124"
              rx="74"
              ry="10"
              fill="#FFFFFF"
              stroke="#D6D0C5"
              strokeWidth="1.8"
            />
            <ellipse
              cx="170"
              cy="124"
              rx="71"
              ry="7.5"
              fill="none"
              stroke="#E8E4DC"
              strokeWidth="1.2"
            />

            {/* Official TRICOFF Logo Centered on Front of Paper Cup */}
            <g transform="translate(112, 190)">
              {/* Paper cup subtle curve skew wrapper */}
              <image
                href={tricoffLogo}
                x="0"
                y="0"
                width="116"
                height="65"
                preserveAspectRatio="xMidYMid meet"
                opacity="0.94"
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
        </svg>

        {/* Live Filling Gauge Pill */}
        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-stone-200 shadow-xs flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
          <span className="font-mono text-xs font-semibold text-stone-800 tabular-nums">
            {progressPercent}% Filled
          </span>
        </div>
      </div>

      {/* Progress bar and details */}
      <div className="w-full max-w-md mt-6 space-y-3">
        {/* Fill bar */}
        <div className="w-full bg-stone-200/80 rounded-full h-2.5 overflow-hidden p-0.5">
          <div
            className="h-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-700 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Spec line */}
        <div className="flex items-center justify-between text-xs text-stone-500 pt-1">
          <span className="font-medium text-stone-700">Slot {order.slot} · {order.drinkName}</span>
          <span className="font-mono tabular-nums text-stone-600">
            {order.presses} servo presses (~{volumeMl} ml)
          </span>
        </div>
      </div>
    </div>
  );
};
