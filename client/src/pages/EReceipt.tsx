import { useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { buildCsv, createSimplePdf, logReportActivity, triggerDownload } from "@/lib/reporting";
import QRCode from "react-qr-code";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

type ReceiptPayload = {
  receipt: {
    id: string;
    receiptNumber: string;
    orderId: string;
    trigger: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    deliveryMethod: string;
    deliveryAddress?: string | null;
    createdAt: string;
    updatedAt?: string | null;
    deliveredAt?: string | null;
  };
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    lineTotal: number;
  }>;
  financial: {
    subtotal: number;
    deliveryFee: number;
    processingFee: number;
    couponDiscount: number;
    total: number;
    currency: string;
    sellerPaidAmount: number;
    platformCommissionAmount: number;
    platformAmount: number;
    commissionRate: number;
    commissionStatus?: string | null;
  };
  transaction: {
    id?: string | null;
    status?: string | null;
    amount?: number;
    provider?: string | null;
    reference?: string | null;
    createdAt?: string | null;
  } | null;
  statusFlow?: string;
  completion?: { isCompleted: boolean; completedAt?: string | null };
  busDeliveryWorkflow?: { stage?: string | null; proofSubmitted?: boolean } | null;
};

export default function EReceipt() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { formatPrice } = useLanguage();
  const { toast } = useToast();
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [exporting, setExporting] = useState<"none" | "csv" | "pdf">("none");

  const { data, isLoading } = useQuery<ReceiptPayload>({
    queryKey: ["/api/receipts", id],
    queryFn: async () => {
      const res = await fetch(`/api/receipts/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Receipt not found");
      return res.json();
    },
    enabled: Boolean(id),
    refetchInterval: 20000,
  });

  const reportScope = useMemo(() => ({ orderId: id || null, receiptId: data?.receipt?.id || null }), [data?.receipt?.id, id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading receipt...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Receipt not found</h2>
          <Button onClick={() => navigate("/orders")}>View All Orders</Button>
        </div>
      </div>
    );
  }

  const exportCsv = async () => {
    await logReportActivity({ action: "request", reportType: "order_receipt", format: "csv", scope: reportScope, status: "success" });
    try {
      setExporting("csv");
      const rows = data.items.map((item) => ({
        receipt_number: data.receipt.receiptNumber,
        order_number: data.order.orderNumber,
        order_id: data.order.id,
        product_name: item.productName,
        quantity: item.quantity,
        unit_price: item.price.toFixed(2),
        line_total: item.lineTotal.toFixed(2),
        order_status: data.order.status,
        payment_status: data.order.paymentStatus,
        delivery_method: data.order.deliveryMethod,
        bus_stage: data.busDeliveryWorkflow?.stage || "",
        is_completed: data.completion?.isCompleted ? "yes" : "no",
        transaction_reference: data.transaction?.reference || "",
      }));
      const csvData = buildCsv(rows);
      if (!csvData) return;
      await logReportActivity({ action: "generate", reportType: "order_receipt", format: "csv", scope: reportScope, status: "success" });
      triggerDownload(new Blob([csvData], { type: "text/csv;charset=utf-8;" }), `${data.receipt.receiptNumber}.csv`);
      await logReportActivity({ action: "download", reportType: "order_receipt", format: "csv", scope: reportScope, status: "success" });
    } catch {
      await logReportActivity({ action: "generate", reportType: "order_receipt", format: "csv", scope: reportScope, status: "failed" });
    } finally {
      setExporting("none");
    }
  };

  const exportPdf = async () => {
    await logReportActivity({ action: "request", reportType: "order_receipt", format: "pdf", scope: reportScope, status: "success" });
    try {
      setExporting("pdf");
      const lines: string[] = [
        `Receipt Number: ${data.receipt.receiptNumber}`,
        `Order Number: ${data.order.orderNumber}`,
        `Generated At: ${new Date(data.receipt.updatedAt || data.receipt.createdAt).toISOString()}`,
        `Order Status: ${data.order.status}`,
        `Payment Status: ${data.order.paymentStatus}`,
        `Delivery Method: ${data.order.deliveryMethod}`,
        `Completed: ${data.completion?.isCompleted ? "Yes" : "No"}`,
        `BUS Stage: ${data.busDeliveryWorkflow?.stage || "N/A"}`,
        `Subtotal: ${Number(data.financial.subtotal || 0).toFixed(2)} ${data.financial.currency || "GHS"}`,
        `Delivery Fee: ${Number(data.financial.deliveryFee || 0).toFixed(2)}`,
        `Processing Fee: ${Number(data.financial.processingFee || 0).toFixed(2)}`,
        `Coupon Discount: ${Number(data.financial.couponDiscount || 0).toFixed(2)}`,
        `Total: ${Number(data.financial.total || 0).toFixed(2)}`,
        `Transaction Reference: ${data.transaction?.reference || "N/A"}`,
        `Status Flow: ${data.statusFlow || data.order.status}`,
        " ",
      ];
      data.items.forEach((item, idx) => {
        lines.push(`${idx + 1}. ${item.productName}`);
        lines.push(`Qty: ${item.quantity} | Unit: ${item.price.toFixed(2)} | Total: ${item.lineTotal.toFixed(2)}`);
      });
      const pdfBytes = createSimplePdf("Kiyumart - Order Receipt", lines);
      await logReportActivity({ action: "generate", reportType: "order_receipt", format: "pdf", scope: reportScope, status: "success" });
      triggerDownload(new Blob([pdfBytes], { type: "application/pdf" }), `${data.receipt.receiptNumber}.pdf`);
      await logReportActivity({ action: "download", reportType: "order_receipt", format: "pdf", scope: reportScope, status: "success" });
    } catch {
      await logReportActivity({ action: "generate", reportType: "order_receipt", format: "pdf", scope: reportScope, status: "failed" });
    } finally {
      setExporting("none");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate(`/orders/${id}`)} className="mb-4" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Order
          </Button>
          <h1 className="text-3xl font-bold">E-Receipt</h1>
        </div>

        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Receipt Number</p>
              <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
                <h2 className="text-xl font-bold" data-testid="text-receipt-number">{data.receipt.receiptNumber}</h2>
                <Badge variant="secondary" className="bg-primary/10 text-primary">{data.order.paymentStatus || "pending"}</Badge>
                <Badge variant="secondary" className="bg-muted text-foreground">{data.order.status}</Badge>
              </div>
              <div className="inline-block p-4 bg-white rounded-lg">
                <QRCode value={`RECEIPT:${data.receipt.receiptNumber}|ORDER:${data.order.id}`} size={200} level="H" data-testid="qr-code-receipt" />
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <h3 className="font-bold text-sm text-muted-foreground">Products</h3>
            <div className="space-y-3">
              {data.items.map((item, index) => (
                <div key={`${item.productId}-${index}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{item.productName}</h4>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{item.quantity} x {formatPrice(item.price)}</span>
                      </div>
                    </div>
                    <div className="text-right text-sm font-bold text-primary">{formatPrice(item.lineTotal)}</div>
                  </div>
                  {index < data.items.length - 1 && <Separator className="mt-3" />}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="font-medium">{formatPrice(data.financial.subtotal || 0)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Delivery Fee</span><span className="font-medium">{formatPrice(data.financial.deliveryFee || 0)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Processing Fee</span><span className="font-medium">{formatPrice(data.financial.processingFee || 0)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Coupon Discount</span><span className="font-medium">{formatPrice(data.financial.couponDiscount || 0)}</span></div>
            <Separator />
            <div className="flex justify-between text-base font-bold"><span>Total</span><span className="text-primary">{formatPrice(data.financial.total || 0)}</span></div>
          </Card>

          <Card className="p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Payment Provider</span><span className="font-medium">{data.transaction?.provider || "N/A"}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Transaction Ref</span><span className="font-mono text-xs">{data.transaction?.reference || "N/A"}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Delivery Method</span><span className="font-medium capitalize">{data.order.deliveryMethod}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">BUS Stage</span><span className="font-medium">{data.busDeliveryWorkflow?.stage || "N/A"}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Status Flow</span><span className="font-medium text-right">{data.statusFlow || data.order.status}</span></div>
          </Card>

          <Card>
            <button onClick={() => setShowExportOptions(!showExportOptions)} className="w-full flex items-center justify-between p-4 text-left" data-testid="button-export-options">
              <span className="font-medium">Export Options</span>
              <ChevronDown className={`h-5 w-5 transition-transform ${showExportOptions ? "rotate-180" : ""}`} />
            </button>
            {showExportOptions && (
              <div className="px-4 pb-4 space-y-2">
                <Button variant="outline" className="w-full" data-testid="button-export-pdf" onClick={() => void exportPdf()} disabled={exporting !== "none"}>
                  <Download className="h-4 w-4 mr-2" />
                  {exporting === "pdf" ? "Preparing PDF..." : "Export as PDF"}
                </Button>
                <Button variant="outline" className="w-full" data-testid="button-export-csv" onClick={() => void exportCsv()} disabled={exporting !== "none"}>
                  <Download className="h-4 w-4 mr-2" />
                  {exporting === "csv" ? "Preparing CSV..." : "Export as CSV"}
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => navigate(`/orders/${id}`)}>
                  View Order Details
                </Button>
              </div>
            )}
          </Card>

          <p className="text-xs text-muted-foreground text-center">
            Generated from live transaction and order status records.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
