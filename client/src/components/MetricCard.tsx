import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: number;
  changeLabel?: string;
}

export default function MetricCard({
  title,
  value,
  icon: Icon,
  change,
  changeLabel = "vs last month",
}: MetricCardProps) {
  const isPositive = change !== undefined && change >= 0;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="min-w-0 pr-2 text-sm font-medium text-muted-foreground leading-snug break-words">
          {title}
        </CardTitle>
        <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        <div className="min-w-0 text-3xl font-bold leading-tight break-words" data-testid="text-metric-value">
          {value}
        </div>
        {change !== undefined && (
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1 text-sm">
            {isPositive ? (
              <TrendingUp className="h-4 w-4 text-primary" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
            <span
              className={isPositive ? "text-primary" : "text-destructive"}
              data-testid="text-metric-change"
            >
              {isPositive ? "+" : ""}
              {change}%
            </span>
            <span className="min-w-0 break-words text-muted-foreground">{changeLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
