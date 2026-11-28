import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MessageSquare } from "lucide-react";
import { SubpageShell, SubpageLabel, SubpagePrimary, subFieldStyle, subLabelStyle, subpageColors, useSubpageDark, SUB_TEAL } from "@/components/mobile/MobileSubpage";

/*
 * Phone "Support" (approved 28 Nov 2026): tickets list + New ticket form.
 * Uses CustomerSupport's own data and create action; opening a ticket shows the
 * existing conversation screen. Photos can be sent inside the conversation.
 */
interface Conversation { id: string; subject: string; lastMessage?: string | null; status: string; updatedAt?: string; createdAt?: string; unreadCount?: number }

interface Props {
  conversations: Conversation[];
  isLoading: boolean;
  hasOpenTicket: boolean;
  isCreating: boolean;
  onOpen: (id: string) => void;
  onCreate: (subject: string, message: string) => void;
}

const isClosed = (s: string) => ["resolved", "closed"].includes(String(s || "").toLowerCase());
const when = (v?: string) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return d.toLocaleTimeString("en-GH", { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-GH", { day: "numeric", month: "short" });
};

export function MobileSupport({ conversations, isLoading, hasOpenTicket, isCreating, onOpen, onCreate }: Props) {
  const isDark = useSubpageDark();
  const c = subpageColors(isDark);
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [orderId, setOrderId] = useState("");

  const { data: orders = [] } = useQuery<any[]>({
    queryKey: ["/api/orders", "buyer-orders"],
    enabled: composing,
    queryFn: async () => {
      const r = await fetch("/api/orders?context=buyer", { credentials: "include" });
      return r.ok ? r.json() : [];
    },
  });

  if (composing) {
    const chosen = (orders as any[]).find((o) => String(o.id) === orderId);
    const submit = () => {
      if (!subject.trim() || !message.trim()) return;
      const orderLine = chosen ? `\n\nOrder: #${chosen.orderNumber || String(chosen.id).slice(0, 8).toUpperCase()}` : "";
      onCreate(subject.trim(), message.trim() + orderLine);
    };
    return (
      <SubpageShell title="New ticket" isDark={isDark} onBack={() => setComposing(false)} testId="mobile-support-new">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "16px 24px 0" }}>
          <label style={subLabelStyle(isDark)}>Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What do you need help with?" style={subFieldStyle(isDark)} />
          </label>
          <label style={subLabelStyle(isDark)}>Order (optional)
            <select value={orderId} onChange={(e) => setOrderId(e.target.value)} style={{ ...subFieldStyle(isDark), appearance: "auto" as any }}>
              <option value="">Choose an order</option>
              {(orders as any[]).slice(0, 30).map((o) => (
                <option key={o.id} value={o.id}>#{o.orderNumber || String(o.id).slice(0, 8).toUpperCase()}</option>
              ))}
            </select>
          </label>
          <label style={subLabelStyle(isDark)}>Message
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us what happened…" style={{ height: 160, boxSizing: "border-box", border: `1px solid ${c.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 16, resize: "none", color: c.ink, background: c.field, fontFamily: "inherit", outline: "none" }} />
            <span style={{ fontSize: 12, color: c.faint, fontWeight: 400 }}>You can send photos in the chat once your ticket is open.</span>
          </label>
        </div>
        <SubpagePrimary onClick={submit} disabled={!subject.trim() || !message.trim() || isCreating} top={24}>{isCreating ? "Sending…" : "Send"}</SubpagePrimary>
      </SubpageShell>
    );
  }

  return (
    <SubpageShell title="Support" isDark={isDark} testId="mobile-support">
      <div style={{ padding: "12px 24px 0" }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>How can we help?</div>
        <div style={{ fontSize: 14, color: c.soft, marginTop: 4 }}>Our support team will reply as soon as they can.</div>
      </div>
      <SubpagePrimary onClick={() => setComposing(true)} disabled={hasOpenTicket} top={18}>New ticket</SubpagePrimary>
      {hasOpenTicket && <p style={{ margin: "8px 24px 0", fontSize: 13, color: c.soft, textAlign: "center" }}>You already have an open ticket. Reply there and we'll help.</p>}
      <SubpageLabel isDark={isDark}>My tickets</SubpageLabel>
      <div style={{ padding: "0 24px" }}>
        {isLoading ? (
          <p style={{ color: c.soft, fontSize: 14, padding: "16px 0" }}>Loading…</p>
        ) : conversations.length === 0 ? (
          <p style={{ color: c.soft, fontSize: 14, padding: "16px 0" }}>No tickets yet.</p>
        ) : (
          conversations.map((t, i) => {
            const closed = isClosed(t.status);
            return (
              <button key={t.id} data-testid="support-ticket" onClick={() => onOpen(t.id)} style={{ width: "100%", display: "flex", gap: 14, alignItems: "center", padding: "14px 0", border: 0, borderBottom: i === conversations.length - 1 ? "none" : `1px solid ${c.line}`, background: "transparent", textAlign: "left", cursor: "pointer", color: c.ink, fontFamily: "inherit" }}>
                <MessageSquare size={22} strokeWidth={1.75} color={c.ink} aria-hidden="true" style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: t.unreadCount ? 700 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.subject || "Support request"}</span>
                    <span style={{ fontSize: 12, color: c.faint, flexShrink: 0 }}>{when(t.updatedAt || t.createdAt)}</span>
                  </span>
                  {t.lastMessage && <span style={{ display: "block", fontSize: 14, color: c.soft, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.lastMessage.startsWith("__SUPPORT_ATTACHMENT__:") ? "Photo" : t.lastMessage}</span>}
                  <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: closed ? c.soft : (isDark ? "#4DB6AC" : SUB_TEAL), marginTop: 4 }}>{closed ? "Closed" : "Open"}</span>
                </span>
                <ChevronRight size={18} strokeWidth={2} color={c.chev} aria-hidden="true" />
              </button>
            );
          })
        )}
      </div>
    </SubpageShell>
  );
}
