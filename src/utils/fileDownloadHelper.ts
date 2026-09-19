import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { jsPDF } from 'jspdf';

export interface DownloadOptions {
  data: Blob | string | Uint8Array;
  fileName: string;
  mimeType: string;
}

export interface DownloadResult {
  success: boolean;
  method: 'android-native' | 'capacitor' | 'web-share' | 'browser-download' | 'error';
  message?: string;
}

/**
 * Converts a Blob to a base64 string (without the data URL prefix)
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Universal file downloader that works seamlessly on:
 * 1. Android APK (installed on Samsung tablet / any Android device) via native Java bridge or Capacitor
 * 2. Mobile web browsers (Web Share API with file attachments)
 * 3. Desktop browsers (standard Blob object URL / anchor download)
 */
export async function downloadFile({
  data,
  fileName,
  mimeType,
}: DownloadOptions): Promise<DownloadResult> {
  try {
    let blob: Blob;
    let base64Data: string;
    let textContent: string | null = null;

    if (data instanceof Blob) {
      blob = data;
      base64Data = await blobToBase64(blob);
    } else if (typeof data === 'string') {
      if (data.startsWith('data:')) {
        // Data URL
        base64Data = data.includes(',') ? data.split(',')[1] : data;
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
      } else {
        // Plain text (e.g. CSV, JSON)
        textContent = data;
        blob = new Blob([data], { type: mimeType });
        base64Data = await blobToBase64(blob);
      }
    } else {
      // Uint8Array or ArrayBuffer
      blob = new Blob([data], { type: mimeType });
      base64Data = await blobToBase64(blob);
    }

    // 1. Android Native Java Bridge (Injected in MainActivity in APK)
    const win = typeof window !== 'undefined' ? (window as any) : null;
    if (win && win.AndroidDownloader) {
      try {
        let saved = false;
        if (textContent && typeof win.AndroidDownloader.saveText === 'function') {
          saved = win.AndroidDownloader.saveText(textContent, fileName, mimeType);
        } else if (typeof win.AndroidDownloader.saveBase64 === 'function') {
          saved = win.AndroidDownloader.saveBase64(base64Data, fileName, mimeType);
        }
        if (saved) {
          return { success: true, method: 'android-native' };
        }
      } catch (nativeErr) {
        console.warn('AndroidDownloader bridge call failed, falling back:', nativeErr);
      }
    }

    // 2. Capacitor Native Filesystem & Share (Android APK / iOS)
    if (Capacitor.isNativePlatform()) {
      try {
        let fileUri = '';

        // Try writing to Public Documents folder first
        try {
          const docRes = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Documents,
            recursive: true,
          });
          fileUri = docRes.uri;
        } catch (docErr) {
          // Fallback to Cache directory
          const cacheRes = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Cache,
            recursive: true,
          });
          fileUri = cacheRes.uri;
        }

        // Open native system share dialog so user can save to Downloads, Drive, WhatsApp, etc.
        try {
          const canShare = await Share.canShare().then(r => r.value).catch(() => false);
          if (canShare && fileUri) {
            await Share.share({
              title: fileName,
              files: [fileUri],
              dialogTitle: `Save or Share ${fileName}`,
            });
          }
        } catch (shareErr) {
          console.warn('Capacitor Share failed after file write:', shareErr);
        }

        return { success: true, method: 'capacitor' };
      } catch (capErr) {
        console.warn('Capacitor Filesystem failed, falling back:', capErr);
      }
    }

    // 3. Web Share API with File (Mobile Chrome, Safari, Samsung Internet)
    const isMobile =
      typeof navigator !== 'undefined' &&
      /Android|iPhone|iPad|iPod|Tablet|Mobile/i.test(navigator.userAgent || '');

    if (isMobile && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        if (typeof File !== 'undefined' && navigator.canShare) {
          const file = new File([blob], fileName, { type: mimeType });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: fileName,
            });
            return { success: true, method: 'web-share' };
          }
        }
      } catch (shareErr) {
        console.warn('Web Share API error, falling back to browser download:', shareErr);
      }
    }

    // 4. Standard Browser Anchor Download (Blob URL)
    try {
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      }, 3000);
      return { success: true, method: 'browser-download' };
    } catch (anchorErr) {
      console.warn('Blob anchor download failed, attempting data URI fallback:', anchorErr);
    }

    // 5. Data URI Anchor Fallback
    try {
      const dataUri = `data:${mimeType};base64,${base64Data}`;
      const link = document.createElement('a');
      link.href = dataUri;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) document.body.removeChild(link);
      }, 3000);
      return { success: true, method: 'browser-download' };
    } catch (dataUriErr) {
      console.error('All download methods failed:', dataUriErr);
      return { success: false, method: 'error', message: 'Failed to trigger download on device' };
    }
  } catch (err: any) {
    console.error('Download error:', err);
    return { success: false, method: 'error', message: err?.message || 'Download failed' };
  }
}

/**
 * Universal PDF downloader from jsPDF instance
 */
export async function downloadPdfDoc(doc: jsPDF, fileName: string): Promise<boolean> {
  try {
    const blob = doc.output('blob');
    const result = await downloadFile({
      data: blob,
      fileName,
      mimeType: 'application/pdf',
    });
    return result.success;
  } catch (err) {
    console.error('PDF download error:', err);
    try {
      doc.save(fileName);
      return true;
    } catch (saveErr) {
      console.error('doc.save fallback failed:', saveErr);
      return false;
    }
  }
}

/**
 * Universal CSV downloader
 */
export async function downloadCsv(csvContent: string, fileName: string): Promise<boolean> {
  const result = await downloadFile({
    data: csvContent,
    fileName,
    mimeType: 'text/csv;charset=utf-8;',
  });
  return result.success;
}

/**
 * Universal JSON downloader
 */
export async function downloadJson(
  data: string | object,
  fileName: string
): Promise<boolean> {
  const jsonStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const result = await downloadFile({
    data: jsonStr,
    fileName,
    mimeType: 'application/json;charset=utf-8;',
  });
  return result.success;
}
