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

export interface Goal {
  id: string;
  name: string;
  icon: string;
  target: number;
  saved: number;
  deadline?: string;
  /** Prioridad para el reparto del ahorro automático (1 = máxima). */
  priority: number;
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
  anthropicApiKey?: string;
  currency: string;
  monthlyIncomeHint?: number;
  bank?: {
    provider: 'none' | 'enablebanking' | 'gocardless' | 'mock';
    /** URL de la función serverless que guarda los secretos del proveedor. */
    proxyUrl?: string;
  };
}

export interface AppData {
  version: 1;
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
  settings: Settings;
}
