import { useState } from 'react';
import { childrenOf, rootsOf } from '../lib/categories';
import { applySuggestedStructure } from '../lib/categoryTree';
import { familyOf } from '../lib/families';
import type { Category } from '../lib/types';
import { useStore } from '../store';
import { businessCategories, CategorySheet, isDefaultCategory } from './CategorySheet';
import { CatBadge, Icon } from './icons';
import { toast } from './ui';

/** Organiza tus categorías: madres y subcategorías con el nombre, icono y color que quieras. */
export function CategoriesManager() {
  const { data, update } = useStore();
  const [sheet, setSheet] = useState<{ cat?: Category; kind: Category['kind']; parentId?: string } | null>(null);
  const [biz, setBiz] = useState('');
  const used = (id: string) => data.transactions.filter((t) => t.categoryId === id).length;
  const total = (c: Category) => used(c.id) + childrenOf(data.categories, c.id).reduce((s, k) => s + used(k.id), 0);

  const remove = (c: Category) => {
    const kids = childrenOf(data.categories, c.id);
    const n = used(c.id);
    const msg = [`¿Eliminar «${c.name}»?`, n ? `Sus ${n} movimientos pasarán a «Otros».` : '', kids.length ? `Sus ${kids.length} subcategorías pasarán a ser categorías madre.` : ''].filter(Boolean).join(' ');
    if (!confirm(msg)) return;
    update((d) => ({
      ...d,
      categories: d.categories.filter((x) => x.id !== c.id).map((x) => (x.parentId === c.id ? { ...x, parentId: undefined, family: x.family ?? familyOf(c.id).id } : x)),
      transactions: d.transactions.map((t) => (t.categoryId === c.id ? { ...t, categoryId: c.kind === 'income' ? 'other_income' : 'other', categorySource: 'user' as const } : t)),
      budgets: d.budgets.filter((b) => b.categoryId !== c.id),
      rules: d.rules.filter((r) => r.categoryId !== c.id),
      learned: Object.fromEntries(Object.entries(d.learned).filter(([, v]) => v !== c.id)),
    }));
  };

  const addBusiness = () => {
    const name = biz.trim();
    if (!name) return;
    if (data.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) return toast('Ya tienes una categoría con ese nombre.');
    const fresh = businessCategories(name);
    update((d) => ({ ...d, categories: [...d.categories, ...fresh] }));
    setBiz('');
    toast(`«${name}» creada con ${fresh.length - 2} subcategorías`);
  };

  const organize = () => {
    const next = applySuggestedStructure(data);
    if (next === data) return toast('Ya está organizado.');
    if (!confirm('Agrupo las categorías de serie en madres (Comida, Hogar, Transporte…). Puedes cambiarlo todo después. ¿Continuar?')) return;
    update(() => next);
    toast('Categorías organizadas');
  };

  const group = (kind: Category['kind'], title: string) => {
    const roots = rootsOf(data.categories, kind);
    return (
      <>
        <div className="section-title" style={{ marginTop: 18 }}>{title}</div>
        <ul className="cat-tree">
          {roots.map((c) => {
            const kids = childrenOf(data.categories, c.id);
            return (
              <li key={c.id}>
                <div className="cat-row">
                  <CatBadge id={c.id} emoji={c.icon} />
                  <div className="grow"><div className="ellipsis"><b>{c.name}</b></div><div className="tiny muted">{kids.length ? `${kids.length} subcategorías · ` : ''}{total(c)} movimientos</div></div>
                  <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label={`Añadir subcategoría a ${c.name}`} title="Añadir subcategoría" onClick={() => setSheet({ kind, parentId: c.id })}><Icon name="plus" size={16} /></button>
                  <button className="btn ghost sm" onClick={() => setSheet({ cat: c, kind })}>Editar</button>
                  {!isDefaultCategory(c.id) && <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label={`Eliminar ${c.name}`} onClick={() => remove(c)}><Icon name="trash" size={15} /></button>}
                </div>
                {kids.map((k) => (
                  <div key={k.id} className="cat-row sub">
                    <CatBadge id={k.id} emoji={k.icon} size={17} />
                    <div className="grow"><div className="ellipsis">{k.name}</div><div className="tiny muted">{used(k.id)} movimientos</div></div>
                    <button className="btn ghost sm" onClick={() => setSheet({ cat: k, kind })}>Editar</button>
                    {!isDefaultCategory(k.id) && <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label={`Eliminar ${k.name}`} onClick={() => remove(k)}><Icon name="trash" size={15} /></button>}
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
      </>
    );
  };

  return (
    <div className="card glass">
      <p className="small secondary" style={{ marginTop: 0 }}>
        Tú decides cómo agrupar: crea categorías madre (Compras, Ocio…) y subcategorías (Ropa, Higiene, Bar…) con el nombre, icono y color que prefieras. Las subcategorías heredan el icono de su madre.
      </p>
      <div className="grid2">
        <button className="btn primary" onClick={() => setSheet({ kind: 'expense' })}><Icon name="plus" size={18} /> Categoría madre</button>
        <button className="btn tinted" onClick={organize}>Estructura sugerida</button>
      </div>
      <div className="row mt">
        <input value={biz} onChange={(e) => setBiz(e.target.value)} placeholder="Negocio: Legacy World" aria-label="Nombre del negocio" />
        <button className="btn" disabled={!biz.trim()} onClick={addBusiness}>Crear para mi negocio</button>
      </div>
      {group('expense', 'Gastos')}
      {group('income', 'Ingresos')}
      <button className="btn ghost block mt small" onClick={() => setSheet({ kind: 'income' })}><Icon name="plus" size={16} /> Categoría de ingreso</button>
      {sheet && <CategorySheet initial={sheet.cat} defaultKind={sheet.kind} parentId={sheet.parentId} onClose={() => setSheet(null)} />}
    </div>
  );
}
