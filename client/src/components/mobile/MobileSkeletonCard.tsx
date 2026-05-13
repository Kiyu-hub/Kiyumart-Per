import { cn } from "@/lib/utils";

interface SkeletonProps { className?: string; }

export function SkeletonBox({ className }: SkeletonProps) {
  return <div className={cn("skeleton-shimmer", className)} />;
}

export function MobileProductCardSkeleton() {
  return (
    <div className="mobile-card bg-card p-3 space-y-2">
      <SkeletonBox className="w-full aspect-[4/3] rounded-xl" />
      <SkeletonBox className="h-4 w-3/4 rounded-md" />
      <SkeletonBox className="h-3 w-1/2 rounded-md" />
      <div className="flex gap-2 pt-1">
        <SkeletonBox className="h-5 w-16 rounded-full" />
        <SkeletonBox className="h-5 w-10 rounded-full" />
      </div>
    </div>
  );
}

export function MobileOrderCardSkeleton() {
  return (
    <div className="mobile-card bg-card p-4 space-y-3 relative">
      <div className="status-bar-left skeleton-shimmer rounded-l-2xl" />
      <div className="flex justify-between">
        <SkeletonBox className="h-4 w-24 rounded-md" />
        <SkeletonBox className="h-4 w-16 rounded-md" />
      </div>
      <div className="flex gap-3">
        <SkeletonBox className="h-14 w-14 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonBox className="h-4 w-full rounded-md" />
          <SkeletonBox className="h-3 w-2/3 rounded-md" />
          <SkeletonBox className="h-3 w-1/3 rounded-md" />
        </div>
      </div>
    </div>
  );
}

export function MobileListItemSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="mobile-grouped-list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="mobile-grouped-list-item">
          <SkeletonBox className="w-9 h-9 rounded-xl shrink-0" />
          <div className="flex-1 space-y-1.5">
            <SkeletonBox className="h-4 w-40 rounded-md" />
            <SkeletonBox className="h-3 w-24 rounded-md" />
          </div>
          <SkeletonBox className="h-4 w-4 rounded" />
        </div>
      ))}
    </div>
  );
}

export function MobileStatCardSkeleton() {
  return (
    <div className="mobile-card bg-card p-4 min-w-[140px] space-y-2">
      <SkeletonBox className="h-3 w-20 rounded-md" />
      <SkeletonBox className="h-7 w-28 rounded-md" />
      <SkeletonBox className="h-3 w-16 rounded-md" />
    </div>
  );
}
