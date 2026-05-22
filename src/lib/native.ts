import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Geolocation } from '@capacitor/geolocation';

const isNative = Capacitor.isNativePlatform();

export const native = {
  haptic: {
    light:   () => { if (isNative) Haptics.impact({ style: ImpactStyle.Light }); },
    medium:  () => { if (isNative) Haptics.impact({ style: ImpactStyle.Medium }); },
    success: () => { if (isNative) Haptics.notification({ type: NotificationType.Success }); },
    error:   () => { if (isNative) Haptics.notification({ type: NotificationType.Error }); },
  },
  statusBar: {
    setDark:  () => { if (isNative) StatusBar.setStyle({ style: Style.Dark }); },
    setLight: () => { if (isNative) StatusBar.setStyle({ style: Style.Light }); },
  },
  geolocation: {
    getCurrentPosition: async (options?: PositionOptions): Promise<{ coords: { latitude: number; longitude: number } }> => {
      if (isNative) {
        const pos = await Geolocation.getCurrentPosition(options);
        return {
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude
          }
        };
      } else {
        return new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported on this browser'));
          } else {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                resolve({
                  coords: {
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude
                  }
                });
              },
              reject,
              options
            );
          }
        });
      }
    }
  }
};
