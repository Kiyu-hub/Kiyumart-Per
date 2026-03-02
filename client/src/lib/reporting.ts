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
