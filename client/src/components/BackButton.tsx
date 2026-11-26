import { canGoBackInApp, goBack } from "@/lib/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BackButtonProps {
  fallbackRoute: string;
  label?: string;
}

export default function BackButton({ fallbackRoute, label = "Back" }: BackButtonProps) {
  const handleBack = () => {
    if (canGoBackInApp()) {
      goBack();
    } else {
      window.location.href = fallbackRoute;
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleBack}
      className="gap-2"
      data-testid="button-back"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  );
}
