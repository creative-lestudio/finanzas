// Puente Open Banking (PSD2) con Enable Banking — Supabase Edge Function (Deno).
//
// Guarda la clave privada del proveedor fuera del navegador y expone a la app
// una API mínima de solo lectura. Variables de entorno necesarias:
//   ENABLEBANKING_APP_ID       id de la aplicación (kid del JWT)
//   ENABLEBANKING_PRIVATE_KEY  clave privada RSA en PEM (PKCS#8)
//   ALLOWED_ORIGIN             origen de la app (p. ej. https://finanzas.midominio.es)

import { importPKCS8, SignJWT } from 'npm:jose@5.9.6';

const API = 'https://api.enablebanking.com';
const APP_ID = Deno.env.get('ENABLEBANKING_APP_ID') ?? '';
const PEM = (Deno.env.get('ENABLEBANKING_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');
const ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '';

const cors = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  vary: 'origin',
};

async function token(): Promise<string> {
  const key = await importPKCS8(PEM, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: APP_ID })
    .setIssuer('enablebanking.com')
    .setAudience('api.enablebanking.com')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
}

async function eb<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json', ...init.headers },
  });
  if (!res.ok) throw new Response(await res.text(), { status: res.status });
  return res.json() as Promise<T>;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

const cents = (amount: string) => Math.round(parseFloat(amount) * 100);

interface EbTransaction {
  entry_reference?: string;
  transaction_id?: string;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator: 'CRDT' | 'DBIT';
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  remittance_information?: string[];
  creditor?: { name?: string };
  debtor?: { name?: string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (ORIGIN && req.headers.get('origin') !== ORIGIN) return json({ error: 'origin not allowed' }, 403);

  const url = new URL(req.url);
  // Supabase antepone /bank-proxy a la ruta.
  const path = url.pathname.replace(/^.*\/bank-proxy/, '') || '/';

  try {
    if (req.method === 'GET' && path === '/banks') {
      const country = url.searchParams.get('country') ?? 'ES';
      const r = await eb<{ aspsps: { name: string; country: string; logo?: string }[] }>(`/aspsps?country=${country}`);
      return json(r.aspsps.map(({ name, country, logo }) => ({ name, country, logo })));
    }

    if (req.method === 'POST' && path === '/connect') {
      const { bank, country, redirectUrl } = await req.json();
      const validUntil = new Date(Date.now() + 180 * 86_400_000).toISOString();
      const r = await eb<{ url: string }>('/auth', {
        method: 'POST',
        body: JSON.stringify({
          access: { valid_until: validUntil },
          aspsp: { name: bank, country },
          state: crypto.randomUUID(),
          redirect_url: redirectUrl,
          psu_type: 'personal',
        }),
      });
      return json({ url: r.url });
    }

    if (req.method === 'POST' && path === '/session') {
      const { code } = await req.json();
      const r = await eb<{
        session_id: string;
        accounts: { uid: string; name?: string; currency?: string; account_id?: { iban?: string } }[];
      }>('/sessions', { method: 'POST', body: JSON.stringify({ code }) });
      return json({
        sessionId: r.session_id,
        accounts: r.accounts.map((a) => ({
          id: a.uid,
          name: a.name ?? (a.account_id?.iban ? `Cuenta ···${a.account_id.iban.slice(-4)}` : 'Cuenta'),
          iban: a.account_id?.iban ? `···${a.account_id.iban.slice(-4)}` : undefined,
          currency: a.currency ?? 'EUR',
        })),
      });
    }

    const m = path.match(/^\/accounts\/([^/]+)\/(balance|transactions)$/);
    if (req.method === 'GET' && m) {
      const id = encodeURIComponent(decodeURIComponent(m[1]));
      if (m[2] === 'balance') {
        const r = await eb<{ balances: { balance_amount: { amount: string; currency: string }; balance_type: string }[] }>(`/accounts/${id}/balances`);
        const pref = ['ITAV', 'CLAV', 'CLBD', 'XPCD', 'ITBD'];
        const b = pref.map((t) => r.balances.find((x) => x.balance_type === t)).find(Boolean) ?? r.balances[0];
        return json({ amount: b ? cents(b.balance_amount.amount) : 0, currency: b?.balance_amount.currency ?? 'EUR' });
      }
      const from = url.searchParams.get('from') ?? new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
      const out: unknown[] = [];
      let cont: string | undefined;
      do {
        const q = new URLSearchParams({ date_from: from, ...(cont ? { continuation_key: cont } : {}) });
        const r = await eb<{ transactions: EbTransaction[]; continuation_key?: string }>(`/accounts/${id}/transactions?${q}`);
        for (const t of r.transactions) {
          const sign = t.credit_debit_indicator === 'DBIT' ? -1 : 1;
          out.push({
            externalId: t.entry_reference ?? t.transaction_id,
            date: t.booking_date ?? t.value_date ?? t.transaction_date,
            amount: sign * Math.abs(cents(t.transaction_amount.amount)),
            description:
              t.remittance_information?.join(' ').trim() || (sign < 0 ? t.creditor?.name : t.debtor?.name) || 'Movimiento',
          });
        }
        cont = r.continuation_key;
      } while (cont);
      return json(out);
    }

    return json({ error: 'not found' }, 404);
  } catch (e) {
    if (e instanceof Response) return json({ error: await e.text() }, e.status);
    return json({ error: String(e) }, 500);
  }
});
