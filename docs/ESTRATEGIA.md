# Finanzas · Estrategia de producto y técnica (CTO)

_Octubre de 2026_

## 1. Posicionamiento

**La app de finanzas para quien vive entre varias monedas.** El público inicial es la diáspora venezolana y latinoamericana en España (y quien cobra o envía dinero entre bolívares, dólares, USDT y euros), sin dejar fuera al usuario español medio.

Nadie en el mercado resuelve bien tres cosas a la vez, y nosotros sí:

1. **Saber cuánto pierdes al cambiar tu dinero** (tasa BCV frente a paralelo, Binance P2P, Wise) y en qué plataforma pierdes menos.
2. **Privacidad real**: los datos se cifran en el dispositivo. Ni nosotros podemos leerlos. Fintonic y las apps de agregación viven, en parte, de ofrecer productos con tus datos.
3. **Un asistente cercano en español**, con personaje propio, que habla de tus números y no de generalidades.

## 2. Mapa competitivo

| App | Mercado | Fortaleza | Debilidad | Qué tomamos |
|---|---|---|---|---|
| **Fintonic** | España | Agregación bancaria de casi todos los bancos; entidad autorizada por el Banco de España | Solo euros; foco en vender productos financieros; diseño anticuado | Alertas de comisiones y cargos; seguridad visible |
| **Wallet (BudgetBakers)** | Global | Multidivisa, sincronización bancaria, presupuestos | Interfaz densa; la multidivisa no mide pérdidas | Planificación de pagos futuros |
| **Monefy / Money Manager / Spendee** | Global | Registro manual rapidísimo | Sin inteligencia, sin banco | Registro en dos toques |
| **Emma / Plum / Goin** | ES/UK | Detección de suscripciones, ahorro automático y redondeo | Plum y Goin mueven dinero (necesitan licencia) | Reglas de ahorro y redondeo (ya incluidas) |
| **YNAB** | EE. UU. | Método de presupuesto base cero con mucha fidelidad | Caro (14,99 $/mes), curva de aprendizaje | Asignar cada euro a un fin (modo opcional) |
| **Monarch / Copilot** | EE. UU. | Diseño premium, patrimonio neto, inversiones | Solo EE. UU., de pago | Tarjetas de patrimonio e inversión, diseño |
| **Rocket Money** | EE. UU. | Detecta y cancela suscripciones, negocia facturas | Muy centrado en EE. UU. | Calendario de próximos cobros |
| **Cleo** | EE. UU./UK | Asistente con personalidad, voz y memoria; humor ("roast mode") | Inglés; depende de adelantos de efectivo para ganar dinero | Personaje con carácter, memoria, voz |
| **Splitwise / Settle Up** | Global | Gastos compartidos | App aparte | Ya integrado en nuestra app |
| **Cheles / Dolarify / Tasalo** | Venezuela | Bolívares y dólares, tasa BCV | Monitores de tasa o gestión muy básica | Tasa del día visible (ya incluida) |

## 3. Dónde estamos frente al mercado

| Función | Nosotros | Fintonic | Wallet | Cleo | YNAB |
|---|---|---|---|---|---|
| Multimoneda con pérdida cambiaria | **Sí, único** | No | Parcial | No | No |
| Cifrado de extremo a extremo | **Sí** | No | No | No | No |
| Registro por voz | **Sí** | No | No | Sí (inglés) | No |
| Asistente con IA y personaje | **Sí** | No | No | Sí | No |
| Metas medibles con interés compuesto | **Sí** | Básico | Sí | Básico | Sí |
| Gastos compartidos | **Sí** | No | No | No | No |
| Sincronización bancaria automática | Preparada (Enable Banking) | **Sí** | **Sí** | Sí | Sí |
| App en tiendas (Play/App Store) | PWA (instalable) | Sí | Sí | Sí | Sí |
| Notificaciones push | Pendiente | Sí | Sí | Sí | Sí |

## 4. Qué integrar, por prioridad

### P0 · Imprescindible para lanzar el MVP
1. **Conectar Supabase** (sección 7): cuentas, sincronización y servidor de IA.
2. **Clave de recuperación del cifrado.** Hoy, si el usuario olvida su contraseña, pierde sus datos. Propuesta: al crear la cuenta, generar 12 palabras de recuperación (como una wallet) que permitan descifrar. Es la mayor fuente de soporte y de reseñas negativas en apps cifradas.
3. **Textos legales**: política de privacidad (RGPD), términos de uso y aviso de "no es asesoramiento financiero". Encargado de tratamiento: Supabase (UE) y Anthropic (IA).
4. **Notificaciones push** (Web Push): presupuesto superado, próximos cobros, recordatorio de tasas del día.
5. **Medición sin invadir**: analítica sin cookies (Plausible o Umami) y errores (Sentry) sin datos financieros.
6. **Presencia en Google Play** con una TWA (la misma PWA empaquetada, con Bubblewrap). Coste bajo, gran visibilidad.

