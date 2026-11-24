import { formatMoney, today } from './money';
import { detectAntExpenses, detectSubscriptions, isActive, monthSummary } from './insights';
import { emergencyMonths } from './mentor';
import { netWorth } from './health';
import { t as tr } from './i18n';
import { regionOf, type Region } from './region';
import type { AppData, Profile } from './types';

// Micro-lecciones de 3 minutos: unas tarjetas cortas, una pregunta y «tu caso» con tus propios números.
// Contenido educativo general; no es asesoramiento financiero personalizado.
export interface Lesson {
  id: string;
  title: string;
  /** Icono de línea. */
  icon: string;
  minutes: number;
  /** Nivel mínimo recomendado. */
  level: Profile['level'];
  /** Objetivos con los que más encaja. */
  goals: Profile['goal'][];
  /** Si se indica, solo se ofrece en estas regiones. */
  regions?: Region[];
  cards: string[];
  quiz: { q: string; options: string[]; answer: number; why: string };
  /** Pantalla a la que lleva el botón final. */
  go?: 'plan' | 'accounts' | 'transactions' | 'fx' | 'debts' | 'subs' | 'assistant';
  goLabel?: string;
}

export const LESSONS: Lesson[] = [
  {
    id: 'presupuesto', title: 'Un presupuesto es un plan, no una cárcel', icon: 'pie', minutes: 3, level: 'none', goals: ['control', 'save'],
    cards: [
      'Un presupuesto responde a una pregunta: «¿en qué quiero que se vaya mi dinero?», antes de que se vaya solo.',
      'Una guía sencilla es la regla 50/30/20: 50 % para necesidades (casa, comida, transporte), 30 % para deseos y 20 % para ahorrar o pagar deudas.',
      'No tiene que salirte exacta. Si tus necesidades pesan 70 %, el primer paso es registrar y ver adónde puedes recortar, no rendirte.',
      'Lo que no se mide no se mejora: anota tus gastos unas semanas y fija topes por categoría en la sección Planea.',
    ],
    quiz: { q: 'Con unos ingresos de 1.000 al mes, ¿cuánto sería el 20 % de ahorro de la regla 50/30/20?', options: ['100', '200', '300'], answer: 1, why: 'El 20 % de 1.000 es 200. Es una guía: lo importante es que el ahorro salga primero, no lo que sobre.' },
    go: 'plan', goLabel: 'Crear un presupuesto',
  },
  {
    id: 'fondo-emergencia', title: 'Tu colchón: el fondo de emergencia', icon: 'shield', minutes: 3, level: 'none', goals: ['save', 'control', 'debt', 'invest'],
    cards: [
      'Un fondo de emergencia es dinero reservado para imprevistos: perder el empleo, una avería, una urgencia médica. No es para vacaciones.',
      'La referencia habitual es de 3 a 6 meses de gastos esenciales. Si tus ingresos son muy variables o dependes de un solo sueldo, ve hacia 6 o más.',
      'Guárdalo separado de tu cuenta del día a día, fácil de retirar y sin riesgo. Aquí la prioridad no es ganar, es que esté cuando lo necesites.',
      'Empieza pequeño: primero 1 mes de gastos. Un colchón pequeño ya evita pedir prestado a mala tasa.',
    ],
    quiz: { q: 'Gastas 800 al mes en lo esencial. ¿Cuál es el colchón mínimo recomendado?', options: ['800', '2.400', '800.000'], answer: 1, why: '3 meses × 800 = 2.400. Y de ahí, hacia 6 meses (4.800) si tu situación es menos estable.' },
    go: 'plan', goLabel: 'Crear la meta «Colchón»',
  },
  {
    id: 'inflacion', title: 'La inflación: por qué ahorrar quieto no basta', icon: 'trend', minutes: 3, level: 'none', goals: ['grow', 'invest', 'save'],
    cards: [
      'La inflación es la subida general de precios: con el tiempo, la misma cantidad compra menos.',
      'Ejemplo: con una inflación del 5 % anual, 1.000 hoy equivalen a unos 614 de poder de compra dentro de 10 años, aunque sigas teniendo «1.000».',
      'Por eso el dinero que no necesitas a corto plazo no debería quedarse parado para siempre: busca que crezca al menos al ritmo de los precios.',
      'En países con inflación o devaluación alta, importa también en qué moneda guardas tu valor. Más abajo hay una lección sobre eso.',
    ],
    quiz: { q: 'Si la inflación es del 5 % anual y tu dinero rinde 1 %, ¿qué pasa con su poder de compra?', options: ['Sube', 'Se mantiene', 'Baja'], answer: 2, why: 'Rinde menos de lo que suben los precios: nominalmente tienes más, pero compras menos.' },
  },
  {
    id: 'interes-compuesto', title: 'Interés compuesto: tu dinero trabajando', icon: 'gem', minutes: 3, level: 'basic', goals: ['grow', 'invest', 'save'],
    cards: [
      'El interés compuesto es ganar rendimientos sobre los rendimientos anteriores. Con tiempo, la curva se vuelve empinada.',
      'Ejemplo ilustrativo (no garantizado): 100 al mes durante 20 años a un 7 % anual llegan a unos 52.000, aunque solo hayas aportado 24.000.',
      'La regla del 72 da una idea rápida: divide 72 entre la rentabilidad anual y sabrás en cuántos años se duplica el dinero (72 ÷ 7 ≈ 10 años).',
      'Lo más poderoso no es la rentabilidad: es empezar pronto y aportar con constancia. Y ojo: ningún rendimiento está garantizado; las inversiones suben y bajan.',
    ],
    quiz: { q: 'Según la regla del 72, ¿en cuántos años se duplica un dinero que rinde un 6 % anual?', options: ['6', '12', '72'], answer: 1, why: '72 ÷ 6 = 12 años. Es una aproximación, útil para tener la intuición.' },
    go: 'plan', goLabel: 'Crear una meta de ahorro',
  },
  {
    id: 'deudas', title: 'Deudas: pagar con cabeza', icon: 'card', minutes: 3, level: 'none', goals: ['debt', 'control'],
    cards: [
      'No toda deuda es igual: la que financia algo que gana valor o ahorra dinero puede tener sentido; la que financia consumo con interés alto, casi nunca.',
      'Antes de pedir prestado, calcula el coste total (cuotas × plazo) y comprueba que la cuota cabe sin tocar tu colchón.',
      'Método avalancha: pagas el mínimo en todas y destinas el extra a la de mayor interés. Es el que menos intereses te cuesta.',
      'Método bola de nieve: empiezas por la deuda más pequeña para ganar motivación. Cuesta un poco más, pero funciona si necesitas victorias rápidas.',
    ],
    quiz: { q: 'En el método avalancha, ¿qué deuda se paga primero con el dinero extra?', options: ['La más pequeña', 'La de mayor interés', 'La más antigua'], answer: 1, why: 'Cada euro extra en la deuda más cara evita más intereses. Es matemáticamente el más eficiente.' },
    go: 'debts', goLabel: 'Ver mis deudas',
  },
  {
    id: 'gastos-hormiga', title: 'Gastos hormiga: lo pequeño que se acumula', icon: 'coins', minutes: 2, level: 'none', goals: ['control', 'save'],
    cards: [
      'Los gastos hormiga son compras pequeñas y frecuentes (café, snacks, apps) que no notas una a una pero sí a fin de mes.',
      'Ejemplo: 4 por día × 22 días son 88 al mes, más de 1.000 al año.',
      'No se trata de privarte de todo: elige 2 o 3 que de verdad no te aportan y recórtalos; deja los que disfrutas.',
      'Una buena práctica: fija un tope mensual para «caprichos» y deja que la app te avise antes de pasarte.',
    ],
    quiz: { q: 'Gastas 4 al día en pequeños extras, 22 días al mes. ¿Cuánto es al año?', options: ['Unos 100', 'Unos 1.000', 'Unos 10.000'], answer: 1, why: '4 × 22 × 12 = 1.056 al año. Pequeño por día, relevante por año.' },
    go: 'plan', goLabel: 'Poner un tope a caprichos',
  },
  {
    id: 'pagarte-primero', title: 'Págate primero: automatiza tu ahorro', icon: 'piggy', minutes: 2, level: 'none', goals: ['save', 'grow', 'invest'],
    cards: [
      'Ahorrar «lo que sobre» casi nunca funciona: siempre se encuentra en qué gastarlo. Págate primero: aparta tu ahorro nada más cobrar.',
      'Fija una cantidad o un porcentaje (por ejemplo el 10 %) y que se aparte solo el día de cobro. La fuerza de voluntad se gasta; los automatismos no.',
      'En esta app puedes activar el ahorro automático y los redondeos, y crear gastos fijos que se anotan solos.',
      'Cuando suba tu ingreso, sube el ahorro antes de subir el nivel de vida.',
    ],
    quiz: { q: '¿Cuándo es mejor apartar el dinero del ahorro?', options: ['Al final del mes, con lo que sobre', 'Nada más cobrar', 'Cuando tenga una meta grande'], answer: 1, why: 'Lo que se aparta primero no se gasta por inercia. Es el truco más sencillo y eficaz.' },
    go: 'plan', goLabel: 'Activar el ahorro automático',
  },
  {
    id: 'metas', title: 'Metas que sí se cumplen', icon: 'target', minutes: 3, level: 'basic', goals: ['save', 'grow', 'invest'],
    cards: [
      'Una meta vaga («ahorrar más») no se cumple. Una buena meta tiene cifra, fecha y un plan: «6.000 para un viaje en 12 meses = 500 al mes».',
      'Divide la meta en aportes mensuales y comprueba si caben en tu presupuesto. Si no, ajusta el plazo, no el sueño.',
      'Pon la meta a la vista y revisa el progreso cada mes: lo que se mide, motiva.',
      'Prioriza: colchón de emergencia, luego deudas caras y después metas y metas de inversión.',
    ],
    quiz: { q: 'Quieres ahorrar 6.000 en 12 meses. ¿Cuánto debes apartar al mes?', options: ['400', '500', '600'], answer: 1, why: '6.000 ÷ 12 = 500 al mes. Una meta con cifra y plazo se convierte en un hábito mensual.' },
    go: 'plan', goLabel: 'Crear una meta',
  },
  {
    id: 'diversificar', title: 'Riesgo y diversificación', icon: 'pie', minutes: 4, level: 'starter', goals: ['invest', 'grow'],
    cards: [
      'Riesgo y rentabilidad van de la mano: lo que promete mucho suele poder perder mucho. Invertir sin riesgo de pérdida no existe.',
      'Diversificar es repartir tu dinero entre activos distintos (países, sectores, tipos) para que el fallo de uno no te hunda.',
      'El tiempo es tu aliado: cuanto más lejos esté el objetivo, más riesgo puedes asumir; cuanto más cerca, menos.',
      'Define cuánto riesgo aguantas dormir tranquilo: si una caída del 20 % te hace vender por pánico, tu cartera es demasiado arriesgada para ti.',
    ],
    quiz: { q: '¿Qué significa diversificar?', options: ['Elegir el activo más rentable', 'Repartir el dinero entre activos distintos', 'Invertir solo en lo que conoces de nombre'], answer: 1, why: 'Repartir reduce el impacto de que un solo activo vaya mal. No elimina el riesgo, pero lo modera.' },
  },
  {
    id: 'empezar-a-invertir', title: 'Empezar a invertir sin cometer errores', icon: 'trend', minutes: 4, level: 'starter', goals: ['invest', 'grow'],
    cards: [
      'El orden importa: 1) colchón de emergencia, 2) pagar deudas caras, 3) tener claro el objetivo y el plazo, 4) invertir.',
      'Para empezar suelen valorarse productos sencillos, diversificados y de bajo coste (como fondos indexados), con aportes periódicos para no depender de «acertar el momento».',
      'Nunca inviertas dinero que podrías necesitar pronto ni dinero prestado.',
      'Desconfía de la rentabilidad «garantizada», la prisa y quien te pide claves o transferencias: son las señales típicas de una estafa.',
    ],
    quiz: { q: '¿Cuál de estas es una señal típica de estafa de inversión?', options: ['Aportes periódicos pequeños', 'Rentabilidad alta «garantizada» y prisa para decidir', 'Comisiones bajas y transparentes'], answer: 1, why: 'Ninguna inversión real garantiza altos rendimientos. La urgencia busca que no pienses ni compares.' },
    go: 'assistant', goLabel: 'Preguntar al asesor',
  },
  {
    id: 'proteger-valor', title: 'Proteger tu dinero si hay inflación o varias monedas', icon: 'globe', minutes: 4, level: 'basic', goals: ['grow', 'save', 'control'],
    cards: [
      'Si tus ingresos o ahorros están en una moneda que pierde valor rápido, guardar todo en ella es perder poder de compra mes a mes.',
      'Una estrategia habitual es repartir: lo que gastarás pronto en la moneda en la que gastas, y una parte del ahorro en una moneda o activo más estable.',
      'Al cobrar o pagar en otra moneda, anota el equivalente de ese día: si no, no sabrás cuánto valió realmente.',
      'Compara siempre tasas y comisiones (oficial, mercado, plataformas): una diferencia pequeña en cada cambio se acumula. La app mide cuánto pierdes.',
    ],
    quiz: { q: 'Cobras en una moneda que se devalúa rápido. ¿Qué conviene hacer con lo que no vas a gastar pronto?', options: ['Dejarlo todo ahí', 'Valorar guardarlo en una moneda o activo más estable', 'Gastarlo todo ya'], answer: 1, why: 'Proteger el valor es repartir riesgo: cuanto más rápida la devaluación, más caro es dejarlo quieto.' },
    go: 'fx', goLabel: 'Ver divisas y cambios',
  },
  {
    id: 'suscripciones', title: 'Auditoría de suscripciones', icon: 'repeat', minutes: 2, level: 'none', goals: ['control', 'save'],
    cards: [
      'Las suscripciones se acumulan sin que las notes: música, vídeo, apps, gimnasio, almacenamiento…',
      'Una vez al trimestre, repásalas todas y pregúntate: ¿la usé este mes? ¿Me aporta más que su precio?',
      'Si dudas, cancela: casi siempre puedes volver a contratarla. El ahorro es inmediato y se repite cada mes.',
      'La app detecta tus suscripciones activas y te dice cuánto suman al año.',
    ],
    quiz: { q: 'Una suscripción de 10 al mes que no usas, ¿cuánto te cuesta al año?', options: ['10', '60', '120'], answer: 2, why: '10 × 12 = 120 al año por algo que no usas.' },
    go: 'subs', goLabel: 'Ver mis suscripciones',
  },
  {
    id: 'decisiones-grandes', title: 'Cómo decidir una compra grande', icon: 'bolt', minutes: 3, level: 'basic', goals: ['control', 'save', 'grow'],
    cards: [
      'Antes de una compra grande, espera 24 horas (o 30 días si es muy grande). Si sigues queriéndola, probablemente sea buena decisión.',
      'Mira el coste total, no la cuota: precio + intereses + mantenimiento. Pagar a plazos casi siempre sale más caro.',
      'Pregúntate el coste de oportunidad: ¿qué meta retrasa este gasto? ¿Cuántos meses de colchón te quita?',
      'Compáralo con tu ingreso: si supera una quinta parte de lo que ganas en un mes, merece pensarlo bien.',
    ],
    quiz: { q: '¿Qué conviene mirar antes de financiar una compra a plazos?', options: ['Solo la cuota mensual', 'El coste total con intereses', 'Solo el precio de la tienda'], answer: 1, why: 'La cuota engaña: lo que importa es lo que pagarás en total y si cabe sin tocar tu colchón.' },
  },
  {
    id: 'estafas', title: 'Cómo no caer en estafas financieras', icon: 'shield', minutes: 3, level: 'none', goals: ['invest', 'save', 'grow', 'control'],
    cards: [
      'Las señales clásicas: rentabilidad alta y garantizada, urgencia («solo hoy»), presión para meter a amigos y pedirte claves o códigos.',
      'Ni tu banco ni un asesor serio te pedirán tu contraseña, el código de un SMS o que muevas dinero «a una cuenta segura».',
      'Antes de invertir en algo: ¿está regulado? ¿Puedo retirar cuando quiera? ¿Entiendo de dónde sale la ganancia? Si no sabes explicarlo, no inviertas.',
      'Si dudas, para y consulta. Recuperar dinero estafado casi nunca es posible; prevenir sí.',
    ],
    quiz: { q: 'Alguien te ofrece duplicar tu dinero en un mes «con garantía». ¿Qué haces?', options: ['Invierto poco para probar', 'Desconfío y lo descarto', 'Invito a mis amigos'], answer: 1, why: 'Duplicar en un mes con garantía no existe: es la firma de las estafas piramidales.' },
  },
  {
    id: 'credito-us', title: 'Tarjetas de crédito y tu puntaje de crédito', icon: 'card', minutes: 4, level: 'basic', goals: ['debt', 'control', 'grow'], regions: ['US'],
    cards: [
      'En EE. UU. tu puntaje de crédito (por ejemplo el FICO, de 300 a 850) decide si te aprueban un préstamo, una hipoteca o un alquiler, y a qué tasa.',
      'Pesa sobre todo tu historial de pagos (en torno al 35 %) y cuánto del límite usas (en torno al 30 %). Después, la antigüedad del crédito, la variedad y las consultas nuevas.',
      'Si pagas el total del estado de cuenta cada mes no pagas intereses. Si dejas saldo, la tasa (APR) de las tarjetas suele rondar el 20 % o más: es de las deudas más caras.',
      'Dos hábitos que ayudan: pagar siempre a tiempo (automatiza al menos el pago mínimo) y mantener el uso por debajo del 30 % del límite.',
    ],
    quiz: { q: '¿Qué pesa más en tu puntaje de crédito?', options: ['Cuántas tarjetas tienes', 'Pagar siempre a tiempo', 'Tu sueldo'], answer: 1, why: 'El historial de pagos es el factor más importante. El sueldo ni siquiera forma parte del puntaje.' },
    go: 'debts', goLabel: 'Ver mis deudas',
  },
  {
    id: 'retiro-us', title: '401(k) e IRA: ahorrar para el retiro', icon: 'piggy', minutes: 4, level: 'basic', goals: ['grow', 'invest', 'save'], regions: ['US'],
    cards: [
      'El 401(k) es un plan de retiro que ofrece tu empleador: aportas desde tu sueldo y el dinero crece invertido. La IRA es una cuenta de retiro individual que abres tú.',
      'Muchos empleadores igualan parte de tu aporte (employer match). Es dinero gratis: lo primero es aportar lo suficiente para recibir todo el match.',
      'En la versión tradicional aportas antes de impuestos y pagas al retirar; en la Roth pagas impuestos ahora y los retiros cualificados salen libres de impuestos.',
      'Retirar antes de los 59 años y medio suele tener penalización e impuestos, así que no es tu colchón de emergencia. Los límites y las reglas cambian cada año: consulta las vigentes.',
    ],
    quiz: { q: 'Tu empleador iguala parte de tu aporte al 401(k). ¿Qué conviene?', options: ['Ignorarlo', 'Aportar al menos lo necesario para recibir todo el match', 'Retirarlo cuando suba la bolsa'], answer: 1, why: 'El match es una rentabilidad inmediata que no encontrarás en otro sitio. Es el primer paso del ahorro para el retiro.' },
  },
  {
    id: 'ahorro-es', title: 'Dónde guardar tu dinero en España', icon: 'bank', minutes: 4, level: 'basic', goals: ['save', 'grow', 'invest'], regions: ['ES', 'EU'],
    cards: [
      'Para el dinero que quizá necesites pronto (tu colchón): cuenta remunerada o depósito. Poco riesgo y disponible, aunque con rendimiento modesto.',
      'En España el Fondo de Garantía de Depósitos protege hasta 100.000 € por titular y entidad. Los fondos de inversión y las acciones no están cubiertos por esa garantía.',
      'Para metas a largo plazo se suelen valorar fondos indexados de bajo coste. Un detalle útil: pasar dinero de un fondo a otro mediante traspaso no tributa hasta que reembolsas.',
      'Comisiones: una diferencia del 1 % anual parece poco, pero a 30 años se come una parte enorme de lo que ganas. Compara siempre el coste total.',
    ],
    quiz: { q: '¿Qué cubre el Fondo de Garantía de Depósitos?', options: ['Los fondos de inversión', 'Los depósitos hasta 100.000 € por titular y entidad', 'Las criptomonedas'], answer: 1, why: 'Protege los depósitos bancarios hasta ese límite; no protege inversiones.' },
    go: 'plan', goLabel: 'Crear una meta',
  },
  {
    id: 'hacienda-es', title: 'Hacienda sin sustos: lo básico del IRPF', icon: 'receipt', minutes: 3, level: 'basic', goals: ['control', 'grow'], regions: ['ES'],
    cards: [
      'El IRPF es el impuesto sobre la renta. Si trabajas por cuenta ajena ya te retienen una parte de la nómina, pero la declaración anual ajusta cuentas (la campaña suele ir de abril a junio).',
      'Si vendes fondos o acciones con ganancias, esas ganancias tributan en la declaración. Guarda los extractos y las fechas de compra y venta.',
      'Los autónomos tienen además obligaciones trimestrales: apartar un porcentaje de cada cobro para impuestos evita sustos.',
      'Esto es una introducción general. Para tu caso concreto consulta la web de la Agencia Tributaria o a un asesor fiscal.',
    ],
    quiz: { q: 'Si trabajas por cuenta ajena, ¿qué significa que te retienen en la nómina?', options: ['Que ya no debes declarar', 'Que es un adelanto del impuesto que se ajusta en la declaración', 'Que es un ahorro tuyo'], answer: 1, why: 'La retención es un anticipo del IRPF; la declaración compara lo retenido con lo que realmente te corresponde.' },
  },
  {
    id: 'cobrar-exterior', title: 'Cobrar del exterior sin perder en el cambio', icon: 'globe', minutes: 4, level: 'basic', goals: ['grow', 'save', 'control'], regions: ['VE', 'LATAM', 'OTHER'],
    cards: [
      'Cuando te pagan desde fuera, lo que recibes depende de tres cosas: la comisión del método, la tasa de cambio que te aplican y el tiempo que tarda.',
      'Compara: transferencia bancaria, plataformas como Wise, PayPal o Zelle, y el comercio entre personas. Una tasa peor suele costar más que cualquier comisión visible.',
      'Anota siempre el equivalente de cada cobro: así sabrás cuánto valió realmente y cuánto pierdes con cada método.',
      'Seguridad: usa plataformas con garantía (custodia del pago), no salgas del chat para cerrar acuerdos y desconfía de quien tiene prisa o te pide claves.',
    ],
    quiz: { q: 'Dos métodos de cobro: uno con comisión baja pero mala tasa, otro con comisión mayor y buena tasa. ¿Qué haces?', options: ['Elijo el de menos comisión', 'Calculo cuánto recibiría con cada uno', 'Elijo el más rápido siempre'], answer: 1, why: 'Lo que importa es lo que recibes al final: tasa y comisión juntas. La app te ayuda a medir la pérdida.' },
    go: 'fx', goLabel: 'Ver divisas y cambios',
  },
  {
    id: 'ahorrar-dolares', title: 'Proteger tus ahorros cuando la moneda pierde valor', icon: 'shield', minutes: 4, level: 'basic', goals: ['save', 'grow'], regions: ['VE', 'LATAM'],
    cards: [
      'Si tu moneda se devalúa, ahorrar en ella es perder poder de compra. Muchas personas guardan parte de su ahorro en una moneda más estable, normalmente el dólar.',
      'Ninguna opción está libre de riesgo: el efectivo se deteriora y se puede perder o robar; una cuenta en el exterior tiene sus comisiones y trámites; las criptomonedas estables dependen de quien las emite.',
      'Por eso conviene repartir: no pongas todo en un solo sitio ni en una sola forma de guardarlo.',
      'Y separa: lo que gastarás este mes en la moneda en la que gastas, y el ahorro de largo plazo en la que mejor conserve su valor.',
    ],
    quiz: { q: '¿Por qué conviene repartir el ahorro entre varias formas de guardarlo?', options: ['Porque todas rinden igual', 'Porque ninguna está libre de riesgo y así un fallo no te quita todo', 'Para pagar más comisiones'], answer: 1, why: 'Diversificar reduce el impacto de que una sola opción falle.' },
  },
  {
    id: 'remesas', title: 'Enviar y recibir dinero sin regalar comisiones', icon: 'swap', minutes: 3, level: 'none', goals: ['control', 'save'], regions: ['VE', 'LATAM', 'ES', 'EU', 'OTHER'],
    cards: [
      'El coste real de un envío es la comisión más la diferencia entre la tasa que te aplican y la tasa real del mercado.',
      'Antes de enviar, compara al menos dos o tres servicios con el mismo importe y mira cuánto recibirá exactamente la otra persona.',
      'Envíos grandes y poco frecuentes suelen salir mejor que muchos pequeños, si hay comisión fija.',
      'Guarda el comprobante y anota el equivalente en la app: te dirá cuánto estás perdiendo en cada método.',
    ],
    quiz: { q: '¿Cómo comparas bien dos servicios de envío?', options: ['Solo miro la comisión', 'Miro cuánto recibe exactamente la otra persona', 'Elijo el más conocido'], answer: 1, why: 'Lo que llega es la comparación justa: incluye comisión y tasa.' },
    go: 'fx', goLabel: 'Registrar un cambio',
  },
];

