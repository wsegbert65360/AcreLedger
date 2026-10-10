import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wsegbert.acreledger',
  appName: 'AcreLedger',
  webDir: 'dist',
  server: {
    iosScheme: 'https',       // required for Supabase auth cookies
    androidScheme: 'https',   // keep the native auth/storage origin stable
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
    SystemBars: {
      // The app reads env(safe-area-inset-*), not the --safe-area-inset-* vars
      // that 'css' injects. 'native' passes insets through to env() on
      // WebView 140+ (index.html sets viewport-fit=cover) and pads the
      // WebView on older versions.
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover', // avoids a layout jump before the meta tag is read
    },
    // Native SQLite encryption is off unless this flag is explicit. The iOS
    // plugin defaults a missing iosIsEncryption key to false, then rejects
    // encrypted connections and secret APIs — which locked Sign Out.
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: true,
      iosKeychainPrefix: 'acreledger',
      androidIsEncryption: true,
    },
  },
};

export default config;
