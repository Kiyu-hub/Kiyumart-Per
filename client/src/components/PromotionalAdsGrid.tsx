import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceStrict } from 'date-fns';

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

  // Dynamically adjust card size based on number of promotions
  const cardSize = promos.length > 2 ? 'w-32 sm:w-40' : 'w-40 sm:w-48';

  return (
    <div className="w-full py-4 bg-gradient-to-r from-transparent via-primary/5 to-transparent">
      <div className="max-w-7xl mx-auto px-4">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <span className="text-xl">⭐</span>
          <span>Featured</span>
        </h3>
        
        {/* Single horizontal row with overflow scroll on mobile */}
        <div className="flex gap-3 overflow-x-auto pb-2 scroll-smooth">
          {promos.map((promo, idx) => (
            <div key={promo.id || idx} className={`flex-shrink-0 ${cardSize}`}>
              <PromotionalCard promo={promo} now={now} isCompact={promos.length > 2} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PromotionalCard({ promo, now, isCompact = false }: { promo: any; now: Date; isCompact?: boolean }) {
  const target = promo.product || promo.store || null;

  const endAt = promo.endAt ? new Date(promo.endAt) : null;
  const remaining = endAt ? Math.max(0, endAt.getTime() - now.getTime()) : null;
  const humanRemaining = endAt ? formatDistanceStrict(now, endAt, { unit: 'minute' }) : null;

  // Use explicitly provided image/title/cta when present, otherwise fall back to target data
  const image = promo.imageUrl || (promo.type === 'product' ? (target?.images && target.images[0]) : target?.logo) || null;
  const title = promo.title || target?.name || 'Promoted';
  const subtitle = promo.description || (promo.type === 'product' ? 'Promoted product' : 'Promoted store');
  // Route stores to /sellers/:id (the actual store page route)
  const link = promo.ctaUrl || (promo.type === 'product' ? (target ? `/product/${target.id}` : '#') : (target ? `/sellers/${target.id}` : '#'));

  if (isCompact) {
    return (
      <a 
        href={link} 
        className="group flex flex-col h-full rounded-lg overflow-hidden bg-card border border-primary/20 shadow-sm hover:shadow-md hover:border-primary transition-all focus:outline-none focus:ring-2 focus:ring-primary"
      >
        {/* Image Section */}
        {image ? (
          <div className="relative w-full h-24 overflow-hidden bg-muted">
            <img src={image} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/40" />
            
            {/* Countdown Badge - Compact */}
            {endAt && (
              <div className="absolute top-1 left-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-600 text-white rounded-full text-[10px] font-bold shadow-md">
                <span>⏰</span>
                <span>{formatCountdown(remaining)}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-24 bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
            <div className="text-2xl">{promo.type === 'product' ? '🛍️' : '🏪'}</div>
          </div>
        )}

        {/* Content Section - Minimal but includes title and description */}
        <div className="p-2 bg-card flex flex-col flex-1 justify-between">
          <div className="text-xs font-bold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
            {title}
          </div>
          {subtitle && (
            <div className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
      </a>
    );
  }

  return (
    <a 
      href={link} 
      className="group flex flex-col h-full rounded-lg overflow-hidden bg-card border-2 border-primary/30 shadow-md hover:shadow-xl hover:border-primary transition-all focus:outline-none focus:ring-2 focus:ring-primary"
    >
      {/* Image Section */}
      {image ? (
        <div className="relative w-full h-48 overflow-hidden bg-muted">
          <img src={image} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40" />
          
          {/* Promoted Badge */}
          <div className="absolute top-2 right-2 inline-flex items-center gap-1 px-2.5 py-1 bg-primary text-primary-foreground rounded-full text-xs font-semibold">
            <span>{promo.type === 'product' ? '🛍️' : '🏪'}</span>
            <span>PROMOTED</span>
          </div>

          {/* Countdown Badge - More Prominent */}
          {endAt && (
            <div className="absolute top-2 left-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-full text-xs font-bold shadow-lg" aria-live="polite" role="status" aria-atomic="true">
              <span>⏰</span>
              <span
                data-testid="promo-countdown"
                aria-label={humanRemaining ? `Ends in ${humanRemaining}` : `Ends in ${formatCountdown(remaining)}`}
                title={humanRemaining ? `Ends in ${humanRemaining}` : `Ends in ${formatCountdown(remaining)}`}
              >{formatCountdown(remaining)}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="w-full h-48 bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-2">{promo.type === 'product' ? '🛍️' : '🏪'}</div>
            <div className="text-sm font-semibold text-primary">Promoted {promo.type}</div>
          </div>
        </div>
      )}

      {/* Content Section */}
      <div className="p-4 bg-card flex flex-col flex-1">
        <div className="space-y-3 flex-1">
          <div>
            <div className="text-base font-bold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
              {title}
            </div>
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {subtitle}
            </div>
          </div>
        </div>

        {/* CTA Button */}
        {promo.ctaText && (
          <button className="w-full mt-3 px-3 py-2 rounded-md text-sm font-bold bg-gradient-to-r from-primary to-primary/90 text-primary-foreground hover:from-primary/90 hover:to-primary transition-all shadow-md hover:shadow-lg">
            {promo.ctaText}
          </button>
        )}

        {/* End Time Info */}
        {endAt && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-xs text-muted-foreground">
              {new Date(endAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
        )}
      </div>
    </a>
  );
}

function formatCountdown(ms: number | null) {
  if (ms === null) return '';
  if (ms <= 0) return '00:00';
  const secs = Math.floor(ms / 1000);
  const min = Math.floor(secs / 60);
  const s = secs % 60;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function pad(n: number) {
  return n.toString().padStart(2, '0');
}
