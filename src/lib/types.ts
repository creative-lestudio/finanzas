// Modelo de datos de la app. Los importes se guardan en céntimos (enteros)
// para evitar errores de coma flotante. Gasto = negativo, ingreso = positivo.

export type AccountKind = 'checking' | 'savings' | 'card' | 'cash' | 'investment' | 'crypto' | 'loan';

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  /** Saldo actual en céntimos. Para deudas (loan/card) es negativo. */
  balance: number;
  currency: string;
  /** 'manual' o el id del proveedor de banca abierta que la sincroniza. */
  source: 'manual' | 'import' | string;
  /** Identificador externo (IBAN enmascarado, id del proveedor...). */
  externalId?: string;
  lastSync?: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  kind: 'expense' | 'income' | 'transfer';
}

export interface Transaction {
  id: string;
  accountId: string;
  /** Fecha ISO (YYYY-MM-DD). */
  date: string;
  amount: number;
  description: string;
  categoryId: string;
  /** Cómo se asignó la categoría. 'user' nunca se sobrescribe automáticamente. */
  categorySource: 'user' | 'rule' | 'learned' | 'ai' | 'default';
  /** Canal de pago detectado (bizum, tarjeta, transferencia...). */
  channel?: 'bizum' | 'card' | 'transfer' | 'direct_debit' | 'cash' | 'atm' | 'other';
  note?: string;
  /** Hash para evitar duplicados al importar/sincronizar. */
  fingerprint?: string;
  /**
   * Valor nominal en otra moneda. Ej.: cobras 800 USD pero te ingresan
   * bolívares a tasa BCV → amount en VES y fx = { amount: 80000, currency: 'USD', rate: 40.5, source: 'BCV' }.
   */
  fx?: { amount: number; currency: string; rate: number; source?: string };
  /** Movimiento generado por un cambio de divisa. */
  exchangeId?: string;
}

/** Cotización: 1 unidad de `base` = `rate` unidades de `quote`. */
export interface RateQuote {
  id: string;
  date: string;
  base: string;
  quote: string;
  rate: number;
  /** BCV, Euro, Paralelo o Personalizada (ver RATE_TYPES). */
  source: string;
}

/** Operación de cambio de divisa (Wise, mercado paralelo, Binance P2P...). */
export interface Exchange {
  id: string;
  date: string;
  fromAccountId: string;
  /** Total que sale, comisión incluida (céntimos de la moneda de origen). */
  fromAmount: number;
  toAccountId: string;
  /** Lo que llega realmente (céntimos de la moneda de destino). */
  toAmount: number;
  /** Comisión explícita, en moneda de origen (parte de fromAmount). */
  fee: number;
  platform: string;
  /** Tasa de referencia (1 origen = X destino) para medir lo que se pierde. */
  referenceRate?: number;
  referenceSource?: string;
  note?: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  /** Tope mensual en céntimos (positivo). */
  limit: number;
  /** Porcentaje a partir del cual se avisa (0-1). */
  warnAt: number;
  /** Si sobra presupuesto, ¿pasa al mes siguiente? */
  rollover: boolean;
}

export type GoalKind = 'savings' | 'investment' | 'debt' | 'purchase';

export interface Goal {
  id: string;
  name: string;
  icon: string;
  target: number;
  saved: number;
  deadline?: string;
  /** Prioridad para el reparto del ahorro automático (1 = máxima). */
  priority: number;
  kind?: GoalKind;
  /** Moneda del objetivo (por defecto, la moneda principal). */
  currency?: string;
  /** Si se indica, el progreso se mide con el saldo de estas cuentas (inversión, deuda...). */
  accountIds?: string[];
  /** Aportación mensual planificada (céntimos). */
  monthlyPlan?: number;
  /** Rentabilidad anual esperada en % (para inversión). */
  expectedReturn?: number;
  startDate?: string;
  /** Valor inicial al crear la meta (para medir el avance real). */
  startAmount?: number;
}

export interface GoalMovement {
  id: string;
  goalId: string;
  date: string;
  amount: number;
  reason: 'manual' | 'roundup' | 'percent_income' | 'smart' | 'withdraw';
}

export interface SavingsRules {
  enabled: boolean;
  roundUp: boolean;
  /** Múltiplo del redondeo en céntimos (100 = al euro). */
  roundUpTo: number;
  percentOfIncome: number;
  smartSave: boolean;
}

export interface Group {
  id: string;
  name: string;
  members: string[];
}

export interface SharedExpense {
  id: string;
  groupId: string;
  date: string;
  description: string;
  amount: number;
  paidBy: string;
  /** Parte de cada miembro en céntimos; la suma debe ser igual a amount. */
  shares: Record<string, number>;
  /** Si es una liquidación (pago de deuda) en vez de un gasto. */
  settlement?: boolean;
}

export interface CategoryRule {
  id: string;
  /** Texto (sin acentos, minúsculas) que debe contener la descripción. */
  pattern: string;
  categoryId: string;
}

export interface Settings {
  /** Modo privado: ninguna función envía datos a terceros. */
  offlineOnly: boolean;
  aiCategorization: boolean;
  /** 'server' = IA del servicio (requiere cuenta); 'own' = clave propia del usuario. */
  aiMode?: 'server' | 'own';
  anthropicApiKey?: string;
  /** Moneda principal en la que se ven los informes. */
  currency: string;
  /** Fuente de tasa preferida por moneda (p. ej. { VES: 'Paralelo' }). */
  rateSource?: Record<string, string>;
  theme?: { accent: string; mode: 'auto' | 'light' | 'dark' };
  monthlyIncomeHint?: number;
  bank?: {
    provider: 'none' | 'enablebanking' | 'gocardless' | 'mock';
    /** URL de la función serverless que guarda los secretos del proveedor. */
    proxyUrl?: string;
  };
}

export interface AppData {
  version: 2;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  goalMovements: GoalMovement[];
  savingsRules: SavingsRules;
  groups: Group[];
  sharedExpenses: SharedExpense[];
  rules: CategoryRule[];
  /** Comercio normalizado → categoría, aprendido de las correcciones del usuario. */
  learned: Record<string, string>;
  dismissedAlerts: string[];
  rates: RateQuote[];
  exchanges: Exchange[];
  settings: Settings;
  /** Última modificación (ISO), usada para resolver conflictos de sincronización. */
  updatedAt?: string;
}
