import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Sparkles } from 'lucide-react';

export default function PromotionalAdsGrid() {
  const { data: promos = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/homepage/promotional'],
    queryFn: async () => {
      const res = await fetch('/api/homepage/promotional');
      return res.json();
    },
    refetchInterval: 5000,
  });

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (isLoading) return null;
  if (!promos || promos.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground tracking-wide uppercase">Featured Promotions</h3>
      </div>
      <div className={`grid gap-3 ${
        promos.length === 1
          ? 'grid-cols-1 max-w-[200px]'
          : promos.length === 2
          ? 'grid-cols-2 max-w-sm'
          : promos.length === 3
          ? 'grid-cols-3 max-w-lg'
          : 'grid-cols-2 sm:grid-cols-4'
      }`}>
        {promos.map((promo, idx) => (
          <PromoCard key={promo.id || idx} promo={promo} now={now} />
        ))}
      </div>
    </section>
  );
}

function PromoCard({ promo, now }: { promo: any; now: Date }) {
  const target = promo.product || promo.store || null;

  const endAt = promo.endAt ? new Date(promo.endAt) : null;
  const remaining = endAt ? Math.max(0, endAt.getTime() - now.getTime()) : null;

  const image = promo.imageUrl || (promo.type === 'product' ? target?.images?.[0] : target?.logo) || null;
  const title = promo.title || target?.name || 'Promoted';
  const link = promo.ctaUrl || (promo.type === 'product' ? (target ? `/product/${target.id}` : '#') : (target ? `/sellers/${target.id}` : '#'));
  const isProduct = promo.type === 'product';

  return (
    <Link
      href={link}
      className="group block rounded-xl overflow-hidden bg-card border border-border/60 shadow-sm hover:shadow-md hover:border-primary/50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      aria-label={`${isProduct ? 'Product' : 'Store'} promotion: ${title}`}
    >
      {/* Strict square image */}
      <div className="relative w-full aspect-square overflow-hidden bg-muted">
        {image ? (
          <img
            src={image}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent flex items-center justify-center">
            <span className="text-3xl opacity-40">{isProduct ? '🛍️' : '🏪'}</span>
          </div>
        )}

        {/* Subtle dark gradient at bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

        {/* Promoted badge — top right */}
        <div className="absolute top-1.5 right-1.5">
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground text-[9px] font-bold uppercase tracking-wider shadow">
            <Sparkles className="h-2 w-2" />
            Ad
          </span>
        </div>

        {/* Countdown — top left */}
        {remaining !== null && remaining > 0 && (
          <div className="absolute top-1.5 left-1.5">
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/65 text-white text-[9px] font-semibold backdrop-blur-sm">
              ⏱ {formatCountdown(remaining)}
            </span>
          </div>
        )}

        {/* Title overlay */}
        <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5">
          <p className="text-white text-[11px] font-semibold line-clamp-2 leading-tight drop-shadow-sm">{title}</p>
          {promo.ctaText && (
            <p className="text-white/80 text-[9px] mt-0.5 font-medium">{promo.ctaText} →</p>
          )}
        </div>
      </div>

      {/* Type chip below image */}
      <div className="px-2 py-1.5 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground capitalize">{isProduct ? 'Product' : 'Store'}</span>
        <span className="text-[10px] text-primary font-medium group-hover:underline">View →</span>
      </div>
    </Link>
  );
}

function formatCountdown(ms: number) {
  if (ms <= 0) return 'Ended';
  const secs = Math.floor(ms / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function pad(n: number) {
  return n.toString().padStart(2, '0');
}
