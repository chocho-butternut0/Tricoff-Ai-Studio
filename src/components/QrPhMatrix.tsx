import React, { useMemo } from 'react';

interface QrPhMatrixProps {
  payload: string;
  amount: number;
  referenceId: string;
  isPaid: boolean;
  isScanning: boolean;
  rail?: 'QRPh' | 'InstaPay';
  sizeClass?: string;
}

/**
 * Exact 45x45 QR Matrix from the uploaded GCash InstaPay QR Code (SU****Y P. / 0995 028 •••• / ••••••••••••XXRQUA)
 */
const INSTAPAY_UPLOADED_QR_ROWS: string[] = [
  '111111100011011101011000101010010101001111111',
  '100000101110111110111010101011101000001000001',
  '101110100101101100101101111001111011101011101',
  '101110100100110101111000100011010011101011101',
  '101110100001001100001011110101001110101011101',
  '100000100110101011000010101110001010001000001',
  '111111101010101010101110101010101010101111111',
  '000000001001010011101010100001100010000000000',
  '110110111111111011001110101100001111100010010',
  '100010000010010011010101101101111010010001000',
  '011011101010010100101100011011000101110111011',
  '110010001110001110110000101110001011111000000',
  '011001110110101011001111010001101110001010011',
  '000111000101011101011111110011001101001010111',
  '001101110011000011100101100010101010000000110',
  '001011010101101110110001110100100000101110100',
  '010110101100010111100101011000110100110010111',
  '001001010010100001100000000001011110011011110',
  '111011110001100000100000000010011011100110111',
  '110010001100100100100000000010110110101001100',
  '001100101100001010110000000000100111001110011',
  '010100010110111011100000000011101011100001011',
  '101111101010110001000000000010111011111010001',
  '010010110100011110000000000010110110001101100',
  '111011101011110010000000000010010110101101111',
  '101100000100001011100000000010100010001001100',
  '001111101010111011000000000010111011111011111',
  '000011011100101101010000000001101111011101100',
  '011011101111010011001101011000100010011011011',
  '000110010000101000111010111100110010010101100',
  '011101101001111101110101101001110100100001011',
  '001110000011001100101110110010110111101111100',
  '101001101001001010100111110011000111010010110',
  '001011011010101000100111110010111111011010101',
  '110101101100110111001111010101111001100111011',
  '001000001101101100010000011010101011010011010',
  '010110100001011011101111101110101011111010001',
  '000000001011101100111000000101001010001001010',
  '111111101011011001001111101011101011101011000',
  '100000101110011110001000100110100010001011000',
  '101110100101110100011010101011111011111011100',
  '101110101001000101001000101110101010100110110',
  '101110101000101100101111101000111011101111001',
  '100000100101010011100010010111010000010001110',
  '111111101010110001001111011011001110111111010',
];

