import { categoryColor } from '../lib/families';

// Iconos de trazo fino al estilo SF Symbols (dibujados a mano, sin dependencias).

const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  plus: 'M12 5v14M5 12h14',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3',
  lock: 'M6 10h12v11H6zM8.5 10V7a3.5 3.5 0 0 1 7 0v3',
  chevron: 'm9 5 7 7-7 7',
  back: 'm15 5-7 7 7 7',
  close: 'M6 6l12 12M18 6 6 18',
  send: 'M12 19V5M5.5 11.5 12 5l6.5 6.5',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  heart: 'M12 20s-7.5-4.6-9.2-9.4C1.6 7.2 3.8 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.4 0 5.6 3.2 4.4 6.6C19.5 15.4 12 20 12 20Z',
  repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4z',
  cloud: 'M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2ZM16 14.5h.01',
  calc: 'M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  check: 'm5 12 5 5 9-10',
  alert: 'M12 4 2.5 20h19zM12 10v4M12 17h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.01',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  pie: 'M21 12A9 9 0 1 1 12 3v9zM15 3.5A9 9 0 0 1 20.5 9H15z',
  // Categorías
  cart: 'M3 4h2l2.2 10.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2M9.5 20h.01M17.5 20h.01',
  fork: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 0-3 2-3 5v5h3',
  cup: 'M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3',
  bus: 'M6 4h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM4 11h16M8 20l1.5-3M16 20l-1.5-3M8 14h.01M16 14h.01',
  fuel: 'M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h12M8 8h4M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  wifi: 'M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 19.5h.01',
  pulse: 'M3 12h4l2-5 4 10 2-5h6',
  dumbbell: 'M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12',
  bag: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2',
  ticket: 'M4 7a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2v-2a3 3 0 0 0 0-6zM12 7v2M12 11v2M12 15v2',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21a2 2 0 0 1 2-2h13',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  bank: 'M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18M12 3l9 5H3z',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  banknote: 'M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 9h.01M18 15h.01',
  phoneOut: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM11 18h2M9 9l3-3 3 3M12 6v7',
  phoneIn: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM11 18h2M9 10l3 3 3-3M12 13V6',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  briefcase: 'M3 8h18v12H3zM8 8V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3M3 13h18',
  coins: 'M9 13a6 3 0 1 0 0-6 6 3 0 0 0 0 6ZM3 10v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4M15 7.2c3.4.3 6 1.6 6 2.8v4c0 1.7-2.7 3-6 3',
  laptop: 'M5 5h14v10H5zM2 19h20',
  plane: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  // Metas
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  car: 'M5 17h14v-5l-2-5H7l-2 5zM5 12h14M7.5 17v2M16.5 17v2M7.5 14.5h.01M16.5 14.5h.01',
  cap: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
  gem: 'M6 3h12l3 6-9 12L3 9zM3 9h18M9 3l3 18M15 3l-3 18',
  gift: 'M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8S10 3 7.5 4.5 9 8 12 8ZM12 8s2-5 4.5-3.5S15 8 12 8Z',
  card: 'M3 5h18v14H3zM3 10h18M7 15h4',
  piggy: 'M5 11a7 6 0 0 1 12-2h2l1 3-2 1v3h-2l-1 3h-2v-2H9v2H7l-1-3a6 6 0 0 1-1-5ZM15.5 10h.01',
};

export function Icon({ name, size = 22, stroke = 1.8, className }: { name: keyof typeof PATHS | string; size?: number; stroke?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

const CATEGORY_ICON: Record<string, string> = {
  groceries: 'cart', restaurants: 'fork', coffee: 'cup', transport: 'bus', fuel: 'fuel', home: 'home', utilities: 'bolt',
  telecom: 'wifi', subscriptions: 'repeat', health: 'pulse', sport: 'dumbbell', shopping: 'bag', leisure: 'ticket',
  travel: 'globe', education: 'book', insurance: 'shield', fees: 'bank', taxes: 'receipt', cash: 'banknote',
  bizum_out: 'phoneOut', bizum_in: 'phoneIn', other: 'box', salary: 'briefcase', other_income: 'coins',
  transfer: 'swap', exchange: 'swap', freelance: 'laptop', remittance: 'plane',
};

/** Icono de categoría dentro de su pastilla de color (el color identifica el grupo). */
export function CatBadge({ id, emoji, size = 20 }: { id: string; emoji?: string; size?: number }) {
  return (
    <span className="icon cat" style={{ ['--c' as string]: categoryColor(id) }}>
      <CatIcon id={id} emoji={emoji} size={size} />
    </span>
  );
}

/** Icono de una categoría: trazo propio para las de serie, el emoji para las personalizadas. */
export function CatIcon({ id, emoji, size = 20 }: { id: string; emoji?: string; size?: number }) {
  const name = CATEGORY_ICON[id];
  return name ? <Icon name={name} size={size} stroke={1.7} /> : <span style={{ fontSize: size * 0.9, lineHeight: 1 }}>{emoji ?? '•'}</span>;
}

export const GOAL_ICONS = ['shield', 'sun', 'receipt', 'home', 'car', 'cap', 'gem', 'gift', 'trend', 'card', 'plane', 'piggy'];

const EMOJI_TO_ICON: Record<string, string> = {
  '🛟': 'shield', '🏖️': 'sun', '🧾': 'receipt', '🏠': 'home', '🚗': 'car', '🎓': 'cap', '💍': 'gem', '🎁': 'gift',
  '📈': 'trend', '💳': 'card', '✈️': 'plane', '🐷': 'piggy', '🛍️': 'bag',
};

/** Icono de una meta (acepta el nombre del icono o los emojis de versiones anteriores). */
export function GoalIcon({ icon, size = 20 }: { icon: string; size?: number }) {
  const name = PATHS[icon] ? icon : EMOJI_TO_ICON[icon];
  return name ? <Icon name={name} size={size} stroke={1.7} /> : <span style={{ fontSize: size * 0.9 }}>{icon}</span>;
}
