import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceStrict } from 'date-fns';

export default function PromotionalAd({ sidebar = false }: { sidebar?: boolean }) {
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

  // For now render the first active promo prominently
  const promo = promos[0];
  const target = promo.product || promo.store || null;

  const endAt = promo.endAt ? new Date(promo.endAt) : null;
  const remaining = endAt ? Math.max(0, endAt.getTime() - now.getTime()) : null;
  const humanRemaining = endAt ? formatDistanceStrict(now, endAt, { unit: 'minute' }) : null;

  // Use explicitly provided image/title/cta when present, otherwise fall back to target data
  const image = promo.imageUrl || (promo.type === 'product' ? (target?.images && target.images[0]) : target?.logo) || null;
  const title = promo.title || target?.name || 'Promoted';
  const subtitle = promo.description || (promo.type === 'product' ? 'Promoted product' : 'Promoted store');
  const link = promo.ctaUrl || (promo.type === 'product' ? (target ? `/product/${target.id}` : '#') : (target ? `/store/${target.id}` : '#'));

  if (sidebar) {
    return (
      <a href={link} className="h-full flex flex-col rounded-lg overflow-hidden bg-card border-2 border-primary/30 shadow-md hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-primary group" data-testid="promo-ad-sidebar" aria-label={`Promotional ${promo.type}`}>
        {image ? (
          <div className="w-full flex-1 flex items-stretch min-h-0 overflow-hidden relative bg-muted">
            <img src={image} alt={title} className="w-full h-full object-cover block group-hover:scale-105 transition-transform" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40" />
            
            {/* Promoted Badge */}
            <div className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground rounded text-xs font-bold">
              <span>{promo.type === 'product' ? '🛍️' : '🏪'}</span>
            </div>

            {/* Countdown - Very Prominent */}
            {endAt && (
              <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-2.5 py-1 bg-red-600 text-white rounded text-xs font-bold shadow-lg" aria-live="polite" role="status" aria-atomic="true">
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
          <div className="w-full flex-1 bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-primary/60 relative">
            <div className="text-center">
              <div className="text-2xl mb-1">{promo.type === 'product' ? '🛍️' : '🏪'}</div>
              <div className="text-xs font-semibold">Promoted</div>
            </div>
            
            {/* Countdown - Very Prominent */}
            {endAt && (
              <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-2.5 py-1 bg-red-600 text-white rounded text-xs font-bold shadow-lg" aria-live="polite" role="status" aria-atomic="true">
                <span>⏰</span>
                <span
                  data-testid="promo-countdown"
                  aria-label={humanRemaining ? `Ends in ${humanRemaining}` : `Ends in ${formatCountdown(remaining)}`}
                  title={humanRemaining ? `Ends in ${humanRemaining}` : `Ends in ${formatCountdown(remaining)}`}
                >{formatCountdown(remaining)}</span>
              </div>
            )}
          </div>
        )}
        <div className="p-3.5 bg-card space-y-2.5">
          <div>
            <div className="text-sm font-bold text-foreground line-clamp-2 group-hover:text-primary">{title}</div>
            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{subtitle}</div>
          </div>
          {promo.ctaText && (
            <button className="w-full px-2 py-1.5 rounded text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              {promo.ctaText}
            </button>
          )}
        </div>
      </a>
    );
  }

  return (
    <div className="w-screen -mx-4 md:-mx-8 py-4">
      <div className="max-w-7xl mx-auto px-4">
        <a href={link} className="relative block rounded-lg overflow-hidden bg-card border border-primary/20 shadow-sm hover:shadow-md transition-all" data-testid="promo-ad">
          <div className="md:flex items-center">
            {image ? (
              <div className="md:w-1/3 w-full h-44 md:h-56 overflow-hidden bg-muted">
                <img src={image} alt={title} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="md:w-1/3 w-full h-44 md:h-56 bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                <div className="text-center text-primary/60">
                  <div className="text-3xl mb-2">{promo.type === 'product' ? '🛍️' : '🏪'}</div>
                  <div className="text-sm font-medium">Promoted {promo.type}</div>
                </div>
              </div>
            )}
            <div className="p-4 md:p-6 md:w-2/3 bg-card">
              <div className="space-y-3">
                <div>
                  <div className="text-lg font-semibold text-foreground">{title}</div>
                  <div className="text-sm text-muted-foreground mt-0.5">{subtitle}</div>
                </div>
                <div className="flex items-center justify-between pt-2 gap-4">
                  {promo.ctaText && (
                    <a href={promo.ctaUrl || link} className="inline-block px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">{promo.ctaText}</a>
                  )}

                  {endAt && (
                    <div className="text-left">
                      <div className="text-xs text-muted-foreground mb-1">Ends in</div>
                      <div className="text-sm font-semibold text-primary inline-flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full" aria-live="polite" role="status" aria-atomic="true">
                        <span className="sr-only">Promotion ends in</span>
                        <span
                          data-testid="promo-countdown"
                          aria-label={humanRemaining ? `Ends in ${humanRemaining}` : `Ends in ${formatCountdown(remaining)}`}
                          title={humanRemaining ? `Ends in ${humanRemaining}` : `Ends in ${formatCountdown(remaining)}`}
                          tabIndex={0}
                        >{formatCountdown(remaining)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </a>
      </div>
    </div>
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
