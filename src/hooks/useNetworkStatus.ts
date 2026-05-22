import { useState, useEffect } from 'react';
import { Network } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';

/**
 * Hook to track online/offline network status.
 * Uses Capacitor Network plugin on native platforms, and standard navigator/DOM events on web.
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let active = true;
      
      const getInitialStatus = async () => {
        try {
          const status = await Network.getStatus();
          if (active) {
            setIsOnline(status.connected);
          }
        } catch (e) {
          console.error('Failed to get initial native network status:', e);
        }
      };
      getInitialStatus();

      const handlerPromise = Network.addListener('networkStatusChange', status => {
        if (active) {
          setIsOnline(status.connected);
        }
      });

      return () => {
        active = false;
        handlerPromise.then(h => h.remove());
      };
    } else {
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  return { isOnline };
}
