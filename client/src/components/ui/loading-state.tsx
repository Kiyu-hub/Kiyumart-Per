import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type PageLoadingStateProps = {
  title?: string;
  description?: string;
  cardCount?: number;
  className?: string;
};

type SectionLoadingStateProps = {
  title?: string;
  description?: string;
  lines?: number;
  className?: string;
};

export function PageLoadingState({
  title = "Loading workspace",
  description = "Preparing the latest data for this page.",
  cardCount = 3,
  className,
}: PageLoadingStateProps) {
  return (
    <div className={cn("min-h-screen bg-background p-4 flex items-center justify-center", className)}>
      <Card className="w-full max-w-4xl border-border/70 bg-card/95 shadow-sm">
        <CardContent className="space-y-6 p-6 md:p-8">
          <div className="space-y-3">
            <p className="text-lg font-semibold text-foreground">{title}</p>
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-full max-w-xl" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {Array.from({ length: cardCount }).map((_, index) => (
              <div key={`page-loading-card-${index}`} className="rounded-xl border border-border/70 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                  <Skeleton className="h-10 w-10 rounded-full" />
                </div>
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border/70 p-5 space-y-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-full max-w-2xl" />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          </div>

          <p className="text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function SectionLoadingState({
  title = "Loading",
  description = "Fetching the latest records.",
  lines = 2,
  className,
}: SectionLoadingStateProps) {
  return (
    <Card className={cn("border-border/70 bg-card/95 shadow-sm", className)}>
      <CardContent className="space-y-5 p-5 md:p-6">
        <div className="space-y-2">
          <p className="text-base font-semibold text-foreground">{title}</p>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: lines }).map((_, index) => (
            <Skeleton key={`section-line-${index}`} className="h-10 w-full" />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
