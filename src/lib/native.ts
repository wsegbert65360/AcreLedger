import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Geolocation } from '@capacitor/geolocation';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { toast } from 'sonner';

const isNative = Capacitor.isNativePlatform();

export const native = {
  haptic: {
    light:   () => { if (isNative) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}); },
    medium:  () => { if (isNative) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {}); },
    success: () => { if (isNative) Haptics.notification({ type: NotificationType.Success }).catch(() => {}); },
    error:   () => { if (isNative) Haptics.notification({ type: NotificationType.Error }).catch(() => {}); },
  },
  statusBar: {
    setDark:  () => { if (isNative) StatusBar.setStyle({ style: Style.Dark }).catch(() => {}); },
    setLight: () => { if (isNative) StatusBar.setStyle({ style: Style.Light }).catch(() => {}); },
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
  },
  sharePdf: async (fileName: string, pdfDoc: any): Promise<boolean> => {
    if (!isNative) {
      pdfDoc.save(fileName);
      return true;
    }
    
    try {
      // 1. Get jsPDF output as Data URI
      const dataUri = pdfDoc.output('datauristring');
      
      // 2. Strip base64 prefix
      const base64Data = dataUri.substring(dataUri.indexOf(',') + 1);
      
      // 3. Write binary data to cache directory
      const writeResult = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache
      });
      
      // 4. Invoke system share sheet
      await Share.share({
        title: `AcreLedger Report: ${fileName}`,
        url: writeResult.uri,
        dialogTitle: 'Share PDF Report'
      });
      
      return true;
    } catch (error) {
      console.error('Error sharing PDF:', error);
      toast.error('Failed to share PDF: ' + (error instanceof Error ? error.message : String(error)));
      return false;
    }
  }
};
