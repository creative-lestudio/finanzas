import { addMonths } from './money';
import { budgetStatus } from './budgets';
import { detectAntExpenses, detectFees, detectSubscriptions, isActive, monthSummary } from './insights';
import type { Account, AppData } from './types';

export interface NetWorth {
  assets: number;
  liabilities: number;
  net: number;
  byKind: Record<Account['kind'], number>;
  /** Liquidez inmediata: cuentas, ahorro y efectivo. */
  liquid: number;
  goals: number;
}

export function netWorth(data: AppData): NetWorth {
  const byKind = { checking: 0, savings: 0, card: 0, cash: 0, investment: 0, crypto: 0, loan: 0 } as NetWorth['byKind'];
  let assets = 0;
  let liabilities = 0;
  for (const a of data.accounts) {
    byKind[a.kind] += a.balance;
    if (a.balance >= 0) assets += a.balance;
    else liabilities -= a.balance;
  }
  const liquid = byKind.checking + byKind.savings + byKind.cash;
  const goals = data.goals.reduce((s, g) => s + g.saved, 0);
  return { assets, liabilities, net: assets - liabilities, byKind, liquid, goals };
}

export interface HealthFactor {
  id: string;
  label: string;
  /** Puntuación del factor 0-100. */
  score: number;
  weight: number;
  value: string;
  tip?: string;
}

export interface HealthReport {
  score: number;
  grade: 'Excelente' | 'Buena' | 'Mejorable' | 'Frágil';
  factors: HealthFactor[];
  tips: string[];
  monthsOfData: number;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const pct = (n: number) => `${Math.round(n * 100)} %`;

/**
 * Diagnóstico de salud financiera basado en reglas habituales de finanzas
 * personales: tasa de ahorro, colchón de emergencia, endeudamiento,
 * cumplimiento de presupuestos, peso de suscripciones y fugas.
 */
export function healthReport(data: AppData, month: string, day: number): HealthReport {
  const hist = [1, 2, 3].map((i) => monthSummary(data, addMonths(month, -i))).filter((m) => m.income || m.expenses);
  const monthsOfData = hist.length;
  const ref = hist.length ? hist : [monthSummary(data, month)];
  const income = ref.reduce((s, m) => s + m.income, 0) / ref.length;
  const expenses = ref.reduce((s, m) => s + m.expenses, 0) / ref.length;
  const nw = netWorth(data);
  const factors: HealthFactor[] = [];

  // 1. Tasa de ahorro (objetivo ≥ 20 %).
  const savingsRate = income > 0 ? (income - expenses) / income : 0;
  factors.push({
    id: 'savings',
    label: 'Tasa de ahorro',
    score: clamp((savingsRate / 0.2) * 100),
    weight: 30,
    value: income > 0 ? pct(savingsRate) : 'sin ingresos',
    tip:
      savingsRate < 0.2
        ? savingsRate < 0
          ? 'Gastas más de lo que ingresas. Empieza por fijar topes en tus 3 categorías con más gasto.'
          : `Ahorras el ${pct(savingsRate)} de tus ingresos. Intenta llegar al 20 % (regla 50/30/20) activando el ahorro automático.`
        : undefined,
  });

  // 2. Fondo de emergencia (objetivo 6 meses de gastos, mínimo 3).
  const emergencyGoal = data.goals.find((g) => /emergencia|colchon|imprevistos/i.test(g.name.normalize('NFD').replace(/[̀-ͯ]/g, '')));
  const cushion = nw.liquid + (emergencyGoal?.saved ?? 0);
  const months = expenses > 0 ? cushion / expenses : cushion > 0 ? 6 : 0;
  factors.push({
    id: 'emergency',
    label: 'Fondo de emergencia',
    score: clamp((months / 6) * 100),
    weight: 25,
    value: `${months.toFixed(1)} meses`,
    tip: months < 3 ? 'Tu colchón cubre menos de 3 meses de gastos. Crea una hucha "Fondo de emergencia" y dale prioridad 1.' : months < 6 ? 'Vas bien: completa tu fondo hasta 6 meses de gastos.' : undefined,
  });

  // 3. Endeudamiento (deuda / ingresos anuales; ideal < 35 %).
  const yearlyIncome = income * 12;
  const debtRatio = yearlyIncome > 0 ? nw.liabilities / yearlyIncome : nw.liabilities > 0 ? 1 : 0;
  factors.push({
    id: 'debt',
    label: 'Endeudamiento',
    score: clamp(100 - (debtRatio / 0.35) * 50),
    weight: 20,
    value: pct(debtRatio) + ' de ingresos anuales',
    tip: debtRatio > 0.35 ? 'Tu deuda es alta respecto a tus ingresos. Prioriza amortizar la de mayor interés (método avalancha).' : undefined,
  });

  // 4. Presupuestos.
  const budgets = budgetStatus(data, month, day);
  const overCount = budgets.filter((b) => b.state === 'over').length;
  factors.push({
    id: 'budgets',
    label: 'Cumplimiento de presupuestos',
    score: budgets.length ? clamp(100 - (overCount / budgets.length) * 100) : 50,
    weight: 10,
    value: budgets.length ? `${budgets.length - overCount}/${budgets.length} en orden` : 'sin presupuestos',
    tip: !budgets.length ? 'Crea presupuestos por categoría: la app te propone topes a partir de tu gasto real.' : overCount ? `Te has pasado en ${overCount} presupuesto(s) este mes.` : undefined,
  });

  // 5. Suscripciones (ideal < 5 % de ingresos).
  const asOf = `${month}-${String(day).padStart(2, '0')}`;
  const subs = detectSubscriptions(data.transactions).filter((s) => s.kind === 'subscription' && isActive(s, asOf));
  const subsMonthly = subs.reduce((s, x) => s + x.yearly, 0) / 12;
  const subsRatio = income > 0 ? subsMonthly / income : 0;
  factors.push({
    id: 'subscriptions',
    label: 'Peso de las suscripciones',
    score: clamp(100 - Math.max(0, subsRatio - 0.05) * 1000),
    weight: 8,
    value: `${pct(subsRatio)} de ingresos`,
    tip: subsRatio > 0.05 ? `Tus ${subs.length} suscripciones suman más del 5 % de tus ingresos. Revisa cuáles no usas.` : undefined,
  });

  // 6. Fugas: gastos hormiga y comisiones.
  const ants = detectAntExpenses(data.transactions, asOf);
  const fees = detectFees(data.transactions).filter((f) => f.date >= addMonths(month, -3));
  const leakRatio = income > 0 ? (ants.total + fees.reduce((s, f) => s + f.amount, 0) / 3) / income : 0;
  factors.push({
    id: 'leaks',
    label: 'Fugas de dinero',
    score: clamp(100 - leakRatio * 1000),
    weight: 7,
    value: `${pct(leakRatio)} de ingresos`,
    tip: fees.length ? 'Pagas comisiones bancarias evitables. Mira la sección de comisiones.' : leakRatio > 0.05 ? 'Los gastos pequeños y repetidos se comen una parte importante de tu sueldo.' : undefined,
  });

  const totalW = factors.reduce((s, f) => s + f.weight, 0);
  const score = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0) / totalW);
  const grade = score >= 80 ? 'Excelente' : score >= 60 ? 'Buena' : score >= 40 ? 'Mejorable' : 'Frágil';
  const tips = [...factors].sort((a, b) => a.score * a.weight - b.score * b.weight).flatMap((f) => (f.tip ? [f.tip] : []));
  return { score, grade, factors, tips, monthsOfData };
}
