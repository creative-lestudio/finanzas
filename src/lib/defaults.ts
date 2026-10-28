import type { AppData, Category } from './types';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'groceries', name: 'Supermercado', icon: '🛒', kind: 'expense' },
  { id: 'restaurants', name: 'Restaurantes', icon: '🍽️', kind: 'expense' },
  { id: 'coffee', name: 'Cafés y snacks', icon: '☕', kind: 'expense' },
  { id: 'transport', name: 'Transporte', icon: '🚇', kind: 'expense' },
  { id: 'fuel', name: 'Combustible', icon: '⛽', kind: 'expense' },
  { id: 'home', name: 'Hogar', icon: '🏠', kind: 'expense' },
  { id: 'utilities', name: 'Suministros', icon: '💡', kind: 'expense' },
  { id: 'telecom', name: 'Móvil e internet', icon: '📶', kind: 'expense' },
  { id: 'subscriptions', name: 'Suscripciones', icon: '🔁', kind: 'expense' },
  { id: 'health', name: 'Salud', icon: '💊', kind: 'expense' },
  { id: 'sport', name: 'Deporte', icon: '🏋️', kind: 'expense' },
  { id: 'shopping', name: 'Compras', icon: '🛍️', kind: 'expense' },
  { id: 'leisure', name: 'Ocio', icon: '🎬', kind: 'expense' },
  { id: 'travel', name: 'Viajes', icon: '✈️', kind: 'expense' },
  { id: 'education', name: 'Educación', icon: '📚', kind: 'expense' },
  { id: 'insurance', name: 'Seguros', icon: '🛡️', kind: 'expense' },
  { id: 'fees', name: 'Comisiones', icon: '🏦', kind: 'expense' },
  { id: 'taxes', name: 'Impuestos', icon: '🧾', kind: 'expense' },
  { id: 'cash', name: 'Efectivo', icon: '💶', kind: 'expense' },
  { id: 'bizum_out', name: 'Bizum enviado', icon: '📲', kind: 'expense' },
  { id: 'other', name: 'Otros gastos', icon: '📦', kind: 'expense' },
  { id: 'salary', name: 'Nómina', icon: '💼', kind: 'income' },
  { id: 'bizum_in', name: 'Bizum recibido', icon: '📲', kind: 'income' },
  { id: 'other_income', name: 'Otros ingresos', icon: '💰', kind: 'income' },
  { id: 'transfer', name: 'Traspaso entre cuentas', icon: '🔄', kind: 'transfer' },
  { id: 'exchange', name: 'Cambio de divisa', icon: '💱', kind: 'transfer' },
  { id: 'freelance', name: 'Trabajo freelance', icon: '🧑‍💻', kind: 'income' },
  { id: 'remittance', name: 'Remesas', icon: '📨', kind: 'income' },
];

