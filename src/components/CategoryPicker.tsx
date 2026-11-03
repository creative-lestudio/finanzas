import { useMemo, useState } from 'react';
import { childrenOf, rootOf, rootsOf } from '../lib/categories';
import { categoryColor } from '../lib/families';
import type { Category } from '../lib/types';
import { useStore } from '../store';
import { CategorySheet } from './CategorySheet';
import { CatIcon, Icon } from './icons';

/**
 * Elegir categoría en dos niveles: primero la madre y, si tiene, la subcategoría.
 * Se puede crear una categoría o subcategoría nueva sin salir de aquí.
 */
export function CategoryPicker({ kind, value, onChange }: { kind: Category['kind']; value: string | null; onChange: (id: string) => void }) {
  const { data } = useStore();
  const [openRoot, setOpenRoot] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [sheet, setSheet] = useState<{ parentId?: string } | null>(null);

  const roots = useMemo(() => {
    const freq: Record<string, number> = {};
    for (const t of data.transactions.slice(-300)) {
      const r = rootOf(t.categoryId);
      freq[r] = (freq[r] ?? 0) + 1;
    }
    return [...rootsOf(data.categories, kind)].sort((a, b) => (freq[b.id] ?? 0) - (freq[a.id] ?? 0));
  }, [data.categories, data.transactions, kind]);

  const current = value ? rootOf(value) : null;
  const open = openRoot ?? current;
  const subs = open ? childrenOf(data.categories, open) : [];
  const shown = all ? roots : [...roots.slice(0, 11), ...(current && !roots.slice(0, 11).some((r) => r.id === current) ? roots.filter((r) => r.id === current) : [])];

  return (
    <>
      <div className="catgrid mb">
        {shown.map((c) => (
          <button key={c.id} type="button" style={{ ['--c' as string]: categoryColor(c.id) }} className={current === c.id ? 'on' : ''} onClick={() => { setOpenRoot(c.id); onChange(c.id); }}>
            <CatIcon id={c.id} emoji={c.icon} size={22} />
            <span className="ellipsis" style={{ maxWidth: '100%' }}>{c.name}</span>
          </button>
        ))}
        {!all && roots.length > 11 && <button type="button" onClick={() => setAll(true)}><Icon name="grid" size={22} /><span>Ver todas</span></button>}
        <button type="button" onClick={() => setSheet({})}><Icon name="plus" size={22} /><span>Nueva</span></button>
      </div>
      {open && current === open && (
        <div className="subchips" role="group" aria-label="Subcategoría">
          {subs.length > 0 && <button type="button" className={`chip-pick ${value === open ? 'on' : ''}`} onClick={() => onChange(open)}>General</button>}
          {subs.map((s) => (
            <button key={s.id} type="button" className={`chip-pick ${value === s.id ? 'on' : ''}`} onClick={() => onChange(s.id)} style={{ ['--c' as string]: categoryColor(s.id) }}>{s.name}</button>
          ))}
          <button type="button" className="chip-pick" onClick={() => setSheet({ parentId: open })}><Icon name="plus" size={14} /> Subcategoría</button>
        </div>
      )}
      {sheet && <CategorySheet defaultKind={kind} parentId={sheet.parentId} onClose={() => setSheet(null)} onSaved={(c) => { setOpenRoot(c.parentId ?? c.id); setAll(true); onChange(c.id); }} />}
    </>
  );
}