### P1 · Primeros 3 meses tras el lanzamiento
1. **Registro desde WhatsApp o Telegram**: el usuario manda "gasté 20 $ en farmacia" o una nota de voz a un bot y queda apuntado. En Latinoamérica es el canal natural. Encaja con nuestro intérprete de voz.
2. **Pegar notificaciones de Pago Móvil y SMS bancarios** (Banesco, Mercantil, Venezuela): el usuario pega el texto y se crea el movimiento con importe, banco y referencia.
3. **Foto del ticket o del comprobante** con IA (Claude lee la imagen) para registrar sin escribir.
4. **Calendario de próximos cobros** (suscripciones y recibos detectados) con aviso dos días antes.
5. **Memoria del asistente**: que recuerde metas y preferencias entre conversaciones, y poses del personaje según el momento (ya preparadas).
6. **App iOS en la App Store** con Capacitor (la PWA ya funciona en iPhone, pero la tienda da confianza).

### P2 · Diferenciación a medio plazo
1. **Sincronización bancaria en España** con Enable Banking (el puente ya está escrito). Coste por conexión: entra en el plan de pago.
2. **Cotizaciones automáticas** de cripto y fondos (y tasas opcionales de fuentes no oficiales, siempre editables).
3. **Finanzas en pareja o familia**: cuentas y metas compartidas con varios usuarios.
4. **Remesas**: seguimiento de lo enviado a la familia y comparativa de coste por plataforma.
5. **"Modo roast" opcional** del personaje, con humor, al estilo de Cleo (muy viral en redes).

## 5. Ideas para diferenciarnos

- **"El coste real de tu dinero"**: un número mensual con lo que pierdes entre tasas, comisiones y spreads. Nadie lo enseña y para nuestro público es dinero que duele.
- **Ranking personal de plataformas**: "Este mes Wise te costó 1,2 % y Binance P2P 0,8 %". Con datos agregados y anónimos, un ranking público mensual: contenido para redes y prensa.
- **Privacidad como bandera**: "Ni nosotros vemos tus datos". Diferencia clara frente a Fintonic.
- **El personaje como marca**: stickers, avisos y notificaciones con sus poses; contenido en TikTok e Instagram explicando finanzas con él.
- **Valorar todo en "dólar de bolsillo"**: patrimonio en dólares a tasa paralela con un toque, que es como piensa nuestro usuario.

## 6. Decisiones técnicas

- **Arquitectura local-first** (React + TypeScript, PWA): funciona sin conexión y escala sin coste de servidor por usuario. Supabase solo guarda el blob cifrado (una fila por usuario) y sirve la IA.
- **Seguridad**: AES-256-GCM con PBKDF2 (600.000 iteraciones), Row Level Security en Supabase, claves de IA solo en el servidor, límite diario por usuario.
- **Coste de IA**: el asesor usa Claude Opus 5.5 (4 $ / 20 $ por millón de tokens de entrada/salida). Una consulta típica (unos 6.000 tokens de contexto y 800 de respuesta) cuesta unos 0,04 $. Con 60 consultas diarias de límite, el peor caso por usuario activo es de unos 2,4 $/día; en la práctica, la media será muy inferior. **Recomendación para tu decisión**: usar Claude Haiku 5.5 (0,10 $ / 0,50 $) para dictado y clasificación, que son tareas simples, y dejar Opus para el asesor. Hoy todo usa Opus.
- **Modelo de negocio propuesto**: gratis con registro manual, multimoneda, voz local y cinco consultas al asesor al mes. **Premium (3,99 €/mes o 29,99 €/año)**: asesor ilimitado, sincronización entre dispositivos, banco automático, foto de tickets y WhatsApp.

## 7. Cómo conectar tu proyecto de Supabase "finanzas"