const ORDER = ['none', 'basic', 'starter', 'advanced'];

/** Lecciones ordenadas para este usuario: lo que más le importa ahora, antes. */
export function rankLessons(data: AppData, now = today()): Lesson[] {
  const p = data.settings.profile;
  const region = regionOf(data);
  const done = new Set(data.settings.learn?.done ?? []);
  const months = emergencyMonths(data, now);
  const month = now.slice(0, 7);
  const ms = monthSummary(data, month);
  const hasDebt = (data.debts ?? []).some((d) => d.direction === 'owe') || data.accounts.some((a) => (a.kind === 'card' || a.kind === 'loan') && a.balance < 0);
  const hasVES = data.accounts.some((a) => a.currency === 'VES') || data.settings.currency === 'VES';
  const subs = detectSubscriptions(data).filter((s) => s.kind === 'subscription' && isActive(s, now)).length;
  const ants = detectAntExpenses(data, now).total;
  const lvl = ORDER.indexOf(p?.level ?? 'none');
  const score = (l: Lesson): number => {
    let s = 100 - LESSONS.indexOf(l);
    if (l.regions?.includes(region)) s += 20;
    if (done.has(l.id)) s -= 1000;
    if (p && l.goals.includes(p.goal)) s += 25;
    const gap = ORDER.indexOf(l.level) - lvl;
    s -= gap > 0 ? gap * 30 : 0; // demasiado avanzada para su nivel
    if (l.id === 'fondo-emergencia' && months < 3) s += 60;
    if (l.id === 'presupuesto' && ms.income > 0 && ms.expenses > ms.income * 0.95) s += 60;
    if (l.id === 'deudas' && hasDebt) s += 55;
    if (l.id === 'proteger-valor' && hasVES) s += 35;
    if (l.id === 'suscripciones' && subs >= 3) s += 30;
    if (l.id === 'gastos-hormiga' && ants > 0) s += 25;
    if ((l.id === 'diversificar' || l.id === 'empezar-a-invertir') && months < 3) s -= 40; // primero el colchón
    return s;
  };
  return LESSONS.filter((l) => !l.regions || l.regions.includes(region)).sort((a, b) => score(b) - score(a));
}

