import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight, ShoppingBag } from "lucide-react";
import { useHaptic } from "@/hooks/useHaptic";
import { SubpageShell, SubpageTabs, subpageColors, useSubpageDark, SUB_TEAL } from "@/components/mobile/MobileSubpage";

/*
 * Phone "My orders" (approved 28 Nov 2026). Plain list, All / Active / Completed /
 * Cancelled. Delivered orders count as Completed. Status colours: in progress amber,
 * completed green, cancelled red, pending grey.
 */

interface OrderItem {
  productId: string; productName: string; quantity: number; price: string;
  image?: string | null; selectedColor?: string | null; selectedSize?: string | null;
}
interface Order {
  id: string; orderNumber?: string; status: string; paymentStatus: string;
  totalAmount: string; createdAt: string; items: OrderItem[];
  externalDeliveryType?: string | null;
  seller?: { storeName?: string | null } | null;
}
type FilterTab = "all" | "active" | "completed" | "cancelled";

interface MobileOrdersProps {
  orders: Order[];
  isLoading: boolean;
  onDeleteOrder: (id: string) => void;
}

const DONE = ["delivered", "completed"];
const isCompleted = (s: string) => DONE.includes(String(s || "").toLowerCase());
const isCancelled = (s: string) => String(s || "").toLowerCase() === "cancelled";
const isPending = (s: string) => ["pending", "created"].includes(String(s || "").toLowerCase());
const isActive = (s: string) => !isCompleted(s) && !isCancelled(s);

export function orderStatusLabel(status: string, extType?: string | null): string {
  const s = String(status || "").toLowerCase();
  const labels: Record<string, string> = {
    pending: "Pending", created: "Pending", processing: "Processing", packaged: "Packaged",
    ready: "Ready", searching_rider: "Finding rider", assigned: "Rider assigned",
    rider_arrived: "Rider arrived", picked_up: "Picked up", in_transit: "On the way",
    en_route: "On the way", delivered: "Completed", completed: "Completed", cancelled: "Cancelled",
    external_dispatch_arranged: extType === "VIP Bus" ? "Bus delivery arranged" : "Delivery arranged",
  };
  return labels[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "Pending");
}

/** Distinct colours that also differ in lightness (readable on white and dark). */
export function orderStatusColor(status: string, isDark: boolean): string {
  if (isCompleted(status)) return isDark ? "#81C995" : "#1E7E34";
  if (isCancelled(status)) return isDark ? "#F28B82" : "#B3261E";
  if (isPending(status)) return isDark ? "rgba(235,235,245,0.6)" : "#6B6B6B";
  return isDark ? "#FDD663" : "#A35A00";
}

const money = (n: number) => "GH₵" + (Number.isFinite(n) ? n : 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const shortDate = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GH", { day: "numeric", month: "short" });
};

export function MobileOrders({ orders, isLoading, onDeleteOrder }: MobileOrdersProps) {
  const isDark = useSubpageDark();
  const c = subpageColors(isDark);
  const [, navigate] = useLocation();
  const { trigger: haptic } = useHaptic();
  const [tab, setTab] = useState<FilterTab>("all");

  const list = (orders || []).filter((o) =>
    tab === "all" ? true : tab === "active" ? isActive(o.status) : tab === "completed" ? isCompleted(o.status) : isCancelled(o.status),
  );

  return (
    <SubpageShell title="My orders" isDark={isDark} testId="mobile-orders">
      <SubpageTabs
        isDark={isDark}
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "all", label: "All" },
          { key: "active", label: "Active" },
          { key: "completed", label: "Completed" },
          { key: "cancelled", label: "Cancelled" },
        ]}
      />

      {isLoading ? (
        <div style={{ padding: "0 24px" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: `1px solid ${c.line}` }}>
              <div style={{ width: 56, height: 70, borderRadius: 10, background: c.line }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, paddingTop: 6 }}>
                <div style={{ height: 12, width: "60%", borderRadius: 4, background: c.line }} />
                <div style={{ height: 10, width: "40%", borderRadius: 4, background: c.line }} />
              </div>
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 32px" }}>
          <ShoppingBag size={40} strokeWidth={1.5} color={c.faint} aria-hidden="true" />
          <div style={{ marginTop: 12, fontSize: 17, fontWeight: 700 }}>{tab === "all" ? "No orders yet" : "Nothing here"}</div>
          <div style={{ marginTop: 6, fontSize: 14, color: c.soft }}>Your orders will appear here once you shop.</div>
          {tab === "all" && (
            <button onClick={() => navigate("/")} style={{ marginTop: 20, height: 48, padding: "0 28px", border: 0, borderRadius: 24, background: SUB_TEAL, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Start shopping</button>
          )}
        </div>
      ) : (
        <div style={{ padding: "0 24px" }}>
          {list.map((o, i) => {
            const first = o.items?.[0];
            const more = (o.items?.length || 0) - 1;
            const shop = o.seller?.storeName || "";
            const detail = [shortDate(o.createdAt), shop || (first ? first.productName + (more > 0 ? ` +${more}` : "") : "")].filter(Boolean).join(" · ");
            const row = (
              <button
                onClick={() => { haptic("light"); navigate(`/orders/${o.id}`); }}
                style={{ width: "100%", display: "flex", gap: 14, alignItems: "center", padding: "14px 0", border: 0, borderBottom: i === list.length - 1 ? "none" : `1px solid ${c.line}`, background: c.bg, textAlign: "left", cursor: "pointer", color: c.ink, fontFamily: "inherit" }}
              >
                {first?.image ? (
                  <img src={first.image} alt="" style={{ width: 56, height: 70, borderRadius: 10, objectFit: "cover", flexShrink: 0, background: c.line }} />
                ) : (
                  <span style={{ width: 56, height: 70, borderRadius: 10, background: c.line, flexShrink: 0, display: "grid", placeItems: "center" }}><ShoppingBag size={22} color={c.faint} aria-hidden="true" /></span>
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>#{o.orderNumber || String(o.id).slice(0, 8).toUpperCase()}</span>
                  <span style={{ display: "block", fontSize: 13, color: c.soft, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{detail}</span>
                  <span data-testid="order-status" style={{ display: "block", fontSize: 13, fontWeight: 700, color: orderStatusColor(o.status, isDark), marginTop: 4 }}>{orderStatusLabel(o.status, o.externalDeliveryType)}</span>
                </span>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{money(parseFloat(o.totalAmount))}</span>
                  <ChevronRight size={18} strokeWidth={2} color={c.chev} aria-hidden="true" />
                </span>
              </button>
            );
            return <div key={o.id}>{row}</div>;
          })}
        </div>
      )}
    </SubpageShell>
  );
}