1. En Supabase abre el proyecto **finanzas** → **SQL Editor** → **New query**, pega el contenido de `supabase/migrations/20261028000000_finanzas.sql` y pulsa **Run**. Crea las tablas `vaults` (datos cifrados) y `ai_usage` (límite de IA) con sus reglas de seguridad.
2. **Authentication → Providers → Email**: déjalo activado. En **Authentication → URL Configuration** pon como *Site URL* `https://creative-lestudio.github.io/finanzas/app/` y añádela también en *Redirect URLs*.
3. **Project Settings → API**: copia la **Project URL** y la clave **anon / publishable** (es pública por diseño; la clave `service_role` no se comparte nunca).
4. En GitHub → repositorio **finanzas** → **Settings → Secrets and variables → Actions → Variables**: crea `SUPABASE_URL` y `SUPABASE_ANON_KEY` con esos valores. (Alternativa: pásamelos y los dejo configurados en el código; la clave anon puede ir en el código.)
5. **Asistente de IA**: crea una clave en console.anthropic.com (pago por uso, independiente de Claude Pro) y despliega la función:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-del-proyecto>
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... AI_DAILY_LIMIT=60
   npx supabase functions deploy ai
   ```
6. **GitHub Pages**: Settings → Pages → Source: **GitHub Actions**. Cada cambio en la rama principal publica la web.
7. Para probar sin esperar al despliegue: en la app, **Ajustes → Cuenta y sincronización → Servidor propio**, pega la URL y la clave anon.

## 8. Qué falta para lanzar el MVP

| # | Tarea | Quién | Estado |
|---|---|---|---|
| 1 | Aplicar la migración SQL en Supabase | Tú (5 min) | Pendiente |
| 2 | Variables `SUPABASE_URL` y `SUPABASE_ANON_KEY` en GitHub | Tú (2 min) | Pendiente |
| 3 | Clave de Anthropic y despliegue de la función `ai` | Tú + yo | Pendiente |
| 4 | Activar GitHub Pages (o dominio propio) | Tú (1 min) | Pendiente |
| 5 | Clave de recuperación del cifrado | Yo | Por hacer |
| 6 | Política de privacidad, términos y aviso legal | Yo redacto, tú revisas | Por hacer |
| 7 | Notificaciones push | Yo | Por hacer |
| 8 | Analítica sin cookies y control de errores | Yo | Por hacer |
| 9 | Nombre definitivo, dominio y logotipo | Tú | Pendiente (el personaje lleva una "R") |
| 10 | Prueba con 10–20 usuarios reales (beta cerrada) | Ambos | Por hacer |
| 11 | Ficha en Google Play (TWA) | Yo preparo, tú publicas (cuenta de desarrollador: 25 $) | Por hacer |
| 12 | Onboarding, multimoneda, voz, asesor, ojito, diseño | Yo | **Hecho** |

**Métricas para decidir tras la beta**: activación (crea cuenta y registra 5 movimientos en 48 h), retención a 30 días, movimientos por usuario y semana, uso del asesor y de la voz, y conversión a Premium.

## Fuentes

- [Las mejores apps para empezar a ahorrar en 2026 (Público)](https://www.publico.es/ahorro-inteligente/mejores-apps-empezar-ahorrar-2026.html)
- [Apps para ahorrar dinero (Rankiator)](https://rankiator.com/apps-para-ahorrar-dinero/)
- [Mejores apps para gestionar finanzas (Android Ayuda)](https://androidayuda.com/aplicaciones/recomendadas/las-mejores-apps-para-administrar-tus-finanzas-y-presupuestos/)
- [Opiniones de Fintonic (Roams)](https://roams.es/finanzas/entidades-financieras/fintonic/opiniones/?page=4)
- [Best budgeting apps 2026 (Rocket Money)](https://rocketmoney.com/learn/personal-finance/best-budgeting-apps)
- [Best personal finance tools 2026 (Origin)](https://useorigin.com/resources/blog/the-best-personal-finance-budgeting-tools-for-2026-comprehensive-guide-for-smart-money-management)
- [Best budgeting apps 2026 (The Penny Hoarder)](https://www.thepennyhoarder.com/budgeting/best-budgeting-apps/)
- [Cleo lanza su coach de IA (The Next Web)](https://thenextweb.com/news/cleo-launches-ai-money-coach-fix-spending-habits)
- [Cleo review (Money's My Life)](https://www.moneysmylife.com/cleo-app-review/)
- [Cleo (Stork)](https://www.stork.ai/tool/cleo)
- [Cheles (App Store, vía mwm.ai)](https://mwm.ai/apps/cheles/6785313034)
- [Dolarify (vía mwm.ai)](https://mwm.ai/apps/dolarify/6763238329)
- [Tasa BCV (Finanzas Digital)](https://finanzasdigital.com/tag/tasa-bcv/)