/** «Tu caso»: la lección aplicada a los números reales del usuario. null si aún no hay datos. */
export function yourCase(data: AppData, id: string, now = today()): string | null {
  const base = data.settings.currency;
  const f = (c: number) => formatMoney(c, base);
  const month = now.slice(0, 7);
  const ms = monthSummary(data, month);
  const nw = netWorth(data);
  const months = emergencyMonths(data, now);
  const typical = ms.expenses;
  switch (id) {
    case 'presupuesto':
      return ms.income > 0 ? tr('Este mes ingresas {income} y gastas {spent} ({pct} %). Con la regla 50/30/20, tu ahorro objetivo sería {goal} al mes.', { income: f(ms.income), spent: f(ms.expenses), pct: Math.round((ms.expenses / ms.income) * 100), goal: f(Math.round(ms.income * 0.2)) }) : null;
    case 'fondo-emergencia':
      return typical > 0 ? tr('Tu dinero disponible ({liquid}) cubre {n} meses de gastos. Para llegar a 3 meses te {verb} {amount}.', { liquid: f(nw.liquid), n: months.toFixed(1), verb: nw.liquid / typical >= 3 ? tr('sobra') : tr('faltan'), amount: f(Math.abs(Math.round(typical * 3 - nw.liquid))) }) : null;
    case 'inflacion':
      return nw.liquid > 0 ? tr('Con una inflación del 5 % anual, tu dinero disponible de {liquid} perdería unos {loss} de poder de compra en 10 años si se queda parado.', { liquid: f(nw.liquid), loss: f(Math.round(nw.liquid * (1 - 1 / 1.05 ** 10))) }) : null;
    case 'interes-compuesto': {
      const monthly = Math.round(ms.income * 0.1);
      if (monthly <= 0) return null;
      const r = 0.07 / 12;
      const fv = Math.round(monthly * ((1 + r) ** 240 - 1) / r);
      return tr('Si apartaras el 10 % de tus ingresos ({monthly} al mes) durante 20 años a un 7 % anual (ejemplo, no garantizado), tendrías unos {fv}. Tú habrías aportado {put}.', { monthly: f(monthly), fv: f(fv), put: f(monthly * 240) });
    }
    case 'deudas': {
      const owe = (data.debts ?? []).filter((d) => d.direction === 'owe');
      return owe.length ? tr('Tienes {n} deuda(s) anotada(s). Prioriza la de mayor interés y no dejes que ninguna venza: míralo en Deudas.', { n: owe.length }) : tr('No tienes deudas anotadas: si pides dinero prestado, anótalo para planificar cómo pagarlo.');
    }
    case 'gastos-hormiga': {
      const a = detectAntExpenses(data, now);
      return a.total > 0 ? tr('En los últimos 30 días tus compras pequeñas suman {total} ({n} compras), unos {year} al año.', { total: f(a.total), n: a.count, year: f(a.yearly) }) : null;
    }
    case 'pagarte-primero':
      return ms.income > 0 ? tr('Con el 10 % de tus ingresos ({m}) apartado el día de cobro, en un año ahorrarías {y}.', { m: f(Math.round(ms.income * 0.1)), y: f(Math.round(ms.income * 0.1 * 12)) }) : null;
    case 'suscripciones': {
      const subs = detectSubscriptions(data).filter((x) => x.kind === 'subscription' && isActive(x, now));
      const yearly = subs.reduce((t, x) => t + x.yearlyBase, 0);
      return subs.length ? tr('Tienes {n} suscripción(es) activa(s) que suman {yearly} al año.', { n: subs.length, yearly: f(yearly) }) : null;
    }
    case 'proteger-valor': {
      const ves = data.accounts.filter((a) => a.currency === 'VES');
      return ves.length ? tr('Tienes {n} cuenta(s) en bolívares. Compara lo que pierdes al cambiar y revisa la tasa en Divisas.', { n: ves.length }) : null;
    }
    default:
      return null;
  }
}

export const lessonById = (id: string) => LESSONS.find((l) => l.id === id);

/** Racha: días seguidos (hasta hoy o ayer) con alguna lección completada. */
export function learnStreak(days: string[], now = today()): number {
  const set = new Set(days);
  let streak = 0;
  let d = set.has(now) ? now : new Date(Date.parse(`${now}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  while (set.has(d)) {
    streak++;
    d = new Date(Date.parse(`${d}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  }
  return streak;
}