/** Palabras clave → categoría. Se comparan sobre el texto normalizado. */
export const KEYWORD_RULES: [string, string][] = [
  // Supermercados
  ['mercadona', 'groceries'], ['carrefour', 'groceries'], ['lidl', 'groceries'], ['aldi', 'groceries'],
  ['dia ', 'groceries'], ['eroski', 'groceries'], ['alcampo', 'groceries'], ['consum', 'groceries'],
  ['hipercor', 'groceries'], ['supermercado', 'groceries'], ['ahorramas', 'groceries'], ['bonpreu', 'groceries'],
  // Restauración
  ['restaurante', 'restaurants'], ['bar', 'restaurants'], ['cerveceria', 'restaurants'], ['taberna', 'restaurants'], ['pizzeria', 'restaurants'], ['sushi', 'restaurants'], ['kebab', 'restaurants'], ['glovo', 'restaurants'], ['just eat', 'restaurants'], ['uber eats', 'restaurants'],
  ['telepizza', 'restaurants'], ['burger king', 'restaurants'], ['mcdonald', 'restaurants'], ['100 montaditos', 'restaurants'],
  ['starbucks', 'coffee'], ['cafeteria', 'coffee'], ['cafe ', 'coffee'], ['panaderia', 'coffee'], ['vending', 'coffee'],
  ['tabacos', 'coffee'], ['estanco', 'coffee'],
  // Transporte
  ['renfe', 'transport'], ['metro', 'transport'], ['emt', 'transport'], ['cabify', 'transport'], ['uber', 'transport'],
  ['bolt', 'transport'], ['blablacar', 'transport'], ['parking', 'transport'], ['autopista', 'transport'], ['peaje', 'transport'],
  ['repsol', 'fuel'], ['cepsa', 'fuel'], ['galp', 'fuel'], ['bp ', 'fuel'], ['shell', 'fuel'], ['gasolinera', 'fuel'],
  // Hogar y suministros
  ['alquiler', 'home'], ['ikea', 'home'], ['leroy merlin', 'home'], ['comunidad de propietarios', 'home'],
  ['iberdrola', 'utilities'], ['endesa', 'utilities'], ['naturgy', 'utilities'], ['holaluz', 'utilities'],
  ['canal de isabel', 'utilities'], ['aguas', 'utilities'], ['totalenergies', 'utilities'],
  ['movistar', 'telecom'], ['vodafone', 'telecom'], ['orange', 'telecom'], ['digi', 'telecom'], ['yoigo', 'telecom'],
  ['masmovil', 'telecom'], ['pepephone', 'telecom'], ['lowi', 'telecom'], ['o2 ', 'telecom'],
  // Suscripciones
  ['netflix', 'subscriptions'], ['spotify', 'subscriptions'], ['hbo', 'subscriptions'], ['max.com', 'subscriptions'],
  ['disney', 'subscriptions'], ['prime video', 'subscriptions'], ['amazon prime', 'subscriptions'], ['apple.com', 'subscriptions'],
  ['icloud', 'subscriptions'], ['google one', 'subscriptions'], ['youtube', 'subscriptions'], ['dazn', 'subscriptions'],
  ['filmin', 'subscriptions'], ['chatgpt', 'subscriptions'], ['openai', 'subscriptions'], ['anthropic', 'subscriptions'],
  ['claude.ai', 'subscriptions'], ['adobe', 'subscriptions'], ['microsoft', 'subscriptions'], ['audible', 'subscriptions'],
  // Salud y deporte
  ['farmacia', 'health'], ['sanitas', 'health'], ['adeslas', 'health'], ['dentista', 'health'], ['clinica', 'health'],
  ['gimnasio', 'sport'], ['basic fit', 'sport'], ['basic-fit', 'sport'], ['mcfit', 'sport'], ['anytime fitness', 'sport'],
  ['decathlon', 'sport'], ['holmes place', 'sport'], ['altafit', 'sport'],
  // Compras y ocio
  ['amazon', 'shopping'], ['aliexpress', 'shopping'], ['zara', 'shopping'], ['el corte ingles', 'shopping'],
  ['primark', 'shopping'], ['shein', 'shopping'], ['mediamarkt', 'shopping'], ['fnac', 'shopping'], ['pccomponentes', 'shopping'],
  ['cine', 'leisure'], ['yelmo', 'leisure'], ['cinesa', 'leisure'], ['ticketmaster', 'leisure'], ['steam', 'leisure'],
  ['playstation', 'leisure'], ['nintendo', 'leisure'],
  ['ryanair', 'travel'], ['vueling', 'travel'], ['iberia', 'travel'], ['booking', 'travel'], ['airbnb', 'travel'],
  ['hotel', 'travel'], ['easyjet', 'travel'],
  // Finanzas
  ['seguro', 'insurance'], ['mapfre', 'insurance'], ['mutua', 'insurance'], ['linea directa', 'insurance'], ['axa', 'insurance'],
  ['comision', 'fees'], ['comisiones', 'fees'], ['cuota mantenimiento', 'fees'], ['mantenimiento cuenta', 'fees'],
  ['cuota tarjeta', 'fees'], ['intereses deudores', 'fees'], ['descubierto', 'fees'], ['fee', 'fees'],
  ['agencia tributaria', 'taxes'], ['aeat', 'taxes'], ['ibi', 'taxes'], ['ayuntamiento', 'taxes'], ['dgt', 'taxes'],
  ['cajero', 'cash'], ['retirada efectivo', 'cash'], ['reintegro', 'cash'],
  ['nomina', 'salary'], ['salario', 'salary'], ['payroll', 'salary'],
  ['traspaso', 'transfer'],
];

export function emptyData(): AppData {
  return {
    version: 2,
    accounts: [
      { id: 'cash', name: 'Efectivo', kind: 'cash', balance: 0, currency: 'EUR', source: 'manual' },
    ],
    categories: DEFAULT_CATEGORIES,
    transactions: [],
    budgets: [],
    goals: [],
    goalMovements: [],
    savingsRules: { enabled: false, roundUp: true, roundUpTo: 100, percentOfIncome: 5, smartSave: true },
    groups: [],
    sharedExpenses: [],
    rules: [],
    learned: {},
    dismissedAlerts: [],
    rates: [],
    exchanges: [],
    settings: {
      offlineOnly: true,
      aiCategorization: false,
      currency: 'EUR',
      bank: { provider: 'none' },
      theme: { accent: '#032a67', mode: 'auto' },
    },
  };
}

/** Actualiza datos guardados con versiones anteriores. */
export function migrate(data: AppData | (Omit<AppData, 'version'> & { version: number })): AppData {
  const d = data as AppData;
  return {
    ...emptyData(),
    ...d,
    version: 2,
    categories: [...d.categories, ...DEFAULT_CATEGORIES.filter((c) => !d.categories.some((x) => x.id === c.id))],
    // Desde la v2.1 solo hay cuatro tipos de tasa; las demás fuentes pasan a "Personalizada".
    rates: (d.rates ?? []).map((r) => (['BCV', 'Euro', 'Paralelo', 'Personalizada'].includes(r.source) ? r : { ...r, source: 'Personalizada' })),
    exchanges: d.exchanges ?? [],
    settings: {
      ...emptyData().settings,
      ...d.settings,
      theme: d.settings?.theme ?? emptyData().settings.theme,
      rateSource: Object.fromEntries(Object.entries(d.settings?.rateSource ?? {}).filter(([, v]) => ['BCV', 'Euro', 'Paralelo', 'Personalizada'].includes(v))),
    },
  };
}
