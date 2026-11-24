import { registerPlugin } from '@capacitor/core';
import { netWorth } from './health';
import { t, LANG } from './i18n';
import { monthSummary } from './insights';
import { formatMoney, today } from './money';
import { isNative } from './native';
import type { AppData } from './types';

// Widget de la pantalla de inicio. La app (única que puede descifrar tus datos) le deja un resumen mínimo
// en el almacenamiento del sistema SOLO si activas «Mostrar saldo en el widget». Sin ese permiso no se
// guarda ninguna cifra y el widget solo ofrece abrir la app o anotar un gasto.
interface WidgetPlugin {
  update(o: { show: boolean; title?: string; amount?: string; sub?: string }): Promise<void>;
}
const Widget = registerPlugin<WidgetPlugin>('FinanzasWidget');

let last = '';
/** Envía el resumen al widget si cambió. No hace nada fuera de la app instalada de Android. */
export async function pushWidget(data: AppData): Promise<void> {
  if (!isNative()) return;
  const show = Boolean(data.settings.widgetShow);
  const nw = show ? netWorth(data) : null;
  const month = today().slice(0, 7);
  const payload = show && nw
    ? { show: true, title: t('Disponible'), amount: formatMoney(nw.liquid, data.settings.currency), sub: t('Gastos del mes: {amount}', { amount: formatMoney(monthSummary(data, month).expenses, data.settings.currency) }) }
    : { show: false };
  const key = JSON.stringify([payload, LANG]);
  if (key === last) return;
  last = key;
  try {
    await Widget.update(payload);
  } catch {
    /* sin widget (iOS, navegador): se ignora */
  }
}
