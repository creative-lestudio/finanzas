import { callClaude, textOf } from './ai';
import { today } from './money';
import type { AppData } from './types';

/** Lo que la IA lee de una foto de recibo. */
export interface Receipt {
  amount: number | null;
  currency: string | null;
  merchant: string | null;
  date: string | null;
  category: string | null;
}

/** Reduce la foto (lado largo ≤ 1280 px, JPEG) para enviarla ligera. No se guarda en ningún sitio. */
export async function photoToJpeg(file: File, max = 1280): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const url = canvas.toDataURL('image/jpeg', 0.7);
  return url.slice(url.indexOf(',') + 1);
}

const SCHEMA = {
  type: 'object',
  properties: {
    amount: { type: ['number', 'null'], description: 'Total pagado, en unidades de la moneda (por ejemplo 12.5), no en céntimos.' },
    currency: { type: ['string', 'null'], description: 'Código ISO de la moneda (EUR, USD, VES…) si se ve; si no, null.' },
    merchant: { type: ['string', 'null'], description: 'Nombre del comercio.' },
    date: { type: ['string', 'null'], description: 'Fecha del recibo en formato AAAA-MM-DD; null si no se lee.' },
    category: { type: ['string', 'null'], description: 'Una de las categorías permitidas, la que mejor encaje; null si ninguna.' },
  },
  required: ['amount', 'currency', 'merchant', 'date', 'category'],
  additionalProperties: false,
};

/** Lee importe, comercio, fecha y categoría de un recibo con IA. La foto no se almacena. */
export async function scanReceipt(data: AppData, file: File): Promise<Receipt> {
  const b64 = await photoToJpeg(file);
  const cats = data.categories.filter((c) => c.kind === 'expense').map((c) => c.name);
  const msg = await callClaude(data, {
    system: `Eres un lector de recibos. Extrae solo lo que se vea con claridad; si no estás seguro de un dato, devuelve null. Hoy es ${today()}. Categorías permitidas: ${cats.join(', ')}.`,
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }, { type: 'text', text: 'Lee este recibo o factura y devuelve el total pagado, la moneda, el comercio, la fecha y la categoría.' }] }],
    schema: SCHEMA,
    effort: 'low',
    maxTokens: 800,
  });
  const r = JSON.parse(textOf(msg)) as Receipt;
  return {
    amount: typeof r.amount === 'number' && r.amount > 0 ? r.amount : null,
    currency: r.currency ? r.currency.toUpperCase() : null,
    merchant: r.merchant?.slice(0, 80) ?? null,
    date: r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null,
    category: r.category,
  };
}
