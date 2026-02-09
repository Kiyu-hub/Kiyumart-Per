import { useEffect, useState } from 'react';
import { formatDistanceStrict } from 'date-fns';

export default function SinglePromotionSidebar({ promo }: { promo: any }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!promo) return null;

  const target = promo.product || promo.store || null;
  const endAt = promo.endAt ? new Date(promo.endAt) : null;
  const remaining = endAt ? Math.max(0, endAt.getTime() - now.getTime()) : null;
  const humanRemaining = endAt ? formatDistanceStrict(now, endAt, { unit: 'minute' }) : null;

  const image = promo.imageUrl || (promo.type === 'product' ? (target?.images && target.images[0]) : target?.logo) || null;
  const title = promo.title || target?.name || 'Promoted';
  const subtitle = promo.description || (promo.type === 'product' ? 'Promoted product' : 'Promoted store');
  // Route stores to /sellers/:id (the actual store page route)
  const link = promo.ctaUrl || (promo.type === 'product' ? (target ? `/product/${target.id}` : '#') : (target ? `/sellers/${target.id}` : '#'));

  return (
    <a 
      href={link} 
      className="flex flex-col rounded-lg overflow-hidden bg-card border-2 border-primary/30 shadow-lg hover:shadow-xl hover:border-primary transition-all focus:outline-none focus:ring-2 focus:ring-primary group"
      style={{ height: '100%', minHeight: 0 }}
      aria-label={`Promotional ${promo.type}`}
    >
      {/* Image Section - Takes most of the space */}
      {image ? (
        <div className="relative flex-1 overflow-hidden bg-muted min-h-0">
          <img 
            src={image} 
            alt={title} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/50" />
          
          {/* Promoted Badge */}
          <div className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-primary text-primary-foreground rounded-full text-xs font-bold shadow-lg">
            <span className="text-sm">{promo.type === 'product' ? '🛍️' : '🏪'}</span>
            <span>PROMOTED</span>
          </div>

          {/* Countdown - Very Prominent */}
          {endAt && (
            <div className="absolute top-3 left-3 inline-flex flex-col items-center gap-1 px-3 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-full text-xs font-bold shadow-xl" aria-live="polite" role="status" aria-atomic="true">
              <span className="text-lg">⏰</span>
              <span
                data-testid="promo-countdown"
                aria-label={humanRemaining ? `Ends in ${humanRemaining}` : `Ends in ${formatCountdown(remaining)}`}
                title={humanRemaining ? `Ends in ${humanRemaining}` : `Ends in ${formatCountdown(remaining)}`}
                className="font-mono text-sm"
              >{formatCountdown(remaining)}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center relative">
          <div className="text-center">
            <div className="text-5xl mb-2">{promo.type === 'product' ? '🛍️' : '🏪'}</div>
            <div className="text-sm font-bold text-primary">Promoted {promo.type}</div>
          </div>

          {/* Countdown Badge - For no-image case */}
          {endAt && (
            <div className="absolute top-3 left-3 inline-flex flex-col items-center gap-1 px-3 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-full text-xs font-bold shadow-xl" aria-live="polite" role="status" aria-atomic="true">
              <span className="text-lg">⏰</span>
              <span
                data-testid="promo-countdown"
                aria-label={humanRemaining ? `Ends in ${humanRemaining}` : `Ends in ${formatCountdown(remaining)}`}
                title={humanRemaining ? `Ends in ${humanRemaining}` : `Ends in ${formatCountdown(remaining)}`}
                className="font-mono text-sm"
              >{formatCountdown(remaining)}</span>
            </div>
          )}
        </div>
      )}

      {/* Content Section - Bottom of card */}
      <div className="p-4 bg-card border-t border-border space-y-3">
        <div>
          <div className="font-bold text-foreground line-clamp-2 group-hover:text-primary transition-colors text-sm">
            {title}
          </div>
          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {subtitle}
          </div>
        </div>

        {/* CTA Button */}
        {promo.ctaText && (
          <button className="w-full px-3 py-2 rounded-md text-xs font-bold bg-gradient-to-r from-primary to-primary/90 text-primary-foreground hover:from-primary/90 hover:to-primary transition-all shadow-md hover:shadow-lg">
            {promo.ctaText}
          </button>
        )}

        {/* End Date Info */}
        {endAt && (
          <div className="pt-2 border-t border-border">
            <div className="text-xs text-muted-foreground text-center">
              Ends: {new Date(endAt).toLocaleDateString('en-US', {
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
