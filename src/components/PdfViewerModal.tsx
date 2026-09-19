import React, { useState } from 'react';
import { X, Download, ExternalLink, Printer, Check, Copy, FileText, Info, Eye } from 'lucide-react';

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  fileName: string;
  blobUrl: string | null;
  dataUri?: string | null;
  onDownloadAgain?: () => void;
  patientName?: string;
  regNo?: string;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  isOpen,
  onClose,
  title = 'Case Sheet PDF',
  fileName,
  blobUrl,
  dataUri,
  onDownloadAgain,
  patientName,
  regNo,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const activeSrc = blobUrl || dataUri || '';

  const handleOpenInNewTab = () => {
    if (blobUrl) {
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
    } else if (dataUri) {
      const win = window.open();
      if (win) {
        win.document.write(
          `<iframe src="${dataUri}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
        );
      }
    }
  };

  const handlePrint = () => {
    if (activeSrc) {
      const printWindow = window.open(activeSrc, '_blank');
      if (printWindow) {
        printWindow.focus();
        printWindow.print();
      }
    }
  };

  const handleCopyFileName = () => {
    navigator.clipboard.writeText(fileName).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-5xl h-[92vh] sm:h-[88vh] flex flex-col shadow-2xl border border-sky-200 overflow-hidden">
        {/* Header Bar */}
        <div className="p-3.5 sm:p-4 bg-gradient-to-r from-sky-900 via-sky-800 to-indigo-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-white/10 text-sky-300 shrink-0">
              <FileText className="w-5 h-5 text-sky-200" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-extrabold truncate text-white">
                  {title}
                </h3>
                {regNo && (
                  <span className="font-mono text-[11px] bg-sky-500/30 text-sky-200 px-2 py-0.5 rounded-md border border-sky-400/30 font-bold shrink-0">
                    ID: {regNo}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-sky-200/80 truncate">
                {patientName ? `Patient: ${patientName} • ` : ''}File: <span className="font-mono">{fileName}</span>
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleOpenInNewTab}
              className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border border-white/15"
              title="Open PDF in Full Browser Window / Tab"
            >
              <ExternalLink className="w-3.5 h-3.5 text-sky-200" />
              <span className="hidden sm:inline">Open in New Tab</span>
            </button>

            {onDownloadAgain && (
              <button
                type="button"
                onClick={onDownloadAgain}
                className="px-2.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                title="Download PDF again"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Download</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border border-white/15"
              title="Print PDF"
            >
              <Printer className="w-3.5 h-3.5 text-sky-200" />
              <span className="hidden md:inline">Print</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer ml-1"
              title="Close PDF Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Download Location Banner */}
        <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0 text-emerald-900">
            <Info className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="truncate">
              <b>Saved to your device:</b> Check your device's <b>Downloads</b> folder for <span className="font-mono font-bold">{fileName}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyFileName}
              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 bg-emerald-100/60 hover:bg-emerald-100 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-emerald-600" />}
              <span>{copied ? 'Copied name' : 'Copy file name'}</span>
            </button>
            <button
              type="button"
              onClick={handleOpenInNewTab}
              className="text-[11px] font-bold text-sky-700 hover:text-sky-900 underline flex items-center gap-1 cursor-pointer"
            >
              <Eye className="w-3 h-3" />
              <span>Full Screen Link</span>
            </button>
          </div>
        </div>

        {/* PDF Frame Preview Area */}
        <div className="flex-1 bg-slate-100 relative overflow-hidden flex flex-col">
          {activeSrc ? (
            <iframe
              src={activeSrc}
              title={title}
              className="w-full h-full border-0 bg-white"
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500">
              <FileText className="w-12 h-12 text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-700">Loading PDF document...</p>
              <p className="text-xs text-slate-400 mt-1">
                If the document does not display, click "Open in New Tab" above.
              </p>
            </div>
          )}
        </div>

        {/* Footer info and direct access link */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600 shrink-0">
          <div className="text-[11px] text-slate-500">
            Official Clinical Case Record • Namana Physiotherapy Clinic, Mysuru
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleOpenInNewTab}
              className="text-sky-700 hover:text-sky-900 font-bold underline cursor-pointer text-[11px] flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Direct Link to PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
