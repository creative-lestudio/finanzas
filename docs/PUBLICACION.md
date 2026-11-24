# Publicación de Finanzas en Google Play y App Store

_Preparado el 23 de noviembre de 2026._ Identificador de la app en ambas tiendas: **`com.lestudio.finanzas`**.

## Estado

| Pieza | Estado |
|---|---|
| Proyecto Android (`android/`) | ✅ Compila. Ahora genera **APK** (instalación directa) y **AAB** (Google Play) |
| Proyecto iPhone (`ios/`) | ✅ Creado con Capacitor 8 (Swift Package Manager). Permisos, icono 1024 y esquema de regreso de Google ya puestos |
| Flujo `android.yml` | ✅ A mano compila y deja `finanzas.apk` y `finanzas.aab` en Artifacts. Solo publica en Releases si marcas **publish** (la web enlaza a ese APK) |
| Flujo `ios.yml` | ✅ «comprobar» compila sin firma en un Mac de GitHub. «testflight» firma y sube (necesita los secretos de Apple) |
| Capturas y gráfico | ✅ En `store/` (Android 1080×2400, iPhone 1320×2868, gráfico de funciones 1024×500) |
| Cuentas de desarrollador | 🚧 Las pones tú (Google 25 USD una vez; Apple 99 USD al año) |
| Inicio de sesión con Apple | 🚧 Requisito de Apple al ofrecer Google (ver abajo) |
| Política de privacidad y soporte | ⚠️ Falta titular legal y correo de soporte (ver `AUDITORIA.md`) |

## 1. Google Play

1. Crea la cuenta en <https://play.google.com/console> (25 USD). Si es **personal**, Google exige una **prueba cerrada con al menos 12 testers durante 14 días** antes de pedir producción. Una cuenta de organización (con DUNS) no tiene ese requisito.
2. **Clave de firma:** ejecuta `scripts/crear-clave-android.sh` (ya existe) y guarda en GitHub → Settings → Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Es la **clave de subida**; Google gestiona la de distribución (activa «Play App Signing»). Guarda una copia de la clave fuera de GitHub.
3. Actions → «Compilar app Android (APK y AAB)» → Run workflow (deja **publish** sin marcar). Descarga el artifact **finanzas-aab**.
4. Play Console → Crear app → Prueba cerrada → Crear versión → sube `finanzas.aab`. El número de versión sube solo (`versionCode` = número de ejecución).
5. Ficha: usa los textos de abajo, `store/android/*.jpg` como capturas de teléfono (mínimo 2, hay 6), `store/android/feature-graphic-1024x500.png` y el icono de 512 (`public/app/icons/icon-512.png`).
6. Formularios: Seguridad de los datos (respuestas abajo), clasificación de contenido, público objetivo (mayores de 18), anuncios (no), app de finanzas (no es un servicio financiero regulado: no presta ni gestiona dinero).
7. URL de privacidad: `https://creative-lestudio.github.io/finanzas/privacidad.html`. URL para borrar la cuenta: la misma política (sección de derechos) y, dentro de la app, Ajustes → Eliminar cuenta.

## 2. App Store

Hace falta el **Apple Developer Program** (99 USD/año). Los pasos que requieren cuenta Apple no se pueden automatizar sin ella.

1. En <https://developer.apple.com/account> → Identifiers → crea el App ID **`com.lestudio.finanzas`** y otro **`com.lestudio.finanzas.widget`** (el widget). Crea el **App Group `group.com.lestudio.finanzas`** y actívalo en los dos App ID (capacidad App Groups). Sign In with Apple, si lo añades, solo en el principal.
2. En <https://appstoreconnect.apple.com> → Apps → «+» → Nueva app: nombre, idioma principal español, ID de paquete `com.lestudio.finanzas`, SKU `finanzas-ios`.
3. **Certificado** (Certificates → «Apple Distribution») y **dos perfiles** (Profiles → «App Store»: uno para `com.lestudio.finanzas` y otro para `com.lestudio.finanzas.widget`). Descarga el `.p12` (con contraseña) y los dos `.mobileprovision`.
4. **Clave de la API de App Store Connect:** Users and Access → Integrations → Team Keys → «+» (rol App Manager). Descarga el `.p8` (solo se descarga una vez) y anota *Key ID* e *Issuer ID*.
5. Secretos en GitHub (cada archivo en base64 de una línea: `base64 -i archivo | tr -d '\n' | pbcopy` en Mac):

