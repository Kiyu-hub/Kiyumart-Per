import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { fetchSameOrigin, fetchSameOriginJson } from "@/lib/queryClient";
import { openPrintReportWindow, renderPrintReportError, renderPrintReportWindow } from "@/lib/reporting";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { 
  Bell, 
  Shield, 
  CreditCard, 
  User, 
  Mail,
  Moon,
  Sun
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import pdfLogoDark from "@assets/kiyumart_logo_dark.png";
import pdfLogoLight from "@assets/kiyumart_logo_light.png";

type ExportPayload = {
  exportedAt: string;
  account: Record<string, any>;
  store: Record<string, any> | null;
  cart: Array<Record<string, any>>;
  wishlist: Array<Record<string, any>>;
  notifications: Array<Record<string, any>>;
  orders: Array<Record<string, any>>;
  supportConversations: Array<Record<string, any>>;
};

export default function Settings() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isExporting, setIsExporting] = useState(false);
  const [isPreparingPdf, setIsPreparingPdf] = useState(false);
  
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [orderUpdates, setOrderUpdates] = useState(true);
  const [promotionalEmails, setPromotionalEmails] = useState(false);

  const handleSavePreferences = () => {
    toast({
      title: "Preferences saved",
      description: "Your notification preferences have been updated.",
    });
  };

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    document.documentElement.classList.toggle("dark");
  };

  const handleDownloadData = async () => {
    try {
      setIsExporting(true);
      const response = await fetchSameOrigin("/api/profile/export", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        let message = "Could not prepare your data export right now.";
        try {
          const payload = await response.json();
          message = payload?.error || message;
        } catch {
          // Ignore malformed error body.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const fileNameMatch = response.headers.get("content-disposition")?.match(/filename=\"?([^"]+)\"?/i);
      const fileName = fileNameMatch?.[1] || "kiyumart-data-export.json";
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      toast({
        title: "Data export ready",
        description: "Your account data has been downloaded.",
      });
    } catch (error: any) {
      toast({
        title: "Data export failed",
        description: error?.message || "Could not download your data right now.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return "Not available";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not available";
    return date.toLocaleString("en-GH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const escapeHtml = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const handleDownloadPdf = async () => {
    const reportWindow = openPrintReportWindow("KiyuMart Data Export", "Preparing your premium account report...");
    try {
      setIsPreparingPdf(true);
      const exportData = await fetchSameOriginJson<ExportPayload>("/api/profile/export", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      const account = exportData.account || {};
      const orders = Array.isArray(exportData.orders) ? exportData.orders : [];
      const wishlistItems = Array.isArray(exportData.wishlist) ? exportData.wishlist : [];
      const notifications = Array.isArray(exportData.notifications) ? exportData.notifications : [];
      const supportConversations = Array.isArray(exportData.supportConversations)
        ? exportData.supportConversations
        : [];
      const cartItems = Array.isArray(exportData.cart) ? exportData.cart : [];
      const prefersDarkPdf = false;
      const pdfLogoUrl = new URL(prefersDarkPdf ? pdfLogoLight : pdfLogoDark, window.location.origin).toString();

      const totalSpent = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
      const recentOrdersMarkup =
        orders.length > 0
          ? orders
              .slice(0, 8)
              .map((order) => {
                const items = Array.isArray(order.items) ? order.items : [];
                const itemSummary =
                  items.length > 0
                    ? items
                        .slice(0, 3)
                        .map((item: any) => `${escapeHtml(item.productName)} x${escapeHtml(item.quantity)}`)
                        .join(", ")
                    : "No item details available";
                return `
                  <tr>
                    <td>
                      <div class="table-primary">${escapeHtml(order.orderNumber || order.id)}</div>
                      <div class="table-secondary">${escapeHtml(formatDateTime(order.createdAt))}</div>
                    </td>
                    <td>${itemSummary}</td>
                    <td>${escapeHtml(order.status || "pending")}</td>
                    <td>${escapeHtml(order.paymentStatus || "pending")}</td>
                    <td class="table-amount">GHS ${escapeHtml(Number(order.totalAmount || 0).toFixed(2))}</td>
                  </tr>
                `;
              })
              .join("")
          : "";

      const wishlistMarkup =
        wishlistItems.length > 0
          ? wishlistItems
              .slice(0, 8)
              .map((item) => {
                const product = item.product || {};
                return `
                  <div class="compact-row">
                    <span>${escapeHtml(product.name || "Wishlist product")}</span>
                    <span>${escapeHtml(formatDateTime(item.createdAt))}</span>
                  </div>
                `;
              })
              .join("")
          : `<div class="empty-state">No wishlist items saved.</div>`;

      const notificationsMarkup =
        notifications.length > 0
          ? notifications
              .slice(0, 8)
              .map(
                (notification) => `
                  <div class="compact-row">
                    <span>${escapeHtml(notification.title || "Notification")}</span>
                    <span>${escapeHtml(formatDateTime(notification.createdAt))}</span>
                  </div>
                `,
              )
              .join("")
          : `<div class="empty-state">No notifications available.</div>`;

      const supportMarkup =
        supportConversations.length > 0
          ? supportConversations
              .slice(0, 6)
              .map(
                (conversation) => `
                  <div class="record-card">
                    <div class="record-head">
                      <div class="record-title">${escapeHtml(conversation.subject || "Support conversation")}</div>
                      <div class="record-meta">${escapeHtml(conversation.status || "open")}</div>
                    </div>
                      <div class="record-body">${escapeHtml(
                        Array.isArray(conversation.messages) && conversation.messages.length > 0
                          ? conversation.messages[conversation.messages.length - 1]?.message || "No message preview available"
                          : "No messages available",
                      )}</div>
                    </div>
                `,
              )
              .join("")
          : `<div class="empty-state">No support conversations available.</div>`;

      if (!reportWindow) {
        throw new Error("Please allow pop-ups so your PDF report can open.");
      }

      renderPrintReportWindow(reportWindow, "", `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title></title>
            <style>
              :root {
                --ink: #102a43;
                --muted: #5c6b7a;
                --border: #d9e2ec;
                --surface: #ffffff;
                --soft: #f7fafc;
                --accent: #0b8f74;
                --accent-soft: rgba(11, 143, 116, 0.1);
              }
              * { box-sizing: border-box; }
              body {
                margin: 0;
                font-family: "Segoe UI", Arial, sans-serif;
                color: var(--ink);
                background: #eef4f7;
              }
              .print-footer {
                display: none;
              }
              .page {
                max-width: 940px;
                margin: 0 auto;
                background: var(--surface);
                min-height: 100vh;
              }
              .hero {
                padding: 28px 40px 18px;
                background: #fff;
                border-bottom: 1px solid var(--border);
              }
              .hero-top {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 12px;
                text-align: center;
              }
              .logo-wrap {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 10px;
              }
              .logo-wrap img {
                height: 38px;
                width: auto;
                object-fit: contain;
              }
              .hero-meta {
                min-width: 0;
                text-align: center;
                color: var(--muted);
                font-size: 12px;
                line-height: 1.6;
              }
              h1 {
                margin: 0 0 6px;
                font-size: 30px;
                line-height: 1.1;
              }
              .hero-copy {
                max-width: 560px;
                color: var(--muted);
                font-size: 14px;
                line-height: 1.6;
              }
              .summary-strip {
                display: flex;
                flex-wrap: wrap;
                gap: 22px;
                margin-top: 18px;
                padding-top: 16px;
                border-top: 1px solid var(--border);
              }
              .summary-item {
                min-width: 120px;
              }
              .summary-label {
                color: var(--muted);
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.08em;
              }
              .summary-value {
                margin-top: 4px;
                font-size: 22px;
                font-weight: 700;
              }
              .content {
                padding: 22px 40px 40px;
              }
              .section {
                margin-top: 24px;
              }
              .section:first-child {
                margin-top: 0;
              }
              .section-title {
                margin: 0;
                font-size: 17px;
                font-weight: 700;
              }
              .section-heading {
                margin: 0 0 10px;
              }
              .spec-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 8px 22px;
              }
              .spec-item {
                padding: 10px 0;
                border-bottom: 1px solid var(--border);
              }
              .spec-label {
                color: var(--muted);
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                margin-bottom: 4px;
              }
              .spec-value {
                font-size: 14px;
                line-height: 1.5;
                word-break: break-word;
              }
              .record-card {
                padding: 12px 0;
                border-bottom: 1px solid var(--border);
                margin: 0;
              }
              .record-head {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 16px;
              }
              .record-title {
                font-size: 15px;
                font-weight: 700;
              }
              .record-meta {
                margin-top: 4px;
                color: var(--muted);
                font-size: 13px;
              }
              .record-amount {
                white-space: nowrap;
                color: var(--accent);
                font-weight: 700;
                font-size: 16px;
              }
              .record-body {
                margin-top: 10px;
                color: var(--muted);
                font-size: 14px;
                line-height: 1.6;
              }
              .report-table-wrap {
                background: var(--surface);
                border-top: 1px solid var(--border);
                border-bottom: 1px solid var(--border);
              }
              .report-table {
                width: 100%;
                border-collapse: collapse;
              }
              .report-table thead {
                background: transparent;
              }
              .report-table th,
              .report-table td {
                padding: 12px 12px;
                border-bottom: 1px solid var(--border);
                text-align: left;
                vertical-align: top;
                font-size: 13px;
              }
              .report-table th {
                color: var(--muted);
                font-size: 11px;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                font-weight: 700;
              }
              .report-table tbody tr:last-child td {
                border-bottom: none;
              }
              .table-primary {
                font-weight: 700;
                font-size: 14px;
              }
              .table-secondary {
                margin-top: 4px;
                color: var(--muted);
                font-size: 12px;
              }
              .table-amount {
                white-space: nowrap;
                color: var(--accent);
                font-weight: 700;
              }
              .compact-list {
                background: var(--surface);
                border-top: 1px solid var(--border);
                border-bottom: 1px solid var(--border);
              }
              .compact-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 18px;
                padding: 12px 0;
                border-bottom: 1px solid var(--border);
                font-size: 13px;
              }
              .compact-row:last-child {
                border-bottom: none;
              }
              .empty-state {
                padding: 16px 0;
                border: 1px dashed var(--border);
                color: var(--muted);
                font-size: 14px;
                text-align: center;
              }
              .footer-note {
                margin-top: 24px;
                padding-top: 14px;
                border-top: 1px solid var(--border);
                color: var(--muted);
                font-size: 12px;
                line-height: 1.6;
              }
              @page {
                margin: 16mm;
              }
              @media print {
                body {
                  background: #fff;
                }
                .page {
                  max-width: none;
                }
                .content {
                  padding-bottom: 70px;
                }
                .print-footer {
                  display: flex;
                  position: fixed;
                  left: 16mm;
                  right: 16mm;
                  bottom: 8mm;
                  align-items: center;
                  justify-content: space-between;
                  color: var(--muted);
                  font-size: 11px;
                  border-top: 1px solid var(--border);
                  padding-top: 6px;
                  background: #fff;
                }
                .print-footer img {
                  height: 18px;
                  width: auto;
                  object-fit: contain;
                }
              }
            </style>
          </head>
          <body>
            <div class="page">
              <section class="hero">
                <div class="hero-top">
                  <div class="logo-wrap">
                    <img src="${pdfLogoUrl}" alt="KiyuMart" />
                    <div>
                      <h1>Account Report</h1>
                      <div class="hero-copy">
                        A simple summary of your account activity, saved items, order history, and support records.
                      </div>
                    </div>
                  </div>
                  <div class="hero-meta">
                    <div>${escapeHtml(formatDateTime(exportData.exportedAt))}</div>
                    <div>${escapeHtml(account.email || "Not available")}</div>
                  </div>
                </div>
                <div class="summary-strip">
                  <div class="summary-item">
                    <div class="summary-label">Account Holder</div>
                    <div class="summary-value">${escapeHtml(account.name || "Customer")}</div>
                  </div>
                  <div class="summary-item">
                    <div class="summary-label">Orders</div>
                    <div class="summary-value">${escapeHtml(String(orders.length))}</div>
                  </div>
                  <div class="summary-item">
                    <div class="summary-label">Wishlist</div>
                    <div class="summary-value">${escapeHtml(String(wishlistItems.length))}</div>
                  </div>
                  <div class="summary-item">
                    <div class="summary-label">Total Spent</div>
                    <div class="summary-value">GHS ${escapeHtml(totalSpent.toFixed(2))}</div>
                  </div>
                </div>
              </section>
              <main class="content">
                <section class="section">
                  <div class="section-heading">
                    <h2 class="section-title">Account Overview</h2>
                  </div>
                  <div class="spec-grid">
                    <div class="spec-item">
                      <div class="spec-label">Email</div>
                      <div class="spec-value">${escapeHtml(account.email || "Not available")}</div>
                    </div>
                    <div class="spec-item">
                      <div class="spec-label">Phone</div>
                      <div class="spec-value">${escapeHtml(account.phone || "Not available")}</div>
                    </div>
                    <div class="spec-item">
                      <div class="spec-label">Role</div>
                      <div class="spec-value">${escapeHtml(account.role || "buyer")}</div>
                    </div>
                    <div class="spec-item">
                      <div class="spec-label">Exported At</div>
                      <div class="spec-value">${escapeHtml(formatDateTime(exportData.exportedAt))}</div>
                    </div>
                  </div>
                </section>

                <section class="section">
                  <div class="section-heading">
                    <h2 class="section-title">Recent Orders</h2>
                  </div>
                  ${
                    orders.length > 0
                      ? `
                        <div class="report-table-wrap">
                          <table class="report-table">
                            <thead>
                              <tr>
                                <th>Order</th>
                                <th>Items</th>
                                <th>Status</th>
                                <th>Payment</th>
                                <th>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${recentOrdersMarkup}
                            </tbody>
                          </table>
                        </div>
                      `
                      : `<div class="empty-state">No orders available in this export.</div>`
                  }
                </section>

                <section class="section">
                  <div class="section-heading">
                    <h2 class="section-title">Wishlist</h2>
                  </div>
                  <div class="compact-list">${wishlistMarkup}</div>
                </section>

                <section class="section">
                  <div class="section-heading">
                    <h2 class="section-title">Cart Snapshot</h2>
                  </div>
                  <div class="compact-list">
                    ${
                      cartItems.length > 0
                        ? cartItems
                            .slice(0, 8)
                            .map(
                              (item) => `
                                <div class="compact-row">
                                  <span>${escapeHtml(item.product?.name || "Cart item")} x${escapeHtml(item.quantity)}</span>
                                  <span>${escapeHtml(item.selectedColor || item.color || "")} ${escapeHtml(
                                    item.selectedSize || item.size || "",
                                  )}</span>
                                </div>
                              `,
                            )
                            .join("")
                        : `<div class="empty-state">No items are currently in cart.</div>`
                    }
                  </div>
                </section>

                <section class="section">
                  <div class="section-heading">
                    <h2 class="section-title">Notifications</h2>
                  </div>
                  <div class="compact-list">${notificationsMarkup}</div>
                </section>

                <section class="section">
                  <div class="section-heading">
                    <h2 class="section-title">Support Conversations</h2>
                  </div>
                  ${supportMarkup}
                </section>

                <div class="footer-note">
                  This document was generated from your current KiyuMart account data for personal record-keeping.
                  For raw structured data, use the JSON export option in your settings page.
                </div>
              </main>
              <div class="print-footer">
                <img src="${pdfLogoUrl}" alt="KiyuMart" />
                <span>${escapeHtml(formatDateTime(exportData.exportedAt))}</span>
              </div>
            </div>
          </body>
        </html>
      `);

      toast({
        title: "PDF report ready",
        description: "Your premium account report has been opened for PDF download.",
      });
    } catch (error: any) {
      if (reportWindow) {
        renderPrintReportError(
          reportWindow,
          "KiyuMart Data Export",
          error?.message || "Could not prepare your PDF report right now.",
        );
      }
      toast({
        title: "PDF export failed",
        description: error?.message || "Could not prepare your PDF report right now.",
        variant: "destructive",
      });
    } finally {
      setIsPreparingPdf(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
              Settings
            </h1>
            <p className="text-muted-foreground">
              Manage your account settings and preferences
            </p>
          </div>

          <div className="space-y-6">
            <Card data-testid="card-notifications">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notifications
                </CardTitle>
                <CardDescription>
                  Manage how you receive notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="email-notifications" className="text-base">
                      Email Notifications
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Receive order updates via email
                    </p>
                  </div>
                  <Switch
                    id="email-notifications"
                    checked={emailNotifications}
                    onCheckedChange={setEmailNotifications}
                    data-testid="switch-email-notifications"
                  />
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="push-notifications" className="text-base">
                      Push Notifications
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Receive push notifications on your device
                    </p>
                  </div>
                  <Switch
                    id="push-notifications"
                    checked={pushNotifications}
                    onCheckedChange={setPushNotifications}
                    data-testid="switch-push-notifications"
                  />
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="order-updates" className="text-base">
                      Order Updates
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Get notified about order status changes
                    </p>
                  </div>
                  <Switch
                    id="order-updates"
                    checked={orderUpdates}
                    onCheckedChange={setOrderUpdates}
                    data-testid="switch-order-updates"
                  />
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="promotional-emails" className="text-base">
                      Promotional Emails
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Receive emails about sales and special offers
                    </p>
                  </div>
                  <Switch
                    id="promotional-emails"
                    checked={promotionalEmails}
                    onCheckedChange={setPromotionalEmails}
                    data-testid="switch-promotional-emails"
                  />
                </div>
                
                <Button 
                  onClick={handleSavePreferences}
                  className="w-full mt-4"
                  data-testid="button-save-preferences"
                >
                  Save Notification Preferences
                </Button>
              </CardContent>
            </Card>

            <Card data-testid="card-appearance">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {theme === "light" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  Appearance
                </CardTitle>
                <CardDescription>
                  Customize how KiyuMart looks
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="dark-mode" className="text-base">
                      Dark Mode
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Switch between light and dark theme
                    </p>
                  </div>
                  <Switch
                    id="dark-mode"
                    checked={theme === "dark"}
                    onCheckedChange={toggleTheme}
                    data-testid="switch-dark-mode"
                  />
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-account">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Account Security
                </CardTitle>
                <CardDescription>
                  Manage your account security settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Change Password</Label>
                    <p className="text-sm text-muted-foreground">
                      Update your password regularly
                    </p>
                  </div>
                  <Button 
                    variant="outline"
                    onClick={() => navigate("/change-password")}
                    data-testid="button-change-password"
                  >
                    Change
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-privacy">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Privacy
                </CardTitle>
                <CardDescription>
                  Control your data and privacy
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={handleDownloadPdf}
                  disabled={isPreparingPdf}
                  data-testid="button-download-data-pdf"
                >
                  {isPreparingPdf ? "Preparing PDF..." : "Download PDF Report"}
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={handleDownloadData}
                  disabled={isExporting}
                  data-testid="button-download-data"
                >
                  {isExporting ? "Preparing Export..." : "Download My Data"}
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
                      toast({
                        title: "Account Deletion",
                        description: "Please contact support to permanently delete your account.",
                        variant: "destructive",
                      });
                    }
                  }}
                  data-testid="button-delete-account"
                >
                  Delete Account
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
