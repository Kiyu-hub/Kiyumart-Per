import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MobilePageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  actions?: React.ReactNode;
  transparent?: boolean;
  sticky?: boolean;
  largeTitle?: boolean;
  className?: string;
}

export function MobilePageHeader({
  title,
  subtitle,
  showBack = true,
  onBack,
  actions,
  transparent = false,
  sticky = true,
  largeTitle = false,
  className,
}: MobilePageHeaderProps) {
  const [, navigate] = useLocation();

  return (
    <header
      className={cn(
        "md:hidden flex items-center gap-2 px-4 py-3 z-30",
        sticky && "sticky top-0",
        transparent ? "bg-transparent" : "glass border-b border-border/30",
        className,
      )}
      style={{ paddingTop: "max(12px, env(safe-area-inset-top, 0px))" }}
    >
      {showBack && (
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 shrink-0 text-primary touch-ripple h-9 w-9"
          onClick={onBack ?? (() => window.history.back())}
          aria-label="Go back"
        >
          <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
        </Button>
      )}

      <div className={cn("flex-1 min-w-0", !showBack && "ml-1")}>
        {largeTitle ? (
          <h1 className="mobile-large-title truncate">{title}</h1>
        ) : (
          <h1 className="mobile-headline truncate">{title}</h1>
        )}
        {subtitle && (
          <p className="mobile-caption text-muted-foreground truncate mt-0.5">{subtitle}</p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-1 shrink-0">{actions}</div>
      )}
    </header>
  );
}
