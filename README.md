# Finanzas

App de finanzas personales **local-first y cifrada**, instalable en Android, iPhone, iPad, Windows, Mac y Linux desde el navegador (PWA). Funciona 100 % sin conexión y sin vincular el banco. La sincronización entre dispositivos, el banco (Open Banking) y la IA son opcionales.

- **Web pública:** `index.html` (página de descarga e instrucciones de instalación)
- **App:** `app/` (se instala como app nativa: pantalla completa, icono, sin conexión, atajos)

```bash
npm install
npm run dev            # http://localhost:5173 (web) y /app/ (la app)
npm test               # tests de la lógica (vitest)
npm run build          # build de producción en dist/
npm run build:preview  # un único HTML autocontenido (vista previa)
```

Al abrir la app por primera vez puedes **probar con datos de ejemplo** (4 meses de movimientos, cuentas en EUR, USD y VES, cambios por Binance P2P y Wise).

## Funciones

| Área | Qué hace | Código |
|---|---|---|
| Registro | Entrada manual rápida, **dictado por voz** ("gasté 50 euros en Mercadona") con botones para completar lo que falte, importación de **Excel/CSV** del banco y Open Banking | `components/QuickAdd.tsx`, `components/Voice.tsx`, `lib/voice.ts`, `lib/excel.ts`, `lib/importer.ts`, `lib/banking.ts` |
| Categorización | Reglas, aprendizaje de tus correcciones e IA opcional; Bizum, suscripciones, comisiones y gastos hormiga | `lib/categorize.ts`, `lib/insights.ts` |
| **Multimoneda** | Cuentas en cualquier moneda (VES, USD, EUR, USDT…), cuatro tipos de tasa que escribes tú (BCV, Euro, Paralelo y Personalizada), conversión a tu moneda principal | `lib/fx.ts`, `pages/Currency.tsx` |
| **Pérdida cambiaria** | Cobros a tasa oficial frente a tasa de mercado (800 $ a BCV → cuánto valen de verdad), cambios registrados frente a una tasa de referencia, ranking de plataformas y **calculadora de la ruta del dinero** (Bs → $ paralelo → € Wise) | `lib/fx.ts` |
| Presupuestos | Topes con avisos, €/día disponible, proyección, sugerencias | `lib/budgets.ts`, `pages/Plan.tsx` |
| **Metas medibles** | Ahorro, inversión (interés compuesto), compra o deuda; aporte necesario al mes, media real, fecha estimada, estado (en camino / retrasada) y medición por saldo de cuentas | `lib/goals.ts` |
| **Asesor con IA** | Analiza tus datos, propone presupuestos y metas que aplicas con un toque, y te ayuda a decidir | `lib/ai.ts`, `pages/Assistant.tsx` |
| Ahorro automático, compartidos, salud, patrimonio | Como en la versión anterior, ahora en moneda principal | `lib/savings.ts`, `lib/shared.ts`, `lib/health.ts` |
| **Sincronización** | Entre dispositivos con Supabase, **cifrada de extremo a extremo**, con fusión de cambios a tres bandas | `lib/sync.ts`, `lib/merge.ts`, `store.tsx` |
| Privacidad visual | "Ojito" para ocultar todos los importes al usar la app en público | `lib/money.ts`, `App.tsx` |
| Asistente | Avatar propio del asistente (joven con gafas y americana marino); consejo del día calculado en el dispositivo | `components/Coach.tsx`, `lib/coach.ts` |
| Diseño | Minimalista, color de marca #032a67, superficies limpias y Liquid Glass en la navegación flotante; iconos de línea propios; tema claro/oscuro/automático | `styles.css`, `lib/theme.ts`, `components/icons.tsx` |

Estrategia de producto, análisis de la competencia y lo que falta para el MVP: [`docs/ESTRATEGIA.md`](docs/ESTRATEGIA.md).

## Puesta en marcha del servidor (Supabase)

