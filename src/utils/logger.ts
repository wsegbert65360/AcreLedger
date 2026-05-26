/**
 * Centralized logging utility for AcreLedger.
 * Currently logs to console, but can be easily swapped for Sentry or another provider.
 */

const isProd = import.meta.env.PROD;

export const logger = {
  info: (message: string, data?: any) => {
    if (isProd) {
      console.log(`[INFO] ${message}`);
    } else {
      console.log(`[INFO] ${message}`, data || '');
    }
  },
  
  warn: (message: string, data?: any) => {
    if (isProd) {
      console.warn(`[WARN] ${message}`);
    } else {
      console.warn(`[WARN] ${message}`, data || '');
    }
  },
  
  error: (message: string, error?: any) => {
    if (isProd) {
      console.error(`[ERROR] ${message}`, error?.message || 'An error occurred');
    } else {
      console.error(`[ERROR] ${message}`, error || '');
    }
    // Replace with Sentry.captureException(error) in the future
  },
  
  debug: (message: string, data?: any) => {
    if (!isProd) {
      console.debug(`[DEBUG] ${message}`, data || '');
    }
  }
};
