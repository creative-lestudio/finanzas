import { Capacitor } from '@capacitor/core';
import type { SupabaseClient } from '@supabase/supabase-js';

/** ¿Se ejecuta dentro de la app instalada (APK) y no en el navegador? */
export const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/** Web de la app: a donde llevan los enlaces de los correos (confirmar cuenta, recuperar contraseña). */
export const WEB_APP_URL = (import.meta.env.VITE_WEB_APP_URL as string | undefined) ?? 'https://creative-lestudio.github.io/finanzas/app/';

/** Esquema propio con el que Android devuelve el control a la app tras iniciar sesión con Google. */
export const NATIVE_REDIRECT = 'com.lestudio.finanzas://auth';

let listening = false;

/** Recibe el regreso de Google (enlace profundo) y completa la sesión. */
export async function listenAuthLinks(sb: SupabaseClient): Promise<void> {
  if (listening || !isNative()) return;
  listening = true;
  const { App } = await import('@capacitor/app');
  const { Browser } = await import('@capacitor/browser');
  await App.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith(NATIVE_REDIRECT)) return;
    const u = new URL(url);
    const code = u.searchParams.get('code');
    await Browser.close().catch(() => undefined);
    if (code) await sb.auth.exchangeCodeForSession(code);
  });
}

/** Abre el inicio de sesión de Google en el navegador del sistema (Google no permite el WebView). */
export async function googleSignInNative(sb: SupabaseClient): Promise<string | null> {
  const { Browser } = await import('@capacitor/browser');
  const { data, error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true } });
  if (error) return error.message;
  if (!data.url) return 'No se pudo iniciar el acceso con Google.';
  await Browser.open({ url: data.url });
  return null;
}

/** Ajusta la barra de estado y oculta la pantalla de arranque. */
export async function initNativeShell(): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
  } catch {
    /* opcional */
  }
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {
    /* opcional */
  }
}