1. Crea un proyecto en [supabase.com](https://supabase.com) (por ejemplo "finanzas").
2. Aplica la migración `supabase/migrations/20261028000000_finanzas.sql` (SQL Editor → pegar → Run, o `supabase db push`).
3. Despliega las funciones y sus secretos:
   ```bash
   supabase link --project-ref <ref>
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-... AI_DAILY_LIMIT=60
   supabase functions deploy ai
   ```
   La clave de Anthropic se crea en [console.anthropic.com](https://console.anthropic.com) (API de pago por uso; es independiente de una suscripción Claude Pro).
4. En GitHub → **Settings → Secrets and variables → Actions → Variables**, añade `SUPABASE_URL` y `SUPABASE_ANON_KEY` (la clave pública *anon*). El siguiente despliegue activa la sincronización y la IA para todo el mundo.

Sin estos pasos la app funciona igual en modo local; los usuarios pueden poner su propia clave de IA en Ajustes.

## Publicación (GitHub Pages)

El workflow `.github/workflows/deploy.yml` compila, pasa los tests y publica `dist/` en cada push. Actívalo una vez en **Settings → Pages → Source: GitHub Actions**. La web queda en `https://<usuario>.github.io/finanzas/` y la app en `/finanzas/app/`.

## App Android (APK)

La app se empaqueta como aplicación nativa con [Capacitor](https://capacitorjs.com): la misma app web dentro de un contenedor Android, con su icono, pantalla de arranque, dictado con el reconocimiento de voz del sistema e inicio de sesión de Google por el navegador del sistema (Google no permite el WebView).

**Generar el APK (lo hace GitHub, no tu ordenador):**

1. En *Settings → Secrets and variables → Actions → Variables* deben existir `SUPABASE_URL` y `SUPABASE_ANON_KEY` (las mismas de la web).
2. **Clave de firma (una sola vez):** en tu ordenador, con Java instalado, ejecuta `./scripts/crear-clave-android.sh`. Crea el archivo `.jks` (guárdalo en un lugar seguro: sin él no podrás actualizar la app) e imprime los tres secretos para *Settings → Secrets and variables → Actions → Secrets*: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` y `ANDROID_KEY_ALIAS`.
3. En la pestaña **Actions → Compilar app Android (APK) → Run workflow**. Al terminar (10–15 min) publica `finanzas.apk` en **Releases** y la web lo ofrece como descarga directa.

Sin la clave propia el flujo firma con una temporal: el APK funciona, pero cada versión tendría otra firma y Android pediría desinstalar la anterior.

**Inicio de sesión con Google en la app:** en Supabase → Authentication → URL Configuration → *Redirect URLs* añade `com.lestudio.finanzas://auth`.

**Probar en local:** `npm run android:sync` copia la web a `android/` y se abre con Android Studio (`npx cap open android`).

**Play Store:** el mismo proyecto sirve (`./gradlew bundleRelease`), con una cuenta de desarrollador de Google Play (pago único de 25 USD).

**iPhone:** instalar una app nativa fuera de la App Store exige una cuenta de Apple Developer (99 USD/año) y un Mac con Xcode. Mientras tanto, en iPhone se instala desde Safari con «Añadir a pantalla de inicio» (queda con icono y a pantalla completa).

## Seguridad y privacidad

- Datos cifrados en el dispositivo con AES-256-GCM; clave derivada de tu contraseña con PBKDF2-SHA256 (600.000 iteraciones). Bloqueo por inactividad.
- La nube solo recibe el blob cifrado (todos tus dispositivos comparten la sal, así una contraseña abre tus datos en todos). Ni Supabase ni el administrador pueden leerlo.
- La IA recibe un resumen de tus finanzas (nunca contraseñas ni IBAN). Con el **modo sin terceros** activado, nada sale del dispositivo salvo la sincronización cifrada que tú actives.
- Conexión bancaria por Open Banking (PSD2) mediante `supabase/functions/bank-proxy` (Enable Banking): solo lectura, nunca vemos tus credenciales.

## Límites conocidos

- Bizum no tiene API pública: sus movimientos llegan por la cuenta bancaria.
- El ahorro automático propone traspasos a huchas; mover dinero real requeriría un servicio de iniciación de pagos (PISP).
- Las tasas (BCV, Euro, Paralelo y Personalizada) se escriben a mano cada día: no hay una fuente oficial con API estable. Cuando registras un cambio puedes escribir la tasa del día y queda guardada.
- El dictado usa el reconocimiento de voz del navegador: funciona en Chrome (Android, escritorio) y Safari (iPhone, Mac); en Firefox se escribe la frase.
