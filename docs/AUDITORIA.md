# Auditoría de Finanzas (web y app) · 3 de noviembre de 2026

Resultado de revisar la web (`/`), la app (`/app/`), el backend (Supabase) y el proceso de publicación.
Lo marcado con ✅ ya está corregido en la rama; ⚠️ queda pendiente; 🚧 es requisito para lanzar.

## 1. Errores y bugs encontrados

| # | Problema | Estado |
|---|----------|--------|
| 1 | Los bolívares se valoraban con una tasa Paralelo antigua (≈28 Bs) y daban «5.852 €» en vez de ≈164 €. | ✅ Gana la tasa más reciente; oficial (BCV/Euro) por defecto; descarga diaria automática |
| 2 | El valor de una cuenta en Bs mezclaba equivalentes de movimientos antiguos y no coincidía con el saldo mostrado. | ✅ Ahora es el saldo a la tasa de hoy |
| 3 | La descarga de tasas ignoraba el «Modo sin terceros». | ✅ Respeta el modo; documentado en la política de privacidad |
| 4 | En la web, el botón de iPhone no abría la app y no había forma de entrar. | ✅ «Abrir la app en Safari» + guía |
| 5 | Web en móvil: tarjetas estrechas con texto cortado (estilo en línea que creaba columnas fantasma) y desborde lateral. | ✅ |
| 6 | Sin «Abrir app» en la cabecera ni en la barra inferior móvil. | ✅ |
| 7 | Gráficos de resumen estirados y listas pegadas al borde de la tarjeta. | ✅ Rediseñados |
| 8 | El recorrido de primer uso no se mostraba antes de configurar cuentas; la información (Face ID, instalar, sincronizar) se acumulaba al empezar. | ✅ Recorrido a cargo del asistente + 3 tareas; Face ID/instalar/sincronizar solo después |
| 9 | Accesibilidad: contraste insuficiente del texto secundario (WCAG AA), elementos `aria-hidden` con enlaces, carrusel sin acceso por teclado. | ✅ (axe-core: 0 incidencias en web escritorio, política y bienvenida de la app) |
| 10 | La app no tenía Content-Security-Policy. | ✅ CSP por meta (scripts solo propios, sin `object`, sin inline) |
| 11 | SEO/compartir: sin canonical, sin imagen Open Graph absoluta ni de tamaño correcto, sin robots/sitemap/datos estructurados. | ✅ |

## 2. Puntos a mejorar (no bloquean, pero conviene)

- ⚠️ **Dependencias:** `npm audit` marca 9 avisos moderados (todos transitivos de `exceljs`/`uuid`, usado solo para importar/exportar Excel; riesgo bajo). Valorar migrar a una librería ligera de XLSX.
- ⚠️ **Tasas:** DolarApi es un servicio comunitario sin SLA. Recomendable guardar la última respuesta, mostrar su fecha y tener una segunda fuente de respaldo (o un pequeño endpoint propio en Supabase que las cachee).
- ⚠️ **Pruebas automáticas:** hay 62 pruebas unitarias; faltan pruebas de extremo a extremo en CI (los guiones de Playwright existen pero se ejecutan a mano).
- ⚠️ **Monitorización de errores** (p. ej. Sentry con datos anonimizados) y analítica respetuosa con la privacidad (Plausible/Umami).
- ⚠️ **Contraseña de cifrado:** si se olvida, los datos no se pueden recuperar (por diseño). Añadir una **clave de recuperación** de 24 palabras que el usuario guarde al crear la cuenta.
- ⚠️ **Sin «Iniciar sesión con Apple».** Ver requisitos de la App Store.
- ⚠️ El IA («Asesoría») no debe presentarse como asesoramiento financiero regulado; añadir aviso breve en la pantalla y en condiciones.

## 3. Qué hace falta para lanzar al mercado

### Legal y marca 🚧
- Titular legal (persona o sociedad), dirección y correo de contacto/soporte en política de privacidad y condiciones. Si hay usuarios en la UE (euros): RGPD (responsable, base legal, derechos, transferencias a Supabase y Anthropic).
- Dominio propio (`finanzas…`) en lugar de `github.io`: más confianza, necesario para el nombre en la pantalla de Google y para correos.

### Backend (Supabase) 🚧
- **Plan de pago (Pro).** El gratuito pausa el proyecto tras 7 días sin actividad y tiene límites bajos.
- **SMTP propio** (Resend, Brevo…): el correo integrado de Supabase está muy limitado y es lo que usa la confirmación de cuenta, la recuperación de contraseña y las invitaciones a deudas compartidas.
- **Google OAuth:** pantalla de consentimiento en «En producción», con política de privacidad y condiciones; dominio autorizado y URLs de redirección definitivas.
- Función `ai`: clave de Anthropic solo en el servidor, límite por usuario (`ai_usage`) y alerta de gasto.
- Copias de seguridad del proyecto y migraciones aplicadas en orden (las tres están en `supabase/migrations`).

### Google Play 🚧
- Cuenta de desarrollador (25 USD, pago único). Cuentas personales nuevas: prueba cerrada con **12 testers durante 14 días** antes de producción.
- Publicar un **AAB** firmado (hoy el flujo genera APK: cambiar a `bundleRelease`), ficha con capturas, gráfico de funciones, formulario de «Seguridad de los datos» y URL de privacidad.
- Eliminación de cuenta: ya existe dentro de la app (Ajustes) y debe indicarse una URL web equivalente.

### App Store 🚧
- Apple Developer Program (99 USD/año) y un Mac con Xcode: falta generar el proyecto iOS (`npx cap add ios`).
- **Inicio de sesión con Apple** (o ofrecer solo correo): al ofrecer Google, Apple exige una opción de inicio de sesión equivalente en privacidad.
- Cuenta de demostración para el revisor, capturas por tamaño de pantalla y etiquetas de privacidad.

### Producto y calidad 🚧
- Pruebas en dispositivos reales (iPhone con Safari y PWA, Android de gama baja) y una **beta cerrada de 15–30 personas** con tus casos reales (Bs, Zelle, Binance).
- Clave de recuperación (ver arriba) y flujo claro para «cambié de móvil».
- Soporte: correo y una página de preguntas frecuentes (ya existe una base en la web).
- Plan de versiones y changelog visible; revisar los límites de `ai_usage` y los costes por usuario antes de abrir el registro.

## 4. Orden recomendado
1. Aceptar los cambios de esta rama y publicar la web/PWA (ya en producción de pruebas).
2. Supabase Pro + SMTP + Google OAuth en producción + dominio.
3. Clave de recuperación + monitorización.
4. Beta cerrada (web/PWA y APK) → corregir.
5. Play Store (AAB) y, en paralelo, iOS + Apple Sign-In.
6. Lanzamiento público y publicación de los paquetes corregidos en la web.
