# Finanzas

App de finanzas personales (PWA instalable en el móvil), **local-first y cifrada**. Funciona 100 % sin conexión y sin vincular el banco; la conexión bancaria por Open Banking y la IA son opcionales.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests de la lógica
npm run build    # build de producción en dist/
```

Al abrirla por primera vez puedes **empezar con datos de ejemplo** (4 meses de movimientos) para probarlo todo.

## Qué hace

| Área | Funcionalidad | Dónde |
|---|---|---|
| **Sincronización** | Open Banking (PSD2) vía Enable Banking, con un puente serverless propio | `src/lib/banking.ts`, `supabase/functions/bank-proxy` |
| | Importación de extractos CSV de bancos españoles (detecta separador, cabecera, `1.234,56`, cargo/abono, Windows-1252) sin duplicados | `src/lib/importer.ts` |
| | Bizum: se detecta en los movimientos de la cuenta (enviado/recibido) | `src/lib/categorize.ts` |
| | Entrada manual rápida (botón **+**): importe, categoría con un toque, listo | `src/components/QuickAdd.tsx` |
| **Categorización** | Reglas integradas (Mercadona, Repsol, Netflix…), reglas propias y **aprendizaje** de tus correcciones; IA (Claude) opcional para lo que no reconozca | `src/lib/categorize.ts` |
| | Gastos hormiga: compras pequeñas repetidas y su proyección anual | `src/lib/insights.ts` |
| | Suscripciones y recibos fijos: detección de cobros periódicos, próximos cargos y subidas de precio | `src/lib/insights.ts` |
| | Comisiones bancarias ocultas, con consejo para evitar cada tipo | `src/lib/insights.ts` |
| **Presupuesto** | Topes por categoría con aviso al instante al registrar un gasto, proyección a fin de mes, €/día disponible, arrastre al mes siguiente y sugerencias según tu gasto medio | `src/lib/budgets.ts` |
| | Huchas / sobres digitales con objetivo, fecha límite y prioridad | `src/lib/savings.ts` |
| | Gastos compartidos estilo Splitwise: partes iguales o por pesos, saldos y mínimo de pagos para quedar en paz | `src/lib/shared.ts` |
| **Salud e inversión** | Puntuación 0-100 (ahorro, colchón, deuda, presupuestos, suscripciones, fugas) con consejos priorizados | `src/lib/health.ts` |
| | Patrimonio neto: cuentas, ahorro, efectivo, inversiones, cripto, tarjetas y préstamos | `src/pages/Wealth.tsx` |
| | Ahorro automático estilo Plum: redondeo, % de ingresos y "ahorro inteligente" según tus hábitos, repartido por prioridad entre huchas | `src/lib/savings.ts` |
| **Seguridad** | Datos cifrados con AES-256-GCM, clave derivada de tu contraseña (PBKDF2-SHA256, 600.000 iteraciones). La clave solo está en memoria; bloqueo automático por inactividad | `src/lib/crypto.ts`, `src/store.tsx` |
| | **Modo sin terceros** (activado por defecto): nada sale del dispositivo; desactiva banco e IA | Ajustes |
| | Copia de seguridad exportable, también cifrada | Ajustes |

## Conectar el banco (opcional)

Las claves de un proveedor de Open Banking no pueden vivir en el navegador, así que la app habla con una pequeña función serverless (`supabase/functions/bank-proxy`). La app **nunca ve tus credenciales**: te identificas en la web de tu banco y el proveedor (entidad regulada AISP) concede un permiso de **solo lectura** de hasta 180 días.

1. Crea una aplicación en [Enable Banking](https://enablebanking.com) (cubre BBVA, Santander, CaixaBank, Sabadell, ING, Openbank, etc.) y descarga su clave privada.
2. Despliega la función en tu proyecto de Supabase:
   ```bash
   supabase secrets set ENABLEBANKING_APP_ID=... ENABLEBANKING_PRIVATE_KEY="$(cat private.pem)" ALLOWED_ORIGIN=https://tu-dominio
   supabase functions deploy bank-proxy --no-verify-jwt
   ```
3. En la app: **Ajustes → desactiva "Modo sin terceros" → pega la URL de la función → busca tu banco → Conectar**.

La función está pensada para uso personal (un único usuario): restringe el acceso por `ALLOWED_ORIGIN`. Si la abres a más usuarios, añade autenticación (Supabase Auth) y asocia cada sesión bancaria a su usuario.

## Arquitectura

- React 19 + TypeScript + Vite, sin backend obligatorio. Toda la lógica está en `src/lib/` como funciones puras con tests (`src/lib/lib.test.ts`).
- Importes en céntimos (enteros); gastos negativos, ingresos positivos.
- Persistencia: un único blob cifrado en IndexedDB (`src/lib/storage.ts`).
- PWA: `public/manifest.webmanifest` + `public/sw.js` (funciona sin conexión).

## Límites actuales

- Bizum no tiene API pública: sus movimientos se obtienen de la cuenta bancaria a la que está asociado.
- El ahorro automático **propone** los traspasos a las huchas y tú los confirmas; mover dinero real entre cuentas requeriría un servicio de iniciación de pagos (PISP).
- Las inversiones y cripto se actualizan a mano (no hay cotización automática todavía).
- Los datos viven en un solo dispositivo; para usarlos en otro, exporta e importa la copia cifrada.
- La puntuación de salud es orientativa y no constituye asesoramiento financiero.
