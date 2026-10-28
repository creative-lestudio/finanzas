import { useEffect, useState } from 'react';
import { AuthForm } from '../components/AuthForm';
import { Icon } from '../components/icons';
import { Field, Segmented, Switch, toast } from '../components/ui';
import { BankClient, syncAll, type Bank } from '../lib/banking';
import type { EncryptedBlob } from '../lib/crypto';
import { applyExcelImport, exportWorkbook, readWorkbook } from '../lib/excel';
import { CURRENCIES } from '../lib/fx';
import { mergeMovements, parseBankCSV } from '../lib/importer';
import { normalize, today, uid } from '../lib/money';
import { getSupabaseConfig, setSupabaseConfig, supabase } from '../lib/sync';
import { IS_PREVIEW } from '../lib/preview';
import { ACCENTS } from '../lib/theme';
import type { Settings as SettingsT } from '../lib/types';
import { useStore } from '../store';

async function download(name: string, blob: Blob) {
  // En la vista previa de claude.ai las descargas pasan por la capacidad `downloads`.
  if (IS_PREVIEW) {
    const c = (window as unknown as { claude?: { use?: (n: string) => Promise<{ save(r: { filename: string; data: Blob }): Promise<unknown> } | null> } }).claude;
    const downloads = await c?.use?.('downloads');
    if (downloads) {
      await downloads.save({ filename: name, data: blob }).catch(() => toast('Descarga cancelada'));
      return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function Settings() {
  const store = useStore();
  const { data, update } = store;
  const s = data.settings;
  const setSettings = (patch: Partial<SettingsT>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const theme = s.theme ?? { accent: '#0a84ff', mode: 'auto' as const };

  return (
    <>
      <div className="section-title">Apariencia</div>
      <div className="card glass">
        <h2>Color principal</h2>
        <div className="swatches mb">
          {ACCENTS.map(([name, hex]) => (
            <button key={hex} className={`swatch ${theme.accent.toLowerCase() === hex ? 'on' : ''}`} style={{ background: hex }} aria-label={name} title={name} onClick={() => setSettings({ theme: { ...theme, accent: hex } })} />
          ))}
          <label title="Color personalizado" style={{ margin: 0 }}>
            <input type="color" value={theme.accent} onChange={(e) => setSettings({ theme: { ...theme, accent: e.target.value } })} aria-label="Color personalizado" />
          </label>
        </div>
        <h2>Tema</h2>
        <Segmented value={theme.mode} onChange={(mode) => setSettings({ theme: { ...theme, mode } })} options={[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']]} />
        <Field label="Moneda principal (informes y patrimonio)">
          <select value={s.currency} onChange={(e) => setSettings({ currency: e.target.value })}>
            {CURRENCIES.filter((c) => !c.custom).map((c) => <option key={c.code} value={c.code}>{c.flag} {c.code} · {c.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="section-title">Cuenta y sincronización</div>
      <SyncSection />

      <div className="section-title">Inteligencia artificial</div>
      <AISection />

      <div className="section-title">Privacidad</div>
      <div className="card glass">
        <Switch checked={s.offlineOnly} onChange={(v) => setSettings({ offlineOnly: v })}>
          <b>Modo sin terceros</b>
          <div className="small muted">Control 100 % manual. Nada sale del dispositivo: sin banco, IA ni descarga de tasas. La sincronización (cifrada) sigue funcionando si la activas.</div>
        </Switch>
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          Tus datos se guardan cifrados (AES-256-GCM, clave derivada de tu contraseña con PBKDF2 · 600.000 iteraciones). La app se bloquea tras 5 minutos de inactividad.
        </p>
      </div>

      <div className="section-title">Datos</div>
      <DataSection />

      <div className="section-title">Banco (Open Banking)</div>
      <BankSection />

      <div className="section-title">Categorización</div>
      <RulesSection />

      <div className="section-title">Seguridad</div>
      <SecuritySection />
      <p className="tiny muted center">Finanzas · tus datos son tuyos</p>
    </>
  );
}

function SyncSection() {
  const store = useStore();
  const [user, setUser] = useState<string | null>(null);
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);
  const cfg = getSupabaseConfig();
  const [url, setUrl] = useState(cfg?.url ?? '');
  const [key, setKey] = useState(cfg?.anonKey ?? '');
  const sb = supabase();

  useEffect(() => {
    void sb?.auth.getUser().then(({ data }) => setUser(data.user?.email ?? null));
  }, [sb, store.sync.status]);

  const link = async () => {
    setBusy(true);
    try {
      const r = await store.linkCloud(pass);
      toast(r === 'linked' ? 'Dispositivo sincronizado' : 'La contraseña de cifrado no coincide.');
      if (r === 'linked') setPass('');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card glass">
      {!sb ? (
        <p className="small muted" style={{ marginTop: 0 }}>La sincronización no está configurada en esta instalación.</p>
      ) : !user ? (
        <>
          <p className="small secondary" style={{ marginTop: 0 }}>
            Crea una cuenta para tener tus datos en el móvil, la tablet y el ordenador. Se suben <b>cifrados de extremo a extremo</b>: ni el servidor puede leerlos.
          </p>
          <AuthForm onDone={() => void sb.auth.getUser().then(({ data }) => setUser(data.user?.email ?? null))} />
        </>
      ) : store.sync.status === 'off' ? (
        <>
          <p className="small" style={{ marginTop: 0 }}>Sesión iniciada como <b>{user}</b>. Confirma tu contraseña de cifrado para activar la sincronización en este dispositivo.</p>
          <div className="row">
            <input type="password" placeholder="Contraseña de cifrado" value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Contraseña de cifrado" />
            <button className="btn primary" disabled={!pass || busy} onClick={link}>{busy ? '…' : 'Activar'}</button>
          </div>
          <p className="tiny muted">Si ya usas la app en otro dispositivo, usa la misma contraseña: se fusionarán los datos de ambos.</p>
          <button className="btn ghost sm" onClick={() => void sb.auth.signOut().then(() => setUser(null))}>Cerrar sesión</button>
        </>
      ) : (
        <>
          <div className="row">
            <span className="icon accent"><Icon name="cloud" size={20} /></span>
            <div className="grow">
              <b>Sincronización activa</b>
              <div className="small muted">
                {user} · {store.sync.status === 'syncing' ? 'sincronizando…' : store.sync.error ? store.sync.error : store.sync.lastSync ? `última: ${new Date(store.sync.lastSync).toLocaleString('es-ES')}` : 'pendiente'}
              </div>
            </div>
          </div>
          <div className="grid2 mt">
            <button className="btn tinted" onClick={() => void store.syncNow()}>Sincronizar ahora</button>
            <button className="btn" onClick={() => void store.unlinkCloud()}>Desactivar</button>
          </div>
        </>
      )}
      <button className="btn ghost sm mt" onClick={() => setCfgOpen(!cfgOpen)}>{cfgOpen ? 'Ocultar' : 'Servidor propio (avanzado)'}</button>
      {cfgOpen && (
        <div className="mt">
          <Field label="URL de Supabase"><input value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://xxxx.supabase.co" /></Field>
          <Field label="Clave pública (anon)"><input value={key} onChange={(e) => setKey(e.target.value.trim())} /></Field>
          <div className="grid2">
            <button className="btn tinted" disabled={!url || !key} onClick={() => { setSupabaseConfig({ url, anonKey: key }); toast('Servidor guardado'); location.reload(); }}>Guardar</button>
            <button className="btn" onClick={() => { setSupabaseConfig(null); location.reload(); }}>Usar el de la app</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AISection() {
  const { data, update } = useStore();
  const s = data.settings;
  const setSettings = (patch: Partial<SettingsT>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const mode = s.aiMode ?? 'server';
  return (
    <div className="card glass">
      <p className="small secondary" style={{ marginTop: 0 }}>
        El asesor, el dictado inteligente y la clasificación automática usan Claude (Anthropic). Se envía un resumen de tus finanzas, nunca contraseñas ni IBAN.
      </p>
      {s.offlineOnly && <div className="alert warning small">Desactiva el modo sin terceros para usar la IA.</div>}
      <Segmented value={mode} onChange={(v) => setSettings({ aiMode: v })} options={[['server', 'IA de la app'], ['own', 'Mi clave de API']]} />
      {mode === 'server' ? (
        <p className="small muted" style={{ margin: 0 }}>Incluida con tu cuenta (Ajustes → Cuenta). Límite diario de consultas.</p>
      ) : (
        <Field label="Clave de API de Anthropic (console.anthropic.com)">
          <input type="password" autoComplete="off" value={s.anthropicApiKey ?? ''} onChange={(e) => setSettings({ anthropicApiKey: e.target.value.trim() || undefined })} placeholder="sk-ant-…" />
        </Field>
      )}
      <Switch checked={s.aiCategorization} disabled={s.offlineOnly} onChange={(v) => setSettings({ aiCategorization: v })}>
        Clasificar con IA lo que las reglas no reconozcan
      </Switch>
    </div>
  );
}

function DataSection() {
  const { data, update } = useStore();
  const [account, setAccount] = useState(data.accounts.find((a) => a.kind === 'checking')?.id ?? '');
  const [busy, setBusy] = useState(false);

  const onExcel = async (file: File) => {
    setBusy(true);
    try {
      const imp = await readWorkbook(await file.arrayBuffer());
      if (!imp.movements.length) {
        toast('No encontré movimientos. Necesito columnas de fecha, concepto e importe.');
        return;
      }
      let base = data;
      let target = account;
      if (!target) {
        target = uid();
        base = { ...data, accounts: [...data.accounts, { id: target, name: file.name.replace(/\.\w+$/, ''), kind: 'checking', balance: 0, currency: data.settings.currency, source: 'import' }] };
      }
      const r = applyExcelImport(base, imp, target);
      update(() => r.data);
      toast(`${r.added} movimientos importados${r.duplicates ? `, ${r.duplicates} duplicados omitidos` : ''}${imp.errors ? `, ${imp.errors} filas ignoradas` : ''}`);
    } catch (e) {
      toast(`No se pudo leer el Excel: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const onCSV = async (file: File) => {
    let accountId = account;
    let base = data;
    if (!accountId) {
      accountId = uid();
      base = { ...data, accounts: [...data.accounts, { id: accountId, name: file.name.replace(/\.\w+$/, ''), kind: 'checking', balance: 0, currency: data.settings.currency, source: 'import' }] };
    }
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    // Muchos bancos españoles exportan en Windows-1252.
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    const { movements, errors } = parseBankCSV(text);
    if (!movements.length) return toast('No se reconoció el formato. Necesito columnas de fecha, concepto e importe.');
    const r = mergeMovements(base, accountId, movements);
    update(() => r.data);
    toast(`${r.added.length} movimientos importados${r.duplicates ? `, ${r.duplicates} duplicados omitidos` : ''}${errors ? `, ${errors} filas ignoradas` : ''}`);
  };

  const onFile = (f?: File) => {
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) void onExcel(f);
    else void onCSV(f);
  };

  return (
    <div className="card glass">
      <h2>Exportar</h2>
      <button className="btn tinted block" disabled={busy} onClick={async () => { setBusy(true); try { await download(`finanzas-${today()}.xlsx`, await exportWorkbook(data)); } finally { setBusy(false); } }}>
        <Icon name="download" size={18} /> Descargar Excel completo
      </button>
      <p className="tiny muted">Movimientos, cuentas, presupuestos, metas, cambios de divisa y tasas, cada uno en su hoja.</p>
      <h2 className="mt">Importar</h2>
      <Field label="Cuenta de destino (si el archivo no indica cuenta)">
        <select value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="">Crear cuenta nueva</option>
          {data.accounts.filter((a) => a.kind !== 'investment' && a.kind !== 'crypto').map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
        </select>
      </Field>
      <label className="btn block" style={{ margin: 0, color: 'var(--text)', fontSize: 16 }}>
        <Icon name="upload" size={18} /> {busy ? 'Importando…' : 'Elegir Excel (.xlsx) o CSV'}
        <input type="file" accept=".xlsx,.csv,.txt,.tsv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      <p className="tiny muted" style={{ marginBottom: 0 }}>Vale el extracto de tu banco o un Excel exportado por esta app. Los duplicados se ignoran.</p>
    </div>
  );
}

function RulesSection() {
  const { data, update } = useStore();
  const [rulePattern, setRulePattern] = useState('');
  const [ruleCat, setRuleCat] = useState('groceries');
  return (
    <div className="card glass">
      <p className="small muted" style={{ marginTop: 0 }}>La app aprende cada vez que corriges una categoría. También puedes crear reglas:</p>
      <div className="row">
        <input placeholder="Texto, p. ej. 'frutería paco'" value={rulePattern} onChange={(e) => setRulePattern(e.target.value)} />
        <select value={ruleCat} onChange={(e) => setRuleCat(e.target.value)} style={{ maxWidth: 140 }}>
          {data.categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
        <button className="icon-btn" style={{ background: 'var(--accent)', color: 'var(--on-accent)', flex: 'none' }} disabled={!rulePattern.trim()} aria-label="Añadir regla" onClick={() => { update((d) => ({ ...d, rules: [...d.rules, { id: uid(), pattern: normalize(rulePattern), categoryId: ruleCat }] })); setRulePattern(''); }}>
          <Icon name="plus" size={20} stroke={2.4} />
        </button>
      </div>
      <ul className="list plain small">
        {data.rules.map((r) => (
          <li key={r.id}>
            <span className="grow">"{r.pattern}" → {data.categories.find((c) => c.id === r.categoryId)?.name}</span>
            <button className="btn ghost sm" aria-label="Eliminar regla" onClick={() => update((d) => ({ ...d, rules: d.rules.filter((x) => x.id !== r.id) }))}><Icon name="trash" size={16} /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SecuritySection() {
  const store = useStore();
  const [newPass, setNewPass] = useState('');
  const onBackup = async (file: File) => {
    const pass = prompt('Contraseña con la que se cifró la copia:');
    if (!pass) return;
    const ok = await store.importBackup(JSON.parse(await file.text()) as EncryptedBlob, pass);
    toast(ok ? 'Copia restaurada' : 'Contraseña incorrecta o archivo dañado');
  };
  return (
    <div className="card glass">
      <h2>Cambiar contraseña de cifrado</h2>
      <div className="row mb">
        <input type="password" placeholder="Nueva contraseña" value={newPass} onChange={(e) => setNewPass(e.target.value)} aria-label="Nueva contraseña" />
        <button className="btn tinted" disabled={newPass.length < 6} onClick={async () => { await store.changePassphrase(newPass); setNewPass(''); toast('Contraseña cambiada'); }}>Cambiar</button>
      </div>
      <div className="grid2">
        <button className="btn" onClick={async () => void download(`finanzas-${today()}.cifrado.json`, new Blob([JSON.stringify(await store.exportBackup())], { type: 'application/json' }))}>Copia cifrada</button>
        <label className="btn" style={{ margin: 0, color: 'var(--text)', fontSize: 16 }}>
          Restaurar
          <input type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && void onBackup(e.target.files[0])} />
        </label>
      </div>
      <button className="btn block mt" onClick={store.lock}><Icon name="lock" size={18} /> Bloquear ahora</button>
      <button className="btn danger block mt" onClick={() => confirm('Se borrarán todos tus datos de este dispositivo. ¿Seguro?') && void store.wipe()}>Borrar todos los datos</button>
    </div>
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
      <div className="card glass">
        <p className="small muted" style={{ margin: 0 }}>Desactivada por el modo sin terceros. Desactívalo para vincular bancos mediante Open Banking (PSD2). Mientras, puedes importar extractos en Excel o CSV.</p>
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
    <div className="card glass">
      <p className="small muted" style={{ marginTop: 0 }}>
        Te identificas en la web de tu banco y la app solo recibe permiso de <b>lectura</b> (PSD2, hasta 180 días) a través de un proveedor regulado. Nunca vemos tus claves.
      </p>
      <Field label="URL del servidor puente (bank-proxy)">
        <input placeholder="https://<proyecto>.supabase.co/functions/v1/bank-proxy" value={bank.proxyUrl ?? ''} onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, bank: { provider: 'enablebanking', proxyUrl: e.target.value.trim() || undefined } } }))} />
      </Field>
      {client && (
        <>
          {linked.length > 0 && (
            <button className="btn primary block mb" disabled={busy} onClick={sync}>{busy ? 'Sincronizando…' : `Sincronizar ${linked.length} cuenta(s)`}</button>
          )}
          <Field label="Vincular un banco"><input placeholder="Busca tu banco: BBVA, Santander, CaixaBank…" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          <ul className="list plain small">
            {filtered.map((b) => (
              <li key={b.name}>
                {b.logo && <img src={b.logo} alt="" width={24} height={24} />}
                <span className="grow">{b.name}</span>
                <button className="btn sm tinted" disabled={busy} onClick={() => connect(b)}>Conectar</button>
              </li>
            ))}
            {!banks.length && <li className="muted">No se pudo cargar la lista de bancos desde el servidor.</li>}
          </ul>
          <p className="tiny muted">Bizum: sus movimientos llegan dentro de tu cuenta bancaria y se detectan solos.</p>
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
  history.replaceState(null, '', location.pathname + location.hash);
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
