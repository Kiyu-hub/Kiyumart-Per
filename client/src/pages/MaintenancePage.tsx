import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import logoLight from "@assets/kiyumart_logo_light.png";
import bgImage   from "@assets/compuuter.jpg";
import guyLeft   from "@assets/computer_guy-removebg-preview.png";
import guyRight  from "@assets/computer guy on thr right.webp";

/* ─────────────────────────────────────────────────────────────────── */
type MaintenanceStatus = {
  isMaintenanceMode: boolean;
  isAutoMaintenance: boolean;
  autoMaintenanceReason: "restart" | "file_change" | null;
  autoSecondsLeft: number;
  maintenanceMessage: string | null;
  maintenanceScheduledEnd: string | null;
};

/* ─── Snow flakes ────────────────────────────────────────────────── */
const SNOW = Array.from({ length: 50 }, (_, i) => ({
  id:  i,
  l:   `${(i * 2.1 + Math.sin(i) * 9 + 50) % 100}%`,
  sz:  1.5 + (i % 4) * 1.1,
  del: `${(i * 0.28) % 10}s`,
  dur: `${8 + (i % 6) * 1.4}s`,
  op:  0.35 + (i % 5) * 0.1,
  dr:  `${(i % 2 ? 1 : -1) * (5 + (i % 6) * 3.5)}px`,
}));

/* ─── Shooting stars ─────────────────────────────────────────────── */
const STARS = [
  { id: 0, top: "8%",  left: "75%", w: 130, del: "0s",   dur: "2.8s" },
  { id: 1, top: "18%", left: "55%", w: 100, del: "3.2s",  dur: "2.5s" },
  { id: 2, top: "5%",  left: "88%", w: 160, del: "5.8s",  dur: "3s"   },
  { id: 3, top: "28%", left: "70%", w: 90,  del: "8.1s",  dur: "2.4s" },
  { id: 4, top: "12%", left: "40%", w: 120, del: "11s",   dur: "2.7s" },
  { id: 5, top: "3%",  left: "30%", w: 80,  del: "14s",   dur: "2.3s" },
  { id: 6, top: "22%", left: "85%", w: 110, del: "17s",   dur: "2.6s" },
  { id: 7, top: "7%",  left: "20%", w: 140, del: "20s",   dur: "3.1s" },
];

/* ─── Styles ─────────────────────────────────────────────────────── */
const STYLES = `
  /* Snow */
  @keyframes snow-fall {
    0%   { transform: translateY(-20px) translateX(0);          opacity: 0; }
    8%   { opacity: var(--fo); }
    92%  { opacity: var(--fo); }
    100% { transform: translateY(105vh) translateX(var(--fd));  opacity: 0; }
  }

  /* Shooting star */
  @keyframes shoot {
    0%   { transform: translateX(0) translateY(0) rotate(215deg); opacity: 0; width: 0px; }
    5%   { opacity: 1; }
    60%  { opacity: 0.8; }
    100% { transform: translateX(-800px) translateY(800px) rotate(215deg); opacity: 0; width: var(--sw); }
  }

  /* Twinkling stars (static dots) */
  @keyframes twinkle {
    0%,100% { opacity: 0.2; }
    50%     { opacity: 0.9; }
  }

  /* Page elements */
  @keyframes fade-up {
    from { opacity: 0; transform: translateY(22px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  @keyframes float-l {
    0%,100% { transform: translateY(0px)   rotate(-1.2deg); }
    50%     { transform: translateY(-14px) rotate(0.5deg); }
  }
  @keyframes float-r {
    0%,100% { transform: translateY(0px)   rotate(1deg);  }
    50%     { transform: translateY(-12px) rotate(-0.6deg); }
  }
  @keyframes bar-slide {
    0%   { left: -50%; width: 40%; }
    60%  { left: 110%; width: 40%; }
    100% { left: 110%; width: 40%; }
  }
  @keyframes bar-slide2 {
    0%   { left: -75%; width: 65%; }
    60%  { left: 110%; width: 65%; }
    100% { left: 110%; width: 65%; }
  }
  @keyframes dot-beat {
    0%,80%,100% { transform: scale(0.45); opacity: 0.2; }
    40%         { transform: scale(1);    opacity: 1;   }
  }

  /* Utility classes */
  .mnt-f1  { animation: fade-up 0.75s ease-out 0.05s both; }
  .mnt-f2  { animation: fade-up 0.75s ease-out 0.18s both; }
  .mnt-f3  { animation: fade-up 0.75s ease-out 0.32s both; }
  .mnt-f4  { animation: fade-up 0.75s ease-out 0.46s both; }
  .mnt-f5  { animation: fade-up 0.75s ease-out 0.60s both; }
  .mnt-f6  { animation: fade-up 0.75s ease-out 0.74s both; }

  .mnt-fl  { animation: float-l 5.5s ease-in-out infinite; }
  .mnt-fr  { animation: float-r 6s   ease-in-out infinite 0.5s; }

  .mnt-d1  { animation: dot-beat 1.5s ease-in-out 0.0s  infinite; }
  .mnt-d2  { animation: dot-beat 1.5s ease-in-out 0.24s infinite; }
  .mnt-d3  { animation: dot-beat 1.5s ease-in-out 0.48s infinite; }

  .mnt-bar {
    position: relative; overflow: hidden;
    height: 3px; border-radius: 9999px;
    background: rgba(255,255,255,0.1);
  }
  .mnt-bar::before {
    content:''; position:absolute; top:0; height:100%; border-radius:9999px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.95), transparent);
    animation: bar-slide 2.4s ease-in-out infinite;
  }
  .mnt-bar::after {
    content:''; position:absolute; top:0; height:100%; border-radius:9999px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
    animation: bar-slide2 2.4s ease-in-out 0.6s infinite;
  }

  .mnt-snow {
    position: absolute; top: -10px;
    border-radius: 50%;
    background: rgba(255,255,255,0.85);
    pointer-events: none;
    animation: snow-fall linear infinite;
  }

  .mnt-star {
    position: absolute;
    height: 2px;
    border-radius: 999px;
    background: linear-gradient(to left, rgba(255,255,255,0), white 40%, rgba(255,255,255,0.6));
    box-shadow: 0 0 6px 1px rgba(255,255,255,0.4);
    pointer-events: none;
    animation: shoot ease-out infinite;
    opacity: 0;
  }

  .mnt-twinkle {
    position: absolute;
    border-radius: 50%;
    background: white;
    animation: twinkle ease-in-out infinite;
  }
`;

