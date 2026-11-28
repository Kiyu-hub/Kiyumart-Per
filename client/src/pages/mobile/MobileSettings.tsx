import { Bell, Truck, Tag, Moon, FileText, Download, ChevronRight, type LucideIcon } from "lucide-react";
import { SubpageShell, SubpageLabel, SubpagePrimary, SubpageSwitch, subpageColors, useSubpageDark } from "@/components/mobile/MobileSubpage";

/** Phone "Settings" (approved 28 Nov 2026). Uses the desktop page's own state and actions. */
export interface MobileSettingsProps {
  emailNotifications: boolean; setEmailNotifications: (v: boolean) => void;
  pushNotifications: boolean; setPushNotifications: (v: boolean) => void;
  orderUpdates: boolean; setOrderUpdates: (v: boolean) => void;
  promotionalEmails: boolean; setPromotionalEmails: (v: boolean) => void;
  isDarkTheme: boolean; toggleTheme: () => void;
  onSave: () => void;
  onAccountReport: () => void; isPreparingPdf: boolean;
  onDownloadData: () => void; isExporting: boolean;
}

export function MobileSettings(p: MobileSettingsProps) {
  const isDark = useSubpageDark();
  const c = subpageColors(isDark);

  const SwitchRow = ({ icon: I, title, sub, on, set, last }: { icon: LucideIcon; title: string; sub: string; on: boolean; set: (v: boolean) => void; last?: boolean }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 16, minHeight: 64 }}>
      <I size={22} strokeWidth={1.75} color={c.ink} aria-hidden="true" />
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, minHeight: 64, borderBottom: last ? "none" : `1px solid ${c.line}` }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16 }}>{title}</div>
          <div style={{ fontSize: 13, color: c.soft, marginTop: 2 }}>{sub}</div>
        </div>
        <SubpageSwitch checked={on} onChange={set} label={title} />
      </div>
    </div>
  );

  const LinkRow = ({ icon: I, title, sub, onClick, busy, last }: { icon: LucideIcon; title: string; sub?: string; onClick: () => void; busy?: boolean; last?: boolean }) => (
    <button onClick={onClick} disabled={busy} style={{ width: "100%", display: "flex", alignItems: "center", gap: 16, minHeight: 56, padding: 0, border: 0, background: "transparent", textAlign: "left", cursor: "pointer", color: c.ink, fontFamily: "inherit" }}>
      <I size={22} strokeWidth={1.75} color={c.ink} aria-hidden="true" />
      <span style={{ flex: 1, minHeight: 56, display: "flex", alignItems: "center", gap: 8, borderBottom: last ? "none" : `1px solid ${c.line}` }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontSize: 16 }}>{busy ? "Preparing…" : title}</span>
          {sub && <span style={{ display: "block", fontSize: 13, color: c.soft, marginTop: 2 }}>{sub}</span>}
        </span>
        <ChevronRight size={18} strokeWidth={2} color={c.chev} aria-hidden="true" />
      </span>
    </button>
  );

  return (
    <SubpageShell title="Settings" isDark={isDark} testId="mobile-settings">
      <SubpageLabel isDark={isDark}>Notifications</SubpageLabel>
      <div style={{ padding: "0 24px" }}>
        <SwitchRow icon={Bell} title="Email notifications" sub="Receive order updates via email" on={p.emailNotifications} set={p.setEmailNotifications} />
        <SwitchRow icon={Bell} title="Push notifications" sub="Receive push notifications on your device" on={p.pushNotifications} set={p.setPushNotifications} />
        <SwitchRow icon={Truck} title="Order updates" sub="Get notified about order status changes" on={p.orderUpdates} set={p.setOrderUpdates} />
        <SwitchRow icon={Tag} title="Promotional emails" sub="Receive emails about sales and special offers" on={p.promotionalEmails} set={p.setPromotionalEmails} last />
      </div>
      <SubpageLabel isDark={isDark}>Appearance</SubpageLabel>
      <div style={{ padding: "0 24px" }}>
        <SwitchRow icon={Moon} title="Dark mode" sub="Use a dark background" on={p.isDarkTheme} set={() => p.toggleTheme()} last />
      </div>
      <SubpageLabel isDark={isDark}>Your account</SubpageLabel>
      <div style={{ padding: "0 24px" }}>
        <LinkRow icon={FileText} title="Account report" sub="Download a PDF of your orders and activity" onClick={p.onAccountReport} busy={p.isPreparingPdf} />
        <LinkRow icon={Download} title="Download my data" onClick={p.onDownloadData} busy={p.isExporting} last />
      </div>
      <SubpagePrimary onClick={p.onSave} top={28}>Save preferences</SubpagePrimary>
    </SubpageShell>
  );
}
