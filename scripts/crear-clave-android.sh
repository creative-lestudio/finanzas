#!/usr/bin/env bash
# Crea la clave con la que se firma la app Android. Ejecútalo UNA sola vez, en tu ordenador.
# Necesita Java (comando keytool). Guarda el archivo .jks en un lugar seguro: si lo pierdes,
# no podrás publicar actualizaciones de la misma app.
set -euo pipefail

OUT="${1:-finanzas-release.jks}"
ALIAS="finanzas"
read -r -s -p "Elige una contraseña para la clave (mín. 8 caracteres): " PASS; echo
[ "${#PASS}" -ge 8 ] || { echo "Demasiado corta."; exit 1; }

keytool -genkeypair -v -keystore "$OUT" -storepass "$PASS" -keypass "$PASS" -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Finanzas"

echo
echo "Listo: $OUT"
echo
echo "Ahora, en GitHub → Settings → Secrets and variables → Actions → New repository secret, crea:"
echo "  ANDROID_KEYSTORE_BASE64   = (el texto largo que sale abajo)"
echo "  ANDROID_KEYSTORE_PASSWORD = la contraseña que acabas de elegir"
echo "  ANDROID_KEY_ALIAS         = $ALIAS"
echo
echo "----- ANDROID_KEYSTORE_BASE64 (copia todo) -----"
base64 -w0 "$OUT" 2>/dev/null || base64 "$OUT" | tr -d '\n'
echo
echo "-------------------------------------------------"
echo "No compartas ese texto ni el archivo con nadie, ni lo subas al repositorio."
