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
