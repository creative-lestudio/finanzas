import type { Account, AccountKind } from '../lib/types';
import { Icon } from './icons';

export const KIND_LABEL: Record<AccountKind, string> = {
  checking: 'Cuentas corrientes',
  savings: 'Ahorro',
  cash: 'Efectivo',
  investment: 'Inversiones',
  crypto: 'Criptomonedas',
  card: 'Tarjetas de crédito',
  loan: 'Préstamos e hipotecas',
};

export const KIND_ICON: Record<AccountKind, string> = { checking: 'bank', savings: 'piggy', cash: 'banknote', investment: 'trend', crypto: 'coins', card: 'card', loan: 'receipt' };

/** Logo de una cuenta: tu imagen (p. ej. el logo del banco), un icono elegido o el del tipo de cuenta. */
export function AccountLogo({ account, size = 44 }: { account: Pick<Account, 'image' | 'icon' | 'kind'>; size?: number }) {
  const radius = Math.round(size * 0.28);
  const box = { width: size, height: size, borderRadius: radius, flex: 'none' as const };
  if (account.image) return <img src={account.image} alt="" style={{ ...box, objectFit: 'cover', background: '#fff', boxShadow: '0 0 0 0.5px var(--hairline)' }} />;
  const icon = account.icon?.startsWith('ic:') ? account.icon.slice(3) : account.icon ? '' : KIND_ICON[account.kind];
  return (
    <span className="icon" style={{ ...box, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: size * 0.5 }}>
      {icon ? <Icon name={icon} size={Math.round(size * 0.5)} /> : account.icon}
    </span>
  );
}

/** Reduce una imagen subida a un logo cuadrado pequeño (para que ocupe poco y se sincronice rápido). */
export async function fileToLogo(file: File, size = 128): Promise<string> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen.');
  const k = Math.max(size / bmp.width, size / bmp.height);
  const w = bmp.width * k;
  const h = bmp.height * k;
  ctx.drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h);
  let out = canvas.toDataURL('image/png');
  if (out.length > 70_000) out = canvas.toDataURL('image/jpeg', 0.82); // fotos grandes: JPEG
  return out;
}