/* ─── Countdown ──────────────────────────────────────────────────── */
function Countdown({ end }: { end: string }) {
  const [p, setP] = useState({ h: 0, m: 0, s: 0, done: false });
  useEffect(() => {
    const tick = () => {
      const d = new Date(end).getTime() - Date.now();
      if (d <= 0) { setP({ h: 0, m: 0, s: 0, done: true }); return; }
      setP({ h: Math.floor(d / 3_600_000), m: Math.floor((d % 3_600_000) / 60_000), s: Math.floor((d % 60_000) / 1_000), done: false });
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [end]);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (p.done) return <span className="text-white/90 font-semibold">any moment now</span>;
  return (
    <div className="flex items-end justify-center gap-1.5">
      {p.h > 0 && (<><Slot n={pad(p.h)} label="hrs" /><Sep /></>)}
      <Slot n={pad(p.m)} label="min" /><Sep /><Slot n={pad(p.s)} label="sec" />
    </div>
  );
}
function Slot({ n, label }: { n: string; label: string }) {
  return (
    <div className="text-center min-w-[50px] rounded-xl px-2 py-2"
      style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)" }}>
      <div className="text-2xl font-bold tabular-nums text-white">{n}</div>
      <div className="text-[9px] text-white/55 uppercase tracking-widest mt-0.5">{label}</div>
    </div>
  );
}
function Sep() { return <div className="text-xl font-bold text-white/25 pb-3">:</div>; }

/* ─── Main ───────────────────────────────────────────────────────── */
export default function MaintenancePage() {
  const { data: status } = useQuery<MaintenanceStatus>({
    queryKey: ["/api/maintenance/status"],
    queryFn: async () => {
      const res = await fetch("/api/maintenance/status", { cache: "no-store" });
      if (!res.ok) return { isMaintenanceMode: true, isAutoMaintenance: false, autoMaintenanceReason: null, autoSecondsLeft: 0, maintenanceMessage: null, maintenanceScheduledEnd: null };
      return res.json();
    },
    refetchInterval: 15_000,
    staleTime: 0,
  });

  useEffect(() => {
    if (status && !status.isMaintenanceMode) {
      // Platform back online — invalidate all queries instead of reloading the page
      import("@/lib/queryClient").then(({ queryClient }) => queryClient.invalidateQueries());
    }
  }, [status]);

  const message =
    status?.maintenanceMessage ||
    (status?.autoMaintenanceReason === "restart"
      ? "A new version of KiyuMart is being deployed. We'll be back in just a moment."
      : status?.autoMaintenanceReason === "file_change"
      ? "A platform update was detected. We'll be back online momentarily."
      : "We're making improvements to give you an even better experience.");

  const subtitle =
    status?.autoMaintenanceReason === "restart"      ? "New Deployment In Progress" :
    status?.autoMaintenanceReason === "file_change"  ? "Platform Update Detected"   :
    "Scheduled Maintenance";

  const scheduledEnd = status?.maintenanceScheduledEnd ?? null;

  return (
    <div className="relative min-h-screen w-full overflow-hidden" style={{ background: "#050814" }}>
      <style>{STYLES}</style>

      {/* ══ Background image ══ */}
      <img
        src={bgImage} alt="" aria-hidden
        className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
        style={{ zIndex: 0 }}
      />

      {/* ══ Dark vignette overlay ══ */}
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
        zIndex: 1,
        background: [
          "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(5,10,30,0.15) 0%, rgba(5,10,30,0.65) 100%)",
          "linear-gradient(to top, rgba(3,6,18,0.95) 0%, rgba(3,6,18,0.3) 35%, rgba(3,6,18,0.1) 70%)",
          "linear-gradient(to bottom, rgba(3,6,18,0.4) 0%, transparent 25%)",
        ].join(", "),
      }} />

      {/* ══ Twinkling star dots ══ */}
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
        {Array.from({ length: 60 }, (_, i) => (
          <div key={i} className="mnt-twinkle" style={{
            top:    `${(i * 1.63 + Math.sin(i * 0.7) * 5 + 30) % 70}%`,
            left:   `${(i * 1.71 + Math.cos(i * 0.9) * 8 + 10) % 95}%`,
            width:  `${1 + (i % 3) * 0.8}px`,
            height: `${1 + (i % 3) * 0.8}px`,
            animationDuration: `${2.5 + (i % 7) * 0.6}s`,
            animationDelay:    `${(i * 0.4) % 5}s`,
            opacity: 0.2 + (i % 5) * 0.1,
          }} />
        ))}
      </div>

      {/* ══ Shooting stars ══ */}
      <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 3 }}>
        {STARS.map(s => (
          <div key={s.id} className="mnt-star" style={{
            top:             s.top,
            left:            s.left,
            width:           s.w,
            animationDuration: s.dur,
            animationDelay:    s.del,
            ["--sw" as any]: `${s.w}px`,
          }} />
        ))}
      </div>

      {/* ══ Snow ══ */}
      <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 4 }}>
        {SNOW.map(f => (
          <div key={f.id} className="mnt-snow" style={{
            left:            f.l,
            width:           f.sz,
            height:          f.sz,
            animationDuration: f.dur,
            animationDelay:    f.del,
            ["--fo" as any]: f.op,
            ["--fd" as any]: f.dr,
            opacity:         f.op,
          }} />
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          LAYOUT — 3-column grid: characters fill the sides, card centers
      ════════════════════════════════════════════════════════════════════ */}
      <div
        className="relative min-h-screen"
        style={{
          zIndex: 10,
          display: "grid",
          gridTemplateColumns: "1fr minmax(0, 440px) 1fr",
          gridTemplateRows: "1fr",
        }}
      >

        {/* ── LEFT CHARACTER ── */}
        <div
          className="hidden lg:flex items-center justify-end"
          style={{ overflow: "visible", paddingBottom: "8vh" }}
        >
          <img
            src={guyLeft}
            alt="" aria-hidden
            className="mnt-fl select-none pointer-events-none object-contain"
            style={{
              width: "clamp(280px, 28vw, 460px)",
              maxHeight: "78vh",
              imageRendering: "crisp-edges",
              filter: "drop-shadow(0 0 20px rgba(100,140,255,0.2)) drop-shadow(0 20px 35px rgba(0,0,0,0.55)) contrast(1.06) saturate(1.1)",
              marginRight: "-20px",
            }}
          />
        </div>

        {/* ── CENTER: logo + card ── */}
        <div className="flex flex-col items-center justify-center px-4 py-10">

          {/* Logo */}
          <div className="mnt-f1 mb-6">
            <img
              src={logoLight}
              alt="KiyuMart"
              className="h-12 sm:h-[3.25rem] w-auto object-contain"
              style={{ filter: "drop-shadow(0 0 18px rgba(180,200,255,0.4))" }}
            />
          </div>

          {/* Glass card */}
          <div
            className="mnt-f2 w-full rounded-3xl px-6 py-7 flex flex-col items-center gap-4"
            style={{
              background: "rgba(255,255,255,0.06)",
              backdropFilter: "blur(28px)",
              WebkitBackdropFilter: "blur(28px)",
              border: "1px solid rgba(255,255,255,0.13)",
              boxShadow: [
                "0 4px 60px rgba(0,0,0,0.55)",
                "0 1px 0 rgba(255,255,255,0.09) inset",
                "0 -1px 0 rgba(255,255,255,0.04) inset",
              ].join(", "),
            }}
          >

            {/* Badge */}
            <div
              className="mnt-f3 flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85"
              style={{ background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.16)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              {subtitle}
            </div>

            {/* Heading */}
            <div className="mnt-f4 text-center space-y-2.5">
              <h1 className="text-[1.9rem] sm:text-[2.1rem] font-extrabold text-white tracking-tight leading-tight"
                style={{ textShadow: "0 0 40px rgba(160,190,255,0.3)" }}>
                We'll be right back
              </h1>
              <p className="text-[0.85rem] text-white/60 leading-relaxed max-w-[290px] mx-auto">
                {message}
              </p>
            </div>

            {/* Countdown */}
            {scheduledEnd && (
              <div className="mnt-f4 w-full text-center space-y-2.5">
                <p className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Back online in</p>
                <Countdown end={scheduledEnd} />
              </div>
            )}

            {/* Progress bar */}
            <div className="mnt-f5 w-full">
              <div className="mnt-bar" />
            </div>

            {/* Dots */}
            <div className="mnt-f5 flex items-center gap-2 -mt-1">
              <div className="mnt-d1 h-1.5 w-1.5 rounded-full bg-white/90" />
              <div className="mnt-d2 h-1.5 w-1.5 rounded-full bg-white/90" />
              <div className="mnt-d3 h-1.5 w-1.5 rounded-full bg-white/90" />
              <span className="text-[11px] text-white/40 ml-1.5">Working on it…</span>
            </div>

            {/* Divider */}
            <div className="mnt-f5 w-full h-px" style={{ background: "rgba(255,255,255,0.08)" }} />

            {/* Assurances */}
            <div className="mnt-f6 w-full space-y-2.5">
              {[
                "Your orders and payments are fully preserved",
                "Your cart and session are saved",
                "This page refreshes automatically when we're back",
              ].map((text, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                    style={{ background: "rgba(255,255,255,0.13)", border: "1px solid rgba(255,255,255,0.18)" }}
                  >
                    <svg className="h-2.5 w-2.5 text-white/90" fill="none" viewBox="0 0 10 10">
                      <path d="M1.5 5 L4 7.5 L8.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-[12px] text-white/55 leading-snug">{text}</span>
                </div>
              ))}
            </div>

          </div>

          {/* Footer */}
          <p className="mnt-f6 mt-5 text-[11px] text-white/25 text-center tracking-wide">
            © {new Date().getFullYear()} KiyuMart &nbsp;·&nbsp; Thank you for your patience
          </p>

        </div>

        {/* ── RIGHT CHARACTER ── */}
        <div
          className="hidden lg:flex items-center justify-start"
          style={{ overflow: "visible", paddingBottom: "8vh" }}
        >
          <img
            src={guyRight}
            alt="" aria-hidden
            className="mnt-fr select-none pointer-events-none object-contain"
            style={{
              width: "clamp(300px, 30vw, 480px)",
              maxHeight: "80vh",
              mixBlendMode: "screen",
              filter: "drop-shadow(0 0 30px rgba(100,140,255,0.2)) drop-shadow(0 30px 50px rgba(0,0,0,0.5)) brightness(1.05)",
              marginLeft: "-20px",
            }}
          />
        </div>

      </div>

      {/* ══ Mobile characters (shown below card on small screens) ══ */}
      <div className="lg:hidden relative z-10 flex justify-between items-end px-2 pb-2 -mt-10">
        <img src={guyLeft} alt="" aria-hidden className="w-28 xs:w-36 object-contain object-bottom"
          style={{ filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.6))" }} />
        <img src={guyRight} alt="" aria-hidden className="w-32 xs:w-40 object-contain object-bottom"
          style={{ mixBlendMode: "screen", filter: "brightness(1.05) drop-shadow(0 10px 20px rgba(0,0,0,0.5))" }} />
      </div>

    </div>
  );
}
