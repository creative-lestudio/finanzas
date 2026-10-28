import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lestudio.finanzas',
  appName: 'Finanzas',
  webDir: 'dist-native',
  backgroundColor: '#04132e',
  server: { androidScheme: 'https' },
  plugins: {
    SplashScreen: { launchShowDuration: 0, backgroundColor: '#04132e', androidSplashResourceName: 'splash', showSpinner: false },
  },
};

export default config;