| Secreto | Contenido |
|---|---|
| `APPLE_TEAM_ID` | ID de equipo de 10 caracteres |
| `IOS_CERT_P12_BASE64` | certificado de distribución `.p12` |
| `IOS_CERT_PASSWORD` | contraseña del `.p12` |
| `IOS_PROFILE_BASE64` | perfil de aprovisionamiento `.mobileprovision` |
| `IOS_WIDGET_PROFILE_BASE64` | perfil «App Store» de la extensión del widget (`com.lestudio.finanzas.widget`) |
| `ASC_KEY_ID`, `ASC_ISSUER_ID` | de la clave de la API |
| `ASC_KEY_P8_BASE64` | archivo `.p8` |

6. Actions → «Compilar app iPhone (iOS)» → Run workflow → marca **testflight**. Sube la compilación a TestFlight; el número de compilación sube solo.
7. En App Store Connect: TestFlight (prueba interna con tu equipo) → cuando esté bien, ficha del producto con los textos y `store/ios/*.jpg` (pantalla de 6,9″), etiquetas de privacidad (abajo) y «Enviar a revisión».

### Inicio de sesión con Apple (necesario)
Al ofrecer «Continuar con Google», la guía 4.8 exige ofrecer también un inicio de sesión equivalente en privacidad. Dos caminos:
- **Añadir «Iniciar sesión con Apple»**: activar el proveedor Apple en Supabase (Authentication → Providers → Apple; requiere el Services ID y una clave de Apple) y un botón en la pantalla de bienvenida. Es lo más seguro para pasar la revisión.
- **Quitar Google en iPhone** y dejar solo correo y contraseña en la app de iOS.
Dime cuál prefieres y lo implemento.

### Notas de revisión (campo «Notas para el revisor»)
> Finanzas es un gestor de finanzas personales. No mueve dinero ni se conecta a bancos por defecto. Los datos se cifran en el dispositivo con la contraseña del usuario. Para probar sin crear cuenta: en la pantalla de bienvenida pulse «Probar con datos de ejemplo». El inicio de sesión con correo permite probar la sincronización. El asistente de IA usa un servicio de terceros solo si el usuario lo activa.
>
> Eliminar cuenta: Ajustes → Cuenta → Eliminar cuenta.

(Crea una cuenta de demostración y añade usuario/contraseña si Apple lo pide.)

## 3. Textos de las fichas (español)

**Nombre:** Finanzas: tu dinero, claro  
**Subtítulo (iOS, 30) / descripción corta (Play, 80):**  
`Gastos en bolívares, dólares y euros` · _Gastos, presupuestos y metas en bolívares, dólares y euros. Privada._

**Descripción larga**
```
Finanzas es tu control de gastos privado, hecho para quien vive entre varias monedas.

▸ ANOTA EN SEGUNDOS
Añade un gasto o ingreso con un toque, dictándolo con la voz o escaneando el recibo con una foto. En iPhone, con la app Atajos, puedes anotarlo al pagar con Apple Pay o con dos golpecitos en la parte de atrás.

▸ BOLÍVARES, DÓLARES Y EUROS
Cada pago guarda su equivalente exacto. Las tasas oficiales (BCV dólar y euro) se descargan solas cada día, y puedes usar tu propia tasa. Mide cuánto pierdes al cambiar dinero.

▸ POSICIÓN GLOBAL
Tus cuentas con su logo y saldo, patrimonio neto, deudas, inversiones y gráficos claros por mes y por categoría, con subcategorías.

▸ PRESUPUESTOS, METAS Y GASTOS FIJOS
Pon un tope por categoría y recibe un aviso antes de pasarte. Metas de ahorro con fecha. Alquiler, nómina o suscripciones que se anotan solos cada mes.

▸ ASESORÍA CON IA
Pregunta a tu asistente cómo vas este mes y qué puedes ahorrar. (Opcional.)

▸ PRIVADA DE VERDAD
Tus datos se cifran en tu dispositivo (AES-256) y no se conecta a tu banco. Desbloquea con Face ID o huella. Con tu cuenta, tus datos te siguen cifrados entre dispositivos.

▸ DEUDAS COMPARTIDAS
Divide gastos con amigos y familia y mira quién debe a quién.

Finanzas ofrece herramientas de organización y educación financiera; no es asesoría financiera profesional.
```

