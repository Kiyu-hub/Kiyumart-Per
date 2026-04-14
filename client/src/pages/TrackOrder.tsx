import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Loader2 } from "lucide-react";

export default function TrackOrder() {
  const { id } = useParams();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!id) {
      navigate("/orders");
      return;
    }
    navigate(`/track/${encodeURIComponent(id)}`, { replace: true });
  }, [id, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Redirecting to order tracking...</span>
      </div>
    </div>
  );
}
