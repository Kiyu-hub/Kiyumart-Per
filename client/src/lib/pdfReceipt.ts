/**
 * Shared PDF receipt generator.
 *
 * Renders the same A5 receipt layout used for magic-link cart purchases and
 * authenticated-buyer orders. Branding (logo / name / primaryColor /
 * contact info) is passed in so callers can use either store branding
 * (magic-link) or platform branding (in-platform receipts).
 */

export interface PdfReceiptInput {
  /** Brand color in hex, e.g. "#16a34a". Falls back to teal. */
  brandColor: string;
  /** Heading shown inside the header band. */
  brandName: string;
  /** Optional logo URL (PNG/JPG). Stays optional — falls back to text. */
  logoUrl?: string | null;
  /** Order metadata rendered in the meta section. */
  orderNumber: string;
  date: string;
  storeName?: string | null;
  address?: string | null;
  /** Items in the receipt — name x qty, line total. */
  items: Array<{ name: string; quantity: number; price: number }>;
  /** Optional financial breakdown. If any are positive they're rendered. */
  subtotal?: number;
  deliveryFee?: number;
  processingFee?: number;
  couponDiscount?: number;
  /** Total paid — required, rendered in brand color. */
  total: number;
  currency?: string;
  /** Optional contact section at the bottom (platform or store). */
  contactEmail?: string | null;
  contactPhone?: string | null;
  /** Optional footer label (defaults to "Secured by Paystack"). */
  footerLabel?: string;
}

function parseHex(hex: string): [number, number, number] {
  const color = hex && hex.startsWith("#") ? hex : "#16a34a";
  return [
    parseInt(color.slice(1, 3), 16) || 22,
    parseInt(color.slice(3, 5), 16) || 163,
    parseInt(color.slice(5, 7), 16) || 74,
  ];
}

export async function generateBrandedReceiptPdf(input: PdfReceiptInput): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const [r, g, b] = parseHex(input.brandColor);
  const currency = input.currency || "GHS";

  // ── Header band ─────────────────────────────────────────────────────────
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, W, 28, "F");

  let headerY = 10;
  if (input.logoUrl) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = input.logoUrl!;
        setTimeout(() => reject(), 3000);
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 120;
      canvas.height = img.naturalHeight || 120;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      doc.addImage(canvas.toDataURL("image/png"), "PNG", (W - 14) / 2, 5, 14, 14);
      headerY = 21;
    } catch {
      headerY = 10;
    }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(input.logoUrl ? 9 : 14);
  doc.setFont("helvetica", "bold");
  doc.text(input.brandName || "Order Receipt", W / 2, headerY + (input.logoUrl ? 0 : 4), {
    align: "center",
  });

  doc.setTextColor(r, g, b);
  doc.setFontSize(13);
  doc.text("Payment Receipt", W / 2, 38, { align: "center" });
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.4);
  doc.line(14, 41, W - 14, 41);

  // ── Meta ────────────────────────────────────────────────────────────────
  let y = 48;
  doc.setFontSize(9);
  const meta: Array<[string, string]> = [
    ["Order #", input.orderNumber],
    ["Date", input.date],
  ];
  if (input.storeName) meta.push(["Store", input.storeName]);
  if (input.address) meta.push(["Address", input.address]);

  meta.forEach(([label, value]) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(label, 14, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    const wrapped = doc.splitTextToSize(value, W - 60);
    doc.text(wrapped, W - 14, y, { align: "right" });
    y += wrapped.length > 1 ? wrapped.length * 5 + 3 : 8;
  });

  // ── Items ───────────────────────────────────────────────────────────────
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(14, y, W - 14, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("ITEMS", 14, y);
  y += 5;

  input.items.forEach((item) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(8.5);
    const itemLine = doc.splitTextToSize(`${item.name} × ${item.quantity}`, W - 60);
    doc.text(itemLine, 14, y);
    doc.setFont("helvetica", "bold");
    doc.text(`${currency} ${(item.price * item.quantity).toFixed(2)}`, W - 14, y, { align: "right" });
    y += itemLine.length > 1 ? itemLine.length * 5 + 1 : 6;
  });

  // ── Financial breakdown (optional rows) ─────────────────────────────────
  doc.setLineWidth(0.3);
  doc.setDrawColor(220, 220, 220);
  doc.line(14, y, W - 14, y);
  y += 5;

  const writeRow = (label: string, amount: number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 9);
    doc.setTextColor(bold ? r : 80, bold ? g : 80, bold ? b : 80);
    doc.text(label, 14, y);
    doc.setFont("helvetica", "bold");
    doc.text(`${currency} ${amount.toFixed(2)}`, W - 14, y, { align: "right" });
    y += bold ? 8 : 6;
  };

  if (typeof input.subtotal === "number" && input.subtotal > 0) writeRow("Subtotal", input.subtotal);
  if (typeof input.deliveryFee === "number" && input.deliveryFee > 0)
    writeRow("Delivery Fee", input.deliveryFee);
  if (typeof input.processingFee === "number" && input.processingFee > 0)
    writeRow("Processing Fee", input.processingFee);
  if (typeof input.couponDiscount === "number" && input.couponDiscount > 0)
    writeRow("Coupon Discount", -input.couponDiscount);

  // Total
  doc.setLineWidth(0.3);
  doc.setDrawColor(220, 220, 220);
  doc.line(14, y, W - 14, y);
  y += 6;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("Total Paid", 14, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(r, g, b);
  doc.text(`${currency} ${input.total.toFixed(2)}`, W - 14, y, { align: "right" });
  y += 12;

  // ── Contact ─────────────────────────────────────────────────────────────
  if (input.contactEmail || input.contactPhone) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(120, 120, 120);
    doc.text("NEED HELP?", 14, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    if (input.contactEmail) {
      doc.text(input.contactEmail, 14, y);
      y += 5;
    }
    if (input.contactPhone) {
      doc.text(input.contactPhone, 14, y);
      y += 5;
    }
  }

  // Footer band
  doc.setFillColor(r, g, b);
  doc.rect(0, H - 12, W, 12, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(255, 255, 255);
  doc.text(input.footerLabel || "Secured by Paystack", W / 2, H - 5, { align: "center" });

  return doc.output("blob");
}