export const QrPhMatrix: React.FC<QrPhMatrixProps> = ({
  payload,
  amount,
  referenceId,
  isPaid,
  isScanning,
  rail = 'QRPh',
  sizeClass = 'w-52 h-52',
}) => {
  const qrPhSize = 25;

  const qrPhMatrix = useMemo(() => {
    const grid: boolean[][] = Array.from({ length: qrPhSize }, () =>
      Array(qrPhSize).fill(false)
    );

    const drawFinderPattern = (rowOffset: number, colOffset: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          grid[rowOffset + r][colOffset + c] = isBorder || isInner;
        }
      }
    };

    drawFinderPattern(0, 0);
    drawFinderPattern(0, qrPhSize - 7);
    drawFinderPattern(qrPhSize - 7, 0);

    for (let i = 8; i < qrPhSize - 8; i++) {
      grid[6][i] = i % 2 === 0;
      grid[i][6] = i % 2 === 0;
    }

    let hash = 2166136261;
    for (let i = 0; i < payload.length; i++) {
      hash ^= payload.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    for (let r = 0; r < qrPhSize; r++) {
      for (let c = 0; c < qrPhSize; c++) {
        const inTopLeft = r < 8 && c < 8;
        const inTopRight = r < 8 && c >= qrPhSize - 8;
        const inBottomLeft = r >= qrPhSize - 8 && c < 8;
        const inCenter = r >= 10 && r <= 14 && c >= 10 && c <= 14;
        const isTiming = r === 6 || c === 6;

        if (inTopLeft || inTopRight || inBottomLeft || inCenter || isTiming) {
          continue;
        }

        const seed = Math.imul(r * 31 + c * 17 + (hash & 0xffff), 2654435761);
        grid[r][c] = Math.abs(seed) % 10 < 5;
      }
    }

    return grid;
  }, [payload]);

  // InstaPay — white card matching the screenshot
  // (white background, "InstaPay · Electronic Fund Transfer QR" header,
  //  45×45 QR matrix with InstaPay center logo, merchant + reference footer)
  if (rail === 'InstaPay') {
    const instaSize = 45;
    return (
      <div className="relative bg-white p-4 rounded-xl border border-stone-200/90 shadow-sm select-none">
        {/* Header: InstaPay logo + "Electronic Fund Transfer QR" + amount */}
        <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-stone-200">
          <div className="flex items-center gap-1.5">
            {/* InstaPay wordmark — "Insta" blue + "Pay" orange, matches screenshot */}
            <span className="font-extrabold text-sm text-[#00529B] leading-none tracking-tight">
              Insta
            </span>
            <span className="font-extrabold text-sm text-[#E86A1A] leading-none tracking-tight -ml-0.5">
              Pay
            </span>
            <span className="text-[11px] text-stone-400 ml-1">·</span>
            <span className="text-[11px] font-medium text-stone-600">
              Electronic Fund Transfer QR
            </span>
          </div>
          <span className="font-mono text-xs font-semibold text-stone-900 tabular-nums">
            ₱{amount.toFixed(2)}
          </span>
        </div>

        {/* 45×45 QR matrix */}
        <div className={`relative mx-auto ${sizeClass} flex items-center justify-center`}>
          <svg
            viewBox={`0 0 ${instaSize} ${instaSize}`}
            className={`w-full h-full transition-opacity duration-200 ${
              isPaid ? 'opacity-25' : 'opacity-100'
            }`}
            shapeRendering="crispEdges"
            aria-label={`InstaPay QR Code for ${referenceId} amount PHP ${amount}`}
          >
            {INSTAPAY_UPLOADED_QR_ROWS.map((rowStr, rIdx) =>
              rowStr.split('').map((bit, cIdx) =>
                bit === '1' ? (
                  <rect
                    key={`${rIdx}-${cIdx}`}
                    x={cIdx}
                    y={rIdx}
                    width={1}
                    height={1}
                    fill="#000000"
                  />
                ) : null
              )
            )}
          </svg>

          {/* Center InstaPay logo overlay */}
          {!isPaid && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-white border border-stone-200 rounded px-1.5 py-1 flex flex-col items-center justify-center leading-none shadow-xs">
                <span className="text-[13px] font-extrabold tracking-tight text-[#00529B] leading-none">
                  Insta
                </span>
                <span className="text-[14px] font-black tracking-tight text-[#E86A1A] leading-none -mt-0.5">
                  Pay
                </span>
              </div>
            </div>
          )}

          {/* Scanning overlay */}
          {isScanning && !isPaid && (
            <div className="absolute inset-0 bg-stone-950/75 backdrop-blur-[2px] rounded-lg flex flex-col items-center justify-center text-center p-3">
              <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-xs font-semibold text-white">
                Verifying InstaPay Payment...
              </p>
              <p className="font-mono text-[11px] text-stone-300 mt-0.5 tabular-nums">
                ₱{amount.toFixed(2)} · {referenceId}
              </p>
            </div>
          )}

          {/* Verified overlay */}
          {isPaid && (
            <div className="absolute inset-0 bg-emerald-950/90 rounded-lg flex flex-col items-center justify-center text-center p-3 text-white">
              <div className="w-8 h-8 rounded-full bg-emerald-500 text-stone-950 flex items-center justify-center font-bold text-sm mb-1.5">
                ✓
              </div>
              <p className="text-xs font-semibold tracking-wide text-emerald-200">
                InstaPay Payment Verified
              </p>
              <p className="font-mono text-xs text-white mt-0.5 tabular-nums">
                ₱{amount.toFixed(2)} Settled
              </p>
            </div>
          )}
        </div>

        {/* Footer: merchant + reference (same layout as QRPh card) */}
        <div className="mt-3 pt-2.5 border-t border-stone-200 flex items-center justify-between text-[11px] text-stone-500">
          <span>TRICOFF KIOSK PH</span>
          <span className="font-mono tabular-nums text-stone-700">
            INSTAPAY-{referenceId.replace('TRC-', '')}
          </span>
        </div>
      </div>
    );
  }

  // Standard QRPh Card
  return (
    <div className="relative bg-white p-4 rounded-xl border border-stone-200/90 shadow-sm select-none">
      {/* Top Standard Header Bar */}
      <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-stone-200">
        <div className="flex items-center gap-1.5">
          <span className="font-bold tracking-tight text-xs text-[#0038A8]">QR</span>
          <span className="font-bold tracking-tight text-xs text-[#CE1126]">Ph</span>
          <span className="text-[11px] text-stone-400">·</span>
          <span className="text-[11px] font-medium text-stone-600">
            National QR Standard
          </span>
        </div>
        <span className="font-mono text-xs font-semibold text-stone-900 tabular-nums">
          ₱{amount.toFixed(2)}
        </span>
      </div>

      {/* SVG QR Matrix */}
      <div className={`relative mx-auto ${sizeClass} flex items-center justify-center`}>
        <svg
          viewBox={`0 0 ${qrPhSize} ${qrPhSize}`}
          className={`w-full h-full transition-opacity duration-200 ${
            isPaid ? 'opacity-25' : 'opacity-100'
          }`}
          shapeRendering="crispEdges"
          aria-label={`QRPh Payment Code for ${referenceId} amount PHP ${amount}`}
        >
          {qrPhMatrix.map((row, rIdx) =>
            row.map((cell, cIdx) =>
              cell ? (
                <rect
                  key={`${rIdx}-${cIdx}`}
                  x={cIdx}
                  y={rIdx}
                  width={1}
                  height={1}
                  fill="#181412"
                />
              ) : null
            )
          )}
        </svg>

        {/* Center QRPh Emblem */}
        {!isPaid && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-11 h-11 rounded-md bg-white border-2 border-stone-900 flex flex-col items-center justify-center shadow-xs">
              <div className="flex items-center leading-none">
                <span className="text-[10px] font-extrabold text-[#0038A8]">QR</span>
                <span className="text-[10px] font-extrabold text-[#CE1126]">Ph</span>
              </div>
              <div className="w-6 h-1 mt-0.5 rounded-full bg-[#FCD116]" />
            </div>
          </div>
        )}

        {/* Scanning Feedback Overlay */}
        {isScanning && !isPaid && (
          <div className="absolute inset-0 bg-stone-950/75 backdrop-blur-[2px] rounded-lg flex flex-col items-center justify-center text-center p-3">
            <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-2" />
            <p className="text-xs font-semibold text-white">
              Verifying QRPh Payment...
            </p>
            <p className="font-mono text-[11px] text-stone-300 mt-0.5 tabular-nums">
              {referenceId}
            </p>
          </div>
        )}

        {/* Verified Overlay */}
        {isPaid && (
          <div className="absolute inset-0 bg-emerald-950/90 rounded-lg flex flex-col items-center justify-center text-center p-3 text-white">
            <div className="w-8 h-8 rounded-full bg-emerald-500 text-stone-950 flex items-center justify-center font-bold text-sm mb-1.5">
              ✓
            </div>
            <p className="text-xs font-semibold tracking-wide text-emerald-200">
              QRPh Payment Verified
            </p>
            <p className="font-mono text-xs text-white mt-0.5 tabular-nums">
              ₱{amount.toFixed(2)} Settled
            </p>
          </div>
        )}
      </div>

      {/* Bottom Merchant & Reference Metadata */}
      <div className="mt-3 pt-2.5 border-t border-stone-200 flex items-center justify-between text-[11px] text-stone-500">
        <span>TRICOFF KIOSK PH</span>
        <span className="font-mono tabular-nums text-stone-700">{referenceId}</span>
      </div>
    </div>
  );
};
