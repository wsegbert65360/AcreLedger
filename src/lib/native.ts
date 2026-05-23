import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Geolocation } from '@capacitor/geolocation';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { toast } from 'sonner';

const isNative = Capacitor.isNativePlatform();

export function sanitizeNativeFileName(fileName: string): string {
  const cleanName = fileName
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .trim();

  return cleanName || 'acreledger-export';
}

type ShareFileOptions = {
  fileName: string;
  data: string;
  title?: string;
  encoding?: Encoding | 'utf8' | 'base64' | 'ascii';
};

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
  shareFile: async ({ fileName, data, title, encoding }: ShareFileOptions): Promise<boolean> => {
    if (!isNative) return false;

    const safeFileName = sanitizeNativeFileName(fileName);

    try {
      const writeResult = await Filesystem.writeFile({
        path: safeFileName,
        data,
        directory: Directory.Cache,
        ...(encoding ? { encoding: encoding as Encoding } : {})
      });

      await Share.share({
        title: title || safeFileName,
        files: [writeResult.uri]
      });

      return true;
    } catch (error) {
      console.error('Error sharing file:', error);
      toast.error('Failed to share file: ' + (error instanceof Error ? error.message : String(error)));
      return false;
    } finally {
      try {
        await Filesystem.deleteFile({
          path: safeFileName,
          directory: Directory.Cache
        });
      } catch (cleanupError) {
        console.warn('Failed to clean up shared file:', cleanupError);
      }
    }
  },
  sharePdf: async (fileName: string, pdfDoc: any): Promise<boolean> => {
    if (!isNative) {
      pdfDoc.save(fileName);
      return true;
    }

    const dataUri = pdfDoc.output('datauristring');
    const base64Data = dataUri.substring(dataUri.indexOf(',') + 1);

    return native.shareFile({
      fileName,
      data: base64Data,
      title: `AcreLedger Report: ${sanitizeNativeFileName(fileName)}`,
      encoding: Encoding.Base64
    });
  }
};
