import { mergeMovements, type RawMovement } from './importer';
import { today } from './money';
import type { AppData } from './types';

// Conexión bancaria por Open Banking (PSD2).
//
// La app NUNCA ve ni guarda las credenciales del banco: el usuario se
// autentica en la web de su propio banco (SCA) y el proveedor regulado
// (AISP) devuelve un permiso de solo lectura válido 90-180 días.
//
// Las claves del proveedor no pueden vivir en el navegador, así que las
// llamadas pasan por una función serverless propia (ver
// supabase/functions/bank-proxy). Este módulo solo habla con ese proxy.

export interface Bank {
  name: string;
  country: string;
  logo?: string;
}

export interface LinkedAccount {
  id: string;
  name: string;
  iban?: string;
  currency: string;
}

export class BankClient {
  constructor(
    private readonly proxyUrl: string,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.proxyUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
    if (!res.ok) throw new Error(`Banco: ${res.status} ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  banks(country = 'ES') {
    return this.call<Bank[]>(`/banks?country=${country}`);
  }

  /** Devuelve la URL del banco donde el usuario da su consentimiento. */
  connect(bank: Bank, redirectUrl: string) {
    return this.call<{ url: string }>('/connect', {
      method: 'POST',
      body: JSON.stringify({ bank: bank.name, country: bank.country, redirectUrl }),
    });
  }

  /** Canjea el código que devuelve el banco tras el consentimiento. */
  session(code: string) {
    return this.call<{ sessionId: string; accounts: LinkedAccount[] }>('/session', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  balance(accountId: string) {
    return this.call<{ amount: number; currency: string }>(`/accounts/${encodeURIComponent(accountId)}/balance`);
  }

  transactions(accountId: string, from: string) {
    return this.call<RawMovement[]>(`/accounts/${encodeURIComponent(accountId)}/transactions?from=${from}`);
  }
}

/** Sincroniza todas las cuentas vinculadas: saldo + movimientos nuevos. */
export async function syncAll(data: AppData, client: BankClient): Promise<{ data: AppData; added: number }> {
  if (data.settings.offlineOnly) throw new Error('El modo sin terceros está activado.');
  let next = data;
  let added = 0;
  for (const acc of data.accounts.filter((a) => a.source !== 'manual' && a.source !== 'import' && a.externalId)) {
    const from = acc.lastSync
      ? new Date(Date.parse(acc.lastSync) - 7 * 86_400_000).toISOString().slice(0, 10)
      : new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    const [bal, movs] = await Promise.all([client.balance(acc.externalId!), client.transactions(acc.externalId!, from)]);
    const r = mergeMovements(next, acc.id, movs);
    added += r.added.length;
    next = {
      ...r.data,
      accounts: r.data.accounts.map((a) => (a.id === acc.id ? { ...a, balance: bal.amount, lastSync: today() } : a)),
    };
  }
  return { data: next, added };
}
