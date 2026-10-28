import { useEffect, useState } from 'react';
import { BankClient, syncAll, type Bank } from '../lib/banking';
import type { EncryptedBlob } from '../lib/crypto';
import { mergeMovements, parseBankCSV } from '../lib/importer';
import { normalize, today, uid } from '../lib/money';
import { useStore } from '../store';
import { Field, toast } from '../components/ui';

function download(name: string, content: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Settings() {
  const store = useStore();
  const { data, update } = store;
  const s = data.settings;
  const setSettings = (patch: Partial<typeof s>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const [importAccount, setImportAccount] = useState(data.accounts.find((a) => a.kind === 'checking')?.id ?? '');
  const [newPass, setNewPass] = useState('');
  const [rulePattern, setRulePattern] = useState('');
  const [ruleCat, setRuleCat] = useState('groceries');

  const onCSV = async (file: File) => {
    let accountId = importAccount;
    let base = data;
    if (!accountId) {
      accountId = uid();
      base = { ...data, accounts: [...data.accounts, { id: accountId, name: file.name.replace(/\.\w+$/, ''), kind: 'checking', balance: 0, currency: 'EUR', source: 'import' }] };
    }
    // Muchos bancos españoles exportan en Windows-1252.
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    const { movements, errors } = parseBankCSV(text);
    if (!movements.length) {
      toast('No se reconoció el formato. Necesito columnas de fecha, concepto e importe.');
      return;
    }
    const r = mergeMovements(base, accountId, movements);
    update(() => r.data);
    toast(`${r.added.length} movimientos importados${r.duplicates ? `, ${r.duplicates} duplicados omitidos` : ''}${errors ? `, ${errors} filas ignoradas` : ''}`);
  };

  const onBackup = async (file: File) => {
    const pass = prompt('Contraseña con la que se cifró la copia:');
    if (!pass) return;
    const ok = await store.importBackup(JSON.parse(await file.text()) as EncryptedBlob, pass);
    toast(ok ? 'Copia restaurada' : 'Contraseña incorrecta o archivo dañado');
  };

  return (
    <>
      <div className="card">
        <h2>🔒 Privacidad</h2>
        <label className="check">
          <input type="checkbox" checked={s.offlineOnly} onChange={(e) => setSettings({ offlineOnly: e.target.checked })} />
          <span><b>Modo sin terceros</b><br /><span className="small muted">Control 100 % manual. Ningún dato sale de tu dispositivo: sin conexión bancaria ni IA.</span></span>
        </label>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Tus datos se guardan cifrados (AES-256-GCM, clave derivada de tu contraseña con PBKDF2 · 600.000 iteraciones) solo en este dispositivo. La app se bloquea tras 5 minutos de inactividad.
        </p>
      </div>

      <BankSection />

      <div className="card">
        <h2>📄 Importar extracto (CSV)</h2>
        <p className="small muted" style={{ marginTop: 0 }}>Descarga los movimientos desde la web de tu banco (Excel/CSV) e impórtalos. Los duplicados se ignoran.</p>
        <Field label="Cuenta de destino">
          <select value={importAccount} onChange={(e) => setImportAccount(e.target.value)}>
            <option value="">Crear cuenta nueva</option>
            {data.accounts.filter((a) => a.kind !== 'investment' && a.kind !== 'crypto').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <input type="file" accept=".csv,.txt,.tsv" onChange={(e) => e.target.files?.[0] && onCSV(e.target.files[0])} />
      </div>

      <div className="card">
        <h2>✨ Categorización</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          La app clasifica con reglas y aprende cada vez que corriges una categoría. Puedes añadir reglas propias:
        </p>
        <div className="row">
          <input placeholder="Texto, p. ej. 'frutería paco'" value={rulePattern} onChange={(e) => setRulePattern(e.target.value)} />
          <select value={ruleCat} onChange={(e) => setRuleCat(e.target.value)} style={{ maxWidth: 150 }}>
            {data.categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <button
            className="btn"
            disabled={!rulePattern.trim()}
            onClick={() => {
              update((d) => ({ ...d, rules: [...d.rules, { id: uid(), pattern: normalize(rulePattern), categoryId: ruleCat }] }));
              setRulePattern('');
            }}
          >
            +
          </button>
        </div>
        <ul className="list small">
          {data.rules.map((r) => (
            <li key={r.id}>
              <span className="grow">"{r.pattern}" → {data.categories.find((c) => c.id === r.categoryId)?.name}</span>
              <button className="btn ghost" aria-label="Eliminar regla" onClick={() => update((d) => ({ ...d, rules: d.rules.filter((x) => x.id !== r.id) }))}>✕</button>
            </li>
          ))}
        </ul>
        <label className="check">
          <input type="checkbox" checked={s.aiCategorization} disabled={s.offlineOnly} onChange={(e) => setSettings({ aiCategorization: e.target.checked })} />
          <span>Usar IA (Claude) para lo que las reglas no reconozcan<br /><span className="small muted">Solo se envía el concepto del movimiento, nunca saldos ni IBAN. Requiere tu propia clave.</span></span>
        </label>
        {s.aiCategorization && !s.offlineOnly && (
          <Field label="Clave de API de Anthropic">
            <input type="password" autoComplete="off" value={s.anthropicApiKey ?? ''} onChange={(e) => setSettings({ anthropicApiKey: e.target.value.trim() || undefined })} placeholder="sk-ant-…" />
          </Field>
        )}
      </div>

      <div className="card">
        <h2>🛡️ Seguridad y copias</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <input type="password" placeholder="Nueva contraseña" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
          <button
            className="btn"
            disabled={newPass.length < 6}
            onClick={async () => {
              await store.changePassphrase(newPass);
              setNewPass('');
              toast('Contraseña cambiada');
            }}
          >
            Cambiar
          </button>
        </div>
        <div className="grid2">
          <button className="btn" onClick={async () => download(`finanzas-${today()}.json`, JSON.stringify(await store.exportBackup()))}>Exportar copia cifrada</button>
          <label className="btn" style={{ textAlign: 'center', margin: 0, color: 'var(--text)', fontSize: 15 }}>
            Restaurar copia
            <input type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && onBackup(e.target.files[0])} />
          </label>
        </div>
        <button className="btn block" style={{ marginTop: 12 }} onClick={store.lock}>Bloquear ahora</button>
        <button
          className="btn danger block"
          style={{ marginTop: 8 }}
          onClick={() => confirm('Se borrarán todos tus datos de este dispositivo. ¿Seguro?') && store.wipe()}
        >
          Borrar todos los datos
        </button>
      </div>
    </>
  );
}

function BankSection() {
  const { data, update } = useStore();
  const s = data.settings;
  const bank = s.bank ?? { provider: 'none' };
  const [banks, setBanks] = useState<Bank[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const client = bank.proxyUrl ? new BankClient(bank.proxyUrl) : null;
  const linked = data.accounts.filter((a) => a.source !== 'manual' && a.source !== 'import');

  useEffect(() => {
    if (!client || s.offlineOnly) return;
    client.banks('ES').then(setBanks).catch(() => setBanks([]));
  }, [bank.proxyUrl, s.offlineOnly]);

  if (s.offlineOnly) {
    return (
      <div className="card">
        <h2>🏦 Conexión bancaria</h2>
        <p className="small muted" style={{ margin: 0 }}>Desactivada por el modo sin terceros. Desactívalo para vincular tus bancos mediante Open Banking (PSD2).</p>
      </div>
    );
  }

  const connect = async (b: Bank) => {
    if (!client) return;
    setBusy(true);
    try {
      const { url } = await client.connect(b, `${location.origin}${location.pathname}`);
      location.href = url;
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };

  const sync = async () => {
    if (!client) return;
    setBusy(true);
    try {
      const r = await syncAll(data, client);
      update(() => r.data);
      toast(`${r.added} movimientos nuevos`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const filtered = banks.filter((b) => normalize(b.name).includes(normalize(q))).slice(0, 12);

  return (
    <div className="card">
      <h2>🏦 Conexión bancaria (Open Banking)</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        Te autenticas en la web de tu banco; la app solo recibe permiso de <b>lectura</b> (PSD2, renovable cada 180 días) a través de un proveedor regulado. Nunca vemos tus claves.
      </p>
      <Field label="URL de tu servidor puente (bank-proxy)">
        <input
          placeholder="https://<proyecto>.supabase.co/functions/v1/bank-proxy"
          value={bank.proxyUrl ?? ''}
          onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, bank: { provider: 'enablebanking', proxyUrl: e.target.value.trim() || undefined } } }))}
        />
      </Field>
      {client && (
        <>
          {linked.length > 0 && (
            <button className="btn primary block" disabled={busy} onClick={sync} style={{ marginBottom: 12 }}>
              {busy ? 'Sincronizando…' : `Sincronizar ${linked.length} cuenta(s)`}
            </button>
          )}
          <Field label="Vincular un banco">
            <input placeholder="Busca tu banco: BBVA, Santander, CaixaBank…" value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
          <ul className="list small">
            {filtered.map((b) => (
              <li key={b.name}>
                {b.logo && <img src={b.logo} alt="" width={24} height={24} />}
                <span className="grow">{b.name}</span>
                <button className="btn" disabled={busy} onClick={() => connect(b)}>Conectar</button>
              </li>
            ))}
            {!banks.length && <li className="muted">No se pudo cargar la lista de bancos desde el servidor.</li>}
          </ul>
          <p className="small muted">Bizum: sus movimientos llegan dentro de tu cuenta bancaria y se detectan automáticamente.</p>
        </>
      )}
    </div>
  );
}

/** Tras volver de la web del banco (?code=...), canjea el código y crea las cuentas. */
export async function handleBankCallback(store: ReturnType<typeof useStore>): Promise<void> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const proxy = store.data.settings.bank?.proxyUrl;
  if (!code || !proxy || store.data.settings.offlineOnly) return;
  history.replaceState(null, '', location.pathname);
  try {
    const client = new BankClient(proxy);
    const { accounts } = await client.session(code);
    let next = store.data;
    for (const a of accounts) {
      if (next.accounts.some((x) => x.externalId === a.id)) continue;
      next = { ...next, accounts: [...next.accounts, { id: uid(), name: a.name, kind: 'checking', balance: 0, currency: a.currency, source: 'enablebanking', externalId: a.id }] };
    }
    const r = await syncAll(next, client);
    store.update(() => r.data);
    toast(`Banco vinculado: ${accounts.length} cuenta(s), ${r.added} movimientos`);
  } catch (e) {
    toast(`No se pudo vincular el banco: ${(e as Error).message}`);
  }
}

