import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeDisplayProps {
  value: string;
  size?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

/**
 * Renders a real, scannable QR code using the `qrcode` npm package.
 * The QR encodes the payment URL the customer scans with their phone.
 * Use errorCorrectionLevel 'H' when a center logo overlay is applied.
 */
export function QrCodeDisplay({
  value,
  size = 256,
  errorCorrectionLevel = 'M',
}: QrCodeDisplayProps) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      color: { dark: '#181412', light: '#FFFFFF' },
      errorCorrectionLevel,
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch((err) => console.error('QR generation failed:', err));
    return () => {
      cancelled = true;
    };
  }, [value, size, errorCorrectionLevel]);

  if (!dataUrl) {
    return (
      <div
        className="animate-pulse bg-stone-800 rounded-lg"
        style={{ width: size, height: size }}
        aria-label="Generating QR code…"
      />
    );
  }

  return (
    <img
      src={dataUrl}
      alt="Scan this QR code to open the payment page"
      width={size}
      height={size}
      className="rounded-lg"
    />
  );
}
