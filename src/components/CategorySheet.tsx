import { useState } from 'react';
import { DEFAULT_CATEGORIES } from '../lib/defaults';
import { FAMILIES } from '../lib/families';
import { uid } from '../lib/money';
import type { Category } from '../lib/types';
import { useStore } from '../store';
import { Field, Sheet, toast } from './ui';

const EMOJIS = ['🏢', '🏬', '🧾', '🔧', '📦', '🛠️', '📣', '🧑‍💼', '💻', '🚚', '🏷️', '🧴', '🍴', '📱', '🎯', '💡', '🧰', '🪪', '🏦', '🌐'];

export const isDefaultCategory = (id: string) => DEFAULT_CATEGORIES.some((c) => c.id === id);

/** Categorías típicas de un negocio, con el nombre del negocio por delante (Legacy World · Alquiler…). */
export function businessCategories(name: string): Category[] {
  const n = name.trim();
  const mk = (suffix: string, icon: string, kind: Category['kind'] = 'expense'): Category => ({ id: `custom_${uid()}`, name: `${n} · ${suffix}`, icon, kind, family: 'negocio' });
  return [
    mk('Alquiler', '🏢'),
    mk('Condominio', '🏬'),
    mk('Servicios (luz, agua, internet)', '💡'),
    mk('Compras e inventario', '📦'),
    mk('Sueldos y colaboradores', '🧑‍💼'),
    mk('Publicidad', '📣'),
    mk('Impuestos y permisos', '🧾'),
    mk('Herramientas y software', '💻'),
    mk('Ventas', '💰', 'income'),
  ];
}

/** Crear o editar una categoría: nombre, icono, tipo y grupo de color. */
export function CategorySheet({ initial, defaultKind = 'expense', onClose, onSaved }: { initial?: Category; defaultKind?: Category['kind']; onClose: () => void; onSaved?: (c: Category) => void }) {
  const { data, update } = useStore();
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '🏢');
  const [kind, setKind] = useState<Category['kind']>(initial?.kind ?? defaultKind);
  const [family, setFamily] = useState(initial?.family ?? (kind === 'income' ? 'otros' : 'negocio'));
  const base = initial ? isDefaultCategory(initial.id) : false;
  const duplicate = data.categories.some((c) => c.id !== initial?.id && c.name.trim().toLowerCase() === name.trim().toLowerCase());

  const save = () => {
    const n = name.trim();
    if (!n || duplicate) return;
    const cat: Category = { id: initial?.id ?? `custom_${uid()}`, name: n, icon: icon || '•', kind, ...(kind === 'expense' ? { family } : {}) };
    update((d) => ({ ...d, categories: initial ? d.categories.map((c) => (c.id === initial.id ? { ...c, ...cat } : c)) : [...d.categories, cat] }));
    toast(initial ? 'Categoría actualizada' : 'Categoría creada');
    onSaved?.(cat);
    onClose();
  };

  return (
    <Sheet title={initial ? 'Editar categoría' : 'Nueva categoría'} onClose={onClose}>
      <Field label="Nombre"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Legacy World · Alquiler" aria-label="Nombre de la categoría" /></Field>
      {duplicate && <p className="tiny" style={{ color: 'var(--bad)', marginTop: -4 }}>Ya existe una categoría con ese nombre.</p>}
      {!base && !initial && (
        <div className="seg" style={{ marginBottom: 12 }}>
          <button type="button" className={kind === 'expense' ? 'on' : ''} onClick={() => setKind('expense')}>Gasto</button>
          <button type="button" className={kind === 'income' ? 'on' : ''} onClick={() => { setKind('income'); }}>Ingreso</button>
        </div>
      )}
      <label style={{ margin: '0 4px' }}>Icono</label>
      <div className="row wrap" style={{ gap: 6, margin: '6px 0 12px' }}>
        {EMOJIS.map((e) => (
          <button key={e} type="button" className={`icon-btn ${icon === e ? 'on' : ''}`} style={{ width: 40, height: 40, fontSize: 20, boxShadow: icon === e ? '0 0 0 2px var(--accent-fill)' : undefined }} onClick={() => setIcon(e)} aria-label={`Icono ${e}`} aria-pressed={icon === e}>{e}</button>
        ))}
      </div>
      {kind === 'expense' && (
        <>
          <label style={{ margin: '0 4px' }}>Grupo de color</label>
          <div className="row wrap" style={{ gap: 8, margin: '6px 0 12px' }}>
            {FAMILIES.map((f) => (
              <button key={f.id} type="button" className="chip-pick" onClick={() => setFamily(f.id)} aria-pressed={family === f.id} style={{ boxShadow: family === f.id ? `0 0 0 2px ${f.color}` : undefined }}>
                <i style={{ background: f.color }} />{f.label}
              </button>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 0 }}>«Negocio» agrupa los gastos de tu emprendimiento con su propio color en los gráficos.</p>
        </>
      )}
      <button className="btn primary block mt" disabled={!name.trim() || duplicate} onClick={save}>{initial ? 'Guardar' : 'Crear categoría'}</button>
    </Sheet>
  );
}
