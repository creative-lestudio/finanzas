import { useState } from 'react';
import { canMoveUnder, childrenOf, rootsOf } from '../lib/categories';
import { DEFAULT_CATEGORIES } from '../lib/defaults';
import { FAMILIES } from '../lib/families';
import { uid } from '../lib/money';
import type { Category } from '../lib/types';
import { useStore } from '../store';
import { CATEGORY_ICON_CHOICES, Icon } from './icons';
import { Field, Sheet, toast } from './ui';

const EMOJIS = ['🏢', '🏬', '🧾', '🔧', '📦', '🛠️', '📣', '🧑‍💼', '💻', '🚚', '🏷️', '🧴', '🍴', '🍺', '🌳', '👕', '💍', '🎯', '💡', '🌐'];

export const isDefaultCategory = (id: string) => DEFAULT_CATEGORIES.some((c) => c.id === id);

/** Categorías típicas de un negocio: una madre con el nombre del negocio y sus subcategorías. */
export function businessCategories(name: string): Category[] {
  const n = name.trim();
  const rootId = `custom_${uid()}`;
  const sub = (suffix: string, kind: Category['kind'] = 'expense'): Category => ({ id: `custom_${uid()}`, name: suffix, icon: '', kind, parentId: rootId });
  return [
    { id: rootId, name: n, icon: 'ic:briefcase', kind: 'expense', family: 'negocio' },
    sub('Alquiler'),
    sub('Condominio'),
    sub('Servicios (luz, agua, internet)'),
    sub('Compras e inventario'),
    sub('Sueldos y colaboradores'),
    sub('Publicidad'),
    sub('Impuestos y permisos'),
    sub('Herramientas y software'),
    { id: `custom_${uid()}`, name: `${n} · Ventas`, icon: 'ic:coins', kind: 'income' },
  ];
}

/** Elegir icono: de línea (como el resto de la app) o un emoji. */
export function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <div className="icon-grid" role="group" aria-label="Iconos de línea">
        {CATEGORY_ICON_CHOICES.map((n) => (
          <button key={n} type="button" className={value === `ic:${n}` ? 'on' : ''} onClick={() => onChange(`ic:${n}`)} aria-label={`Icono ${n}`} aria-pressed={value === `ic:${n}`}><Icon name={n} size={20} /></button>
        ))}
      </div>
      <div className="icon-grid" role="group" aria-label="Emojis" style={{ marginTop: 6 }}>
        {EMOJIS.map((e) => (
          <button key={e} type="button" className={value === e ? 'on' : ''} onClick={() => onChange(e)} aria-label={`Emoji ${e}`} aria-pressed={value === e} style={{ fontSize: 19 }}>{e}</button>
        ))}
      </div>
      <input className="mt" placeholder="…o escribe tu propio emoji" value={value.startsWith('ic:') ? '' : value} onChange={(e) => onChange(e.target.value.trim().slice(0, 4))} aria-label="Emoji propio" style={{ marginTop: 8 }} />
    </>
  );
}

/** Crear o editar una categoría madre o una subcategoría. */
export function CategorySheet({ initial, defaultKind = 'expense', parentId, onClose, onSaved }: { initial?: Category; defaultKind?: Category['kind']; parentId?: string; onClose: () => void; onSaved?: (c: Category) => void }) {
  const { data, update } = useStore();
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<Category['kind']>(initial?.kind ?? defaultKind);
  const [parent, setParent] = useState<string>(initial?.parentId ?? parentId ?? '');
  const [icon, setIcon] = useState<string>(initial?.icon ?? (parentId ? '' : 'ic:box'));
  const [family, setFamily] = useState(initial?.family ?? 'otros');
  const hasChildren = initial ? childrenOf(data.categories, initial.id).length > 0 : false;
  const parentCat = data.categories.find((c) => c.id === parent);
  const options = rootsOf(data.categories, kind).filter((c) => (initial ? canMoveUnder(data.categories, initial.id, c.id) : true));
  const inherit = Boolean(parent) && icon === '';
  const duplicate = data.categories.some((c) => c.id !== initial?.id && c.name.trim().toLowerCase() === name.trim().toLowerCase() && (c.parentId ?? '') === parent);

  const save = () => {
    const n = name.trim();
    if (!n || duplicate) return;
    const isSub = Boolean(parent);
    const cat: Category = {
      id: initial?.id ?? `custom_${uid()}`,
      name: n,
      icon: isSub && inherit ? '' : icon || 'ic:box',
      kind: isSub ? (parentCat?.kind ?? kind) : kind,
      ...(isSub ? { parentId: parent } : kind === 'expense' ? { family } : {}),
    };
    update((d) => ({
      ...d,
      categories: initial ? d.categories.map((c) => (c.id === initial.id ? (({ parentId: _p, family: _f, ...rest }) => ({ ...rest, ...cat }))(c) : c)) : [...d.categories, cat],
    }));
    toast(initial ? 'Categoría actualizada' : 'Categoría creada');
    onSaved?.(cat);
    onClose();
  };

  return (
    <Sheet title={initial ? 'Editar categoría' : parentId ? 'Nueva subcategoría' : 'Nueva categoría'} onClose={onClose}>
      <Field label="Nombre"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={parentId ? 'Ropa, Higiene, Bar…' : 'Compras, Ocio, Legacy World…'} aria-label="Nombre de la categoría" /></Field>
      {duplicate && <p className="tiny" style={{ color: 'var(--bad)', marginTop: -4 }}>Ya existe una con ese nombre en este grupo.</p>}
      {!initial && !parentId && (
        <div className="seg" style={{ marginBottom: 12 }}>
          <button type="button" className={kind === 'expense' ? 'on' : ''} onClick={() => { setKind('expense'); setParent(''); }}>Gasto</button>
          <button type="button" className={kind === 'income' ? 'on' : ''} onClick={() => { setKind('income'); setParent(''); }}>Ingreso</button>
        </div>
      )}
      {!hasChildren && (
        <Field label="Pertenece a">
          <select value={parent} onChange={(e) => { setParent(e.target.value); if (e.target.value && !initial) setIcon(''); }} aria-label="Categoría madre">
            <option value="">— Ninguna: es una categoría madre —</option>
            {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}
      <label style={{ margin: '0 4px' }}>Icono</label>
      {parent && (
        <label className="switch-row" style={{ margin: '6px 0', color: 'var(--text)', fontSize: 15 }}>
          <span className="grow">Usar el icono de «{parentCat?.name}»<div className="tiny muted">Mantiene la estética: las subcategorías heredan el de su madre.</div></span>
          <input type="checkbox" className="switch" checked={inherit} onChange={(e) => setIcon(e.target.checked ? '' : parentCat?.icon || 'ic:box')} />
        </label>
      )}
      {!inherit && <IconPicker value={icon} onChange={setIcon} />}
      {!parent && kind === 'expense' && (
        <>
          <label style={{ margin: '12px 4px 0' }}>Color</label>
          <div className="row wrap" style={{ gap: 8, margin: '6px 0 6px' }}>
            {FAMILIES.map((f) => (
              <button key={f.id} type="button" className="chip-pick" onClick={() => setFamily(f.id)} aria-pressed={family === f.id} style={{ boxShadow: family === f.id ? `0 0 0 2px ${f.color}` : undefined }}>
                <i style={{ background: f.color }} />{f.label}
              </button>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 0 }}>Sus subcategorías usan este color.</p>
        </>
      )}
      <button className="btn primary block mt" disabled={!name.trim() || duplicate} onClick={save}>{initial ? 'Guardar' : 'Crear'}</button>
    </Sheet>
  );
}
