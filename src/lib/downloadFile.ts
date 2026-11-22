import { Capacitor } from '@capacitor/core';

import { native } from '@/lib/native';

/**
 * The one way the app hands a generated file to the user: the share sheet on
 * native, a download link on the web. Returns false when the native share
 * failed. The object URL is revoked after a delay; revoking it right after
 * click() can cancel the download in Safari and Firefox.
 */
export async function downloadFile(
  content: string,
  fileName: string,
  contentType: string,
  title = `AcreLedger Export: ${fileName}`,
): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const shared = await native.shareFile({ fileName, data: content, title, encoding: 'utf8' });
    return shared !== false;
  }

  const url = URL.createObjectURL(new Blob([content], { type: contentType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}
