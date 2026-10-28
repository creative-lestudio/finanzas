// Genera el código QR de la web (public/site/qr.svg). Uso: node scripts/make-qr.mjs [url]
import QRCode from 'qrcode';
import { writeFileSync } from 'node:fs';

const url = process.argv[2] ?? 'https://creative-lestudio.github.io/finanzas/';
const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#04132e', light: '#ffffff' } });
writeFileSync(new URL('../public/site/qr.svg', import.meta.url), svg);
console.log('QR →', url);
