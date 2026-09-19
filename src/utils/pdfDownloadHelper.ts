import { jsPDF } from 'jspdf';

/**
 * Universal PDF downloader that works seamlessly on Desktop browsers,
 * Mobile web browsers, and inside Capacitor Android APK WebViews.
 */
export async function downloadPdfDoc(doc: jsPDF, fileName: string): Promise<boolean> {
  const isMobile =
    typeof navigator !== 'undefined' &&
    (/android|iphone|ipad|ipod/i.test(navigator.userAgent || '') ||
      (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()));

  let blob: Blob;
  try {
    blob = doc.output('blob');
  } catch (err) {
    console.error('Failed to output blob from jsPDF doc:', err);
    try {
      doc.save(fileName);
      return true;
    } catch {
      return false;
    }
  }

  // 1. On Mobile devices and Android APK WebViews, use native Web Share API
  // Android WebView natively handles File sharing by displaying the system share sheet
  // where users can select "Save to device / Downloads", "Files", "Drive", "WhatsApp", etc.
  if (isMobile && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: fileName,
        });
        return true;
      }
    } catch (shareErr: any) {
      if (shareErr?.name === 'AbortError') {
        // User closed or dismissed the share/save sheet - action was handled
        return true;
      }
      console.warn('Native share dialog error, trying direct browser download:', shareErr);
    }
  }

  // 2. Standard browser download via jsPDF built-in save (ideal for desktop browsers)
  try {
    doc.save(fileName);
    return true;
  } catch (saveErr) {
    console.warn('doc.save failed, trying blob anchor download:', saveErr);
  }

  // 3. Fallback: create an invisible anchor tag with Blob object URL
  try {
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      URL.revokeObjectURL(blobUrl);
    }, 2000);
    return true;
  } catch (blobErr) {
    console.warn('Blob anchor fallback failed, attempting data URI download:', blobErr);
  }

  // 4. Ultimate fallback: Data URI string
  try {
    const dataUri = doc.output('datauristring');
    const link = document.createElement('a');
    link.href = dataUri;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    }, 2000);
    return true;
  } catch (uriErr) {
    console.error('All PDF download mechanisms failed:', uriErr);
    return false;
  }
}
