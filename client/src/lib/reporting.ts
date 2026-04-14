import { apiRequest } from "@/lib/queryClient";
import { trackingNotificationService } from "@/tracking/notifications/trackingNotificationService";

const escPdf = (value: string) => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const byteLength = (value: string) => new TextEncoder().encode(value).length;

export const createSimplePdf = (title: string, lines: string[]) => {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const maxLineChars = 106;
  const lineHeight = 14;
  const pages: string[] = [];
  let cursorY = pageHeight - margin;
  let stream = ["BT", "/F1 10 Tf"];

  const pushRawLine = (line: string) => {
    if (cursorY < margin + lineHeight) {
      stream.push("ET");
      pages.push(stream.join("\n"));
      stream = ["BT", "/F1 10 Tf"];
      cursorY = pageHeight - margin;
    }
    stream.push(`1 0 0 1 ${margin} ${cursorY} Tm (${escPdf(line)}) Tj`);
    cursorY -= lineHeight;
  };

  const pushLine = (line: string) => {
    const normalized = line.replace(/\s+/g, " ").trim();
    if (!normalized) {
      pushRawLine(" ");
      return;
    }
    if (normalized.length <= maxLineChars) {
      pushRawLine(normalized);
      return;
    }
    const words = normalized.split(" ");
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxLineChars) {
        if (current) pushRawLine(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) pushRawLine(current);
  };

  pushLine(title);
  pushRawLine(" ");
  lines.forEach(pushLine);
  stream.push("ET");
  pages.push(stream.join("\n"));

  const objects: Record<number, string> = {};
  const pageCount = pages.length;
  const fontObjectId = 3 + pageCount * 2;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pageCount} >>`;
  pages.forEach((pageContent, i) => {
    const pageObjectId = 3 + i * 2;
    const contentObjectId = pageObjectId + 1;
    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId] = `<< /Length ${byteLength(pageContent)} >>\nstream\n${pageContent}\nendstream`;
  });
  objects[fontObjectId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i <= fontObjectId; i += 1) {
    offsets[i] = byteLength(pdf);
    pdf += `${i} 0 obj\n${objects[i] || "<<>>"}\nendobj\n`;
  }
  const xrefOffset = byteLength(pdf);
  pdf += `xref\n0 ${fontObjectId + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= fontObjectId; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${fontObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
};

export const buildCsv = (rows: Array<Record<string, any>>) => {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
};

export const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const openPrintReportWindow = (title: string, loadingText = "Preparing your report...") => {
  const reportWindow = window.open("", "_blank", "width=1100,height=900");
  if (!reportWindow) return null;

  const loadingHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)}</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: "Segoe UI", Arial, sans-serif;
            background: #f4f8fb;
            color: #102a43;
          }
          .shell {
            width: min(520px, calc(100vw - 48px));
            border: 1px solid #d9e2ec;
            border-radius: 22px;
            background: #fff;
            padding: 32px 28px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(16, 42, 67, 0.08);
          }
          .spinner {
            width: 42px;
            height: 42px;
            margin: 0 auto 18px;
            border-radius: 999px;
            border: 3px solid rgba(11, 143, 116, 0.18);
            border-top-color: #0b8f74;
            animation: spin 0.8s linear infinite;
          }
          h1 {
            margin: 0 0 8px;
            font-size: 24px;
          }
          p {
            margin: 0;
            color: #5c6b7a;
            line-height: 1.6;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="shell">
          <div class="spinner"></div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(loadingText)}</p>
        </div>
      </body>
    </html>
  `;

  try {
    reportWindow.document.open();
    reportWindow.document.write(loadingHtml);
    reportWindow.document.close();
  } catch {
    const loadingBlob = new Blob([loadingHtml], { type: "text/html;charset=utf-8" });
    const loadingUrl = URL.createObjectURL(loadingBlob);
    reportWindow.location.replace(loadingUrl);
    window.setTimeout(() => URL.revokeObjectURL(loadingUrl), 60_000);
  }

  return reportWindow;
};

const writePrintReportWindow = (reportWindow: Window, html: string) => {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    reportWindow.location.replace(url);
  } catch {
    try {
      reportWindow.document.open();
      reportWindow.document.write(html);
      reportWindow.document.close();
    } catch {
      // Ignore: if both strategies fail, the caller will still have the opened popup.
    }
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export const renderPrintReportWindow = (
  reportWindow: Window,
  documentTitle: string,
  html: string,
  options?: { autoPrint?: boolean },
) => {
  writePrintReportWindow(reportWindow, html);
  try {
    reportWindow.document.title = documentTitle;
  } catch {
    // Ignore: title may not be writable immediately when using the blob fallback.
  }
  reportWindow.focus();
  if (options?.autoPrint !== false) {
    const triggerPrint = () => {
      window.setTimeout(() => {
        try {
          reportWindow.focus();
          reportWindow.print();
        } catch {
          // Ignore: popup may already be printing or blocked by the browser.
        }
      }, 150);
    };

    reportWindow.onload = triggerPrint;
    window.setTimeout(triggerPrint, 700);
  }
};

export const renderPrintReportError = (reportWindow: Window, title: string, message: string) => {
  writePrintReportWindow(reportWindow, `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)}</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: "Segoe UI", Arial, sans-serif;
            background: #f8fafc;
            color: #102a43;
          }
          .shell {
            width: min(540px, calc(100vw - 48px));
            border: 1px solid #fecaca;
            border-radius: 22px;
            background: #fff;
            padding: 32px 28px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(16, 42, 67, 0.08);
          }
          .badge {
            width: 48px;
            height: 48px;
            margin: 0 auto 18px;
            border-radius: 999px;
            background: #fee2e2;
            color: #b91c1c;
            display: grid;
            place-items: center;
            font-size: 26px;
            font-weight: 700;
          }
          h1 {
            margin: 0 0 8px;
            font-size: 24px;
          }
          p {
            margin: 0;
            color: #5c6b7a;
            line-height: 1.6;
          }
        </style>
      </head>
      <body>
        <div class="shell">
          <div class="badge">!</div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(message)}</p>
        </div>
      </body>
    </html>
  `);
  reportWindow.focus();
};

export const logReportActivity = async (payload: {
  action: "request" | "generate" | "download";
  reportType: string;
  format?: string;
  status?: string;
  reportId?: string;
  scope?: Record<string, any>;
  metadata?: Record<string, any>;
}) => {
  if (payload.action === "request") {
    trackingNotificationService.notifyReportRequested({
      requestedBy: "User",
      reportType: payload.reportType,
      relatedId: payload.reportId,
    });
  }
  try {
    await apiRequest("POST", "/api/reports/activity", payload);
  } catch {
    // Non-blocking: report logging should never block UI actions.
  }
};
