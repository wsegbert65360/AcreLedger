import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wsegbert.acreledger',
  appName: 'AcreLedger',
  webDir: 'dist',
  server: {
    iosScheme: 'https',       // required for Supabase auth cookies
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#09090b',
      showSpinner: false,
    },
    StatusBar: {
      style: 'Dark',          // matches dark theme default
    },
  },
};

export default config;
