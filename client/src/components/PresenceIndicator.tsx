/**
 * PresenceIndicator Component - WhatsApp-style Online/Offline Status
 * 
 * Shows a colored dot indicating user's presence status:
 * - Green: Online
 * - Yellow: Away
 * - Gray: Offline (with last seen tooltip)
 */

import React from 'react';
import { usePresence, formatLastSeen } from '@/hooks/usePresence';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface PresenceIndicatorProps {
  userId: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
};

const statusColors = {
  online: 'bg-green-500',
  away: 'bg-yellow-500',
  offline: 'bg-gray-400',
};

const statusLabels = {
  online: 'Online',
  away: 'Away',
  offline: 'Offline',
};

export function PresenceIndicator({
  userId,
  showLabel = false,
  size = 'md',
  className,
}: PresenceIndicatorProps) {
  const { presence, isLoading } = usePresence(userId);

  if (isLoading) {
    return (
      <span className={cn('inline-flex items-center gap-1.5', className)}>
        <span className={cn(
          'rounded-full animate-pulse bg-gray-300',
          sizeClasses[size]
        )} />
        {showLabel && <span className="text-xs text-muted-foreground">...</span>}
      </span>
    );
  }

  const status = presence?.status || 'offline';
  const lastSeen = presence?.lastSeen;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('inline-flex items-center gap-1.5', className)}>
            <span
              className={cn(
                'rounded-full ring-2 ring-background',
                sizeClasses[size],
                statusColors[status]
              )}
            />
            {showLabel && (
              <span className={cn(
                'text-xs',
                status === 'online' ? 'text-green-600' : 'text-muted-foreground'
              )}>
                {statusLabels[status]}
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {status === 'online' ? (
            'Online now'
          ) : status === 'away' ? (
            'Away'
          ) : lastSeen ? (
            `Last seen ${formatLastSeen(lastSeen)}`
          ) : (
            'Offline'
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * PresenceBadge - A badge showing online status with text
 */
export function PresenceBadge({
  userId,
  className,
}: {
  userId: string;
  className?: string;
}) {
  const { presence, isLoading } = usePresence(userId);
  const status = presence?.status || 'offline';
  const lastSeen = presence?.lastSeen;

  if (isLoading) {
    return null;
  }

  if (status === 'online') {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700',
        className
      )}>
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Online
      </span>
    );
  }

  if (status === 'away') {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700',
        className
      )}>
        <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
        Away
      </span>
    );
  }

  return (
    <span className={cn(
      'text-xs text-muted-foreground',
      className
    )}>
      {lastSeen ? `Last seen ${formatLastSeen(lastSeen)}` : 'Offline'}
    </span>
  );
}

/**
 * AvatarWithPresence - Combines avatar with presence indicator
 */
interface AvatarWithPresenceProps {
  userId: string;
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const avatarSizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
};

const indicatorPositionClasses = {
  sm: 'bottom-0 right-0',
  md: 'bottom-0 right-0',
  lg: 'bottom-0.5 right-0.5',
};

export function AvatarWithPresence({
  userId,
  src,
  name,
  size = 'md',
  className,
}: AvatarWithPresenceProps) {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className={cn('relative inline-block', className)}>
      {src ? (
        <img
          src={src}
          alt={name}
          className={cn(
            'rounded-full object-cover',
            avatarSizeClasses[size]
          )}
        />
      ) : (
        <div className={cn(
          'rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium',
          avatarSizeClasses[size],
          size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base'
        )}>
          {initials}
        </div>
      )}
      <span className={cn('absolute', indicatorPositionClasses[size])}>
        <PresenceIndicator userId={userId} size="sm" />
      </span>
    </div>
  );
}

export default PresenceIndicator;