**Palabras clave (iOS, 100):** `gastos,presupuesto,bolívares,dólares,euros,finanzas,ahorro,BCV,tasa,cambio,deudas,cuentas`  
**Novedades de la versión:** `Primera versión: registro rápido, varias monedas con equivalentes, tasas del día, escaneo de recibos, gastos fijos, presupuestos y asesoría con IA.`  
**Categoría:** Finanzas · **Edad:** 4+ (iOS) / Todos (Play) · **Precio:** gratis.

## 4. Respuestas para los formularios de privacidad

**Play «Seguridad de los datos»** (la política es la misma para ambas tiendas)

| Dato | ¿Se recoge? | Uso | Compartido | Notas |
|---|---|---|---|---|
| Correo electrónico | Sí (si creas cuenta) | Gestión de la cuenta | No | Supabase |
| Información financiera (movimientos, saldos) | Sí, **cifrada de extremo a extremo** si activas la sincronización | Funcionalidad de la app | No | El servidor solo guarda datos cifrados que no puede leer |
| Fotos (recibos) | Se envían a la IA al escanear; **no se almacenan** | Funcionalidad de la app | Procesador de IA (Anthropic) | Opcional; no con «Modo sin terceros» |
| Audio/voz | Procesado en el dispositivo por el reconocimiento de voz del sistema | Funcionalidad | No | |
| Identificadores/ubicación/anuncios | No | | | |

Prácticas de seguridad: datos cifrados en tránsito y en reposo, el usuario puede pedir que se eliminen sus datos (en la app), no se vende información.

**Apple «Privacidad de la app»**: _Datos vinculados contigo_: Correo electrónico (funcionalidad), Datos financieros (funcionalidad; cifrados). _No se usan para seguimiento._ Sin análisis ni publicidad.

**Cifrado (exportación):** la app usa cifrado estándar para proteger los datos (AES-256, PBKDF2). `ITSAppUsesNonExemptEncryption` está en `false` en `Info.plist` (cifrado exento de uso estándar). Si Apple pregunta, es cifrado estándar de la industria sin funciones criptográficas propias.

## 5. Antes de enviar a revisión (lista)

- [ ] Titular legal y correo de soporte en la política y las condiciones; URL de soporte y de marketing.
- [ ] Supabase en plan Pro, SMTP propio y Google OAuth «En producción» (ver `AUDITORIA.md`).
- [ ] Secretos de firma de Android y Apple cargados.
- [ ] Probar el AAB/IPA en un teléfono real: inicio de sesión (Google y correo), Face ID, voz, cámara, sincronización, eliminar cuenta.
- [ ] Decisión sobre Iniciar sesión con Apple.
- [ ] Capturas revisadas (`store/`), idioma y textos.
- [ ] Prueba cerrada de Google Play (12 testers / 14 días) si la cuenta es personal.

## 6. Limitaciones conocidas de las apps nativas

- **Dictado por voz:** el plugin de voz solo está enlazado en Android; en iPhone se usa el reconocimiento del navegador integrado, que depende de la versión de iOS. Conviene probarlo.
- **Escaneo de recibos:** usa la cámara mediante el selector de archivos. Android pide el permiso de cámara la primera vez.
- **Atajos de Apple Pay / Back Tap:** hoy abren la **PWA** (enlace https). Para que abran la app instalada hace falta añadir enlaces universales (Associated Domains) con un dominio propio; queda para una versión posterior, igual que el widget nativo de saldo.
- **Icono:** generado a partir del SVG de la marca (1024×1024, sin transparencia).
