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
  const target = promo.product || promo.store;
  if (!target) return null;

  const endAt = promo.endAt ? new Date(promo.endAt) : null;
  const remaining = endAt ? Math.max(0, endAt.getTime() - now.getTime()) : null;
  const humanRemaining = endAt ? formatDistanceStrict(now, endAt, { unit: 'minute' }) : null;

  const image = promo.type === 'product' ? (target.images && target.images[0]) : target.logo;
  const title = promo.type === 'product' ? target.name : target.name;
  const link = promo.type === 'product' ? `/product/${target.id}` : `/store/${target.id}`;

  if (sidebar) {
    return (
      <a href={link} className="block rounded-lg overflow-hidden bg-card border shadow-sm" data-testid="promo-ad-sidebar">
        {image ? (
          <div className="w-full h-96 bg-cover bg-center" style={{ backgroundImage: `url(${image})` }} />
        ) : (
          <div className="w-full h-96 bg-primary/10 flex items-center justify-center text-primary">Promo</div>
        )}
        <div className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">{title}</div>
              <div className="text-sm text-muted-foreground mt-1">{promo.type === 'product' ? 'Promoted product' : 'Promoted store'}</div>
            </div>
            {endAt && (
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Ends in</div>
                <div className="text-sm font-medium inline-flex items-center gap-2" aria-live="polite" role="status" aria-atomic="true">
                  <span className="sr-only">Promotion ends in</span>
                  <span
                    data-testid="promo-countdown"
                    className="inline-block px-2 py-1 rounded bg-primary text-white font-medium"
                    aria-label={humanRemaining ? `Ends in ${humanRemaining}` : `Ends in ${formatCountdown(remaining)}`}
                    title={humanRemaining ? `Ends in ${humanRemaining}` : `Ends in ${formatCountdown(remaining)}`}
                    tabIndex={0}
                  >{formatCountdown(remaining)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </a>
    );
  }

  return (
    <div className="w-screen -mx-4 md:-mx-8 py-4">
      <div className="max-w-7xl mx-auto px-4">
        <a href={link} className="relative block rounded-lg overflow-hidden bg-card border shadow-sm" data-testid="promo-ad">
          <div className="md:flex items-center">
            {image ? (
              <div className="md:w-1/3 w-full h-44 md:h-56 bg-cover bg-center" style={{ backgroundImage: `url(${image})` }} />
            ) : (
              <div className="md:w-1/3 w-full h-44 md:h-56 bg-primary/10 flex items-center justify-center text-primary">Promo</div>
            )}
            <div className="p-4 md:w-2/3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">{title}</div>
                  <div className="text-sm text-muted-foreground mt-1">{promo.type === 'product' ? 'Promoted product' : 'Promoted store'}</div>
                </div>
                {endAt && (
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Ends in</div>
                    <div className="text-sm font-medium inline-flex items-center gap-2" aria-live="polite" role="status" aria-atomic="true">
                      <span className="sr-only">Promotion ends in</span>
                      <span className="sr-only">{humanRemaining ? `${humanRemaining} remaining` : ''}</span>
                      <span
                        data-testid="promo-countdown"
                        className="inline-block px-2 py-1 rounded bg-primary text-white font-medium"
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
