import { parseChatAttachmentMessage } from "@/lib/chatAttachments";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";

interface MessageAttachmentContentProps {
  message: string;
  className?: string;
}

export default function MessageAttachmentContent({ message, className = "" }: MessageAttachmentContentProps) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const attachment = parseChatAttachmentMessage(message);

  if (!attachment) {
    return <p className={className}>{message}</p>;
  }

  if (attachment.kind === "audio") {
    return (
      <div className="space-y-2">
        <audio src={attachment.url} controls className="w-full max-w-xs" />
        <p className="text-xs opacity-80">{attachment.name}</p>
      </div>
    );
  }

  if (attachment.kind === "image") {
    return (
      <div className="space-y-2">
        <img src={attachment.url} alt={attachment.name} className="max-h-56 rounded-md border object-cover" />
        <p className="text-xs opacity-80">{attachment.name}</p>
      </div>
    );
  }

  if (attachment.kind === "video") {
    return (
      <div className="space-y-2">
        <video src={attachment.url} controls className="max-h-64 rounded-md border" />
        <p className="text-xs opacity-80">{attachment.name}</p>
      </div>
    );
  }

  if (attachment.kind === "product") {
    const productName = attachment.productName || attachment.name || "Referenced product";
    const role = String(user?.role || "").toLowerCase();
    const productLink = (() => {
      if (role === "seller" && attachment.productId) {
        const params = new URLSearchParams({ productId: attachment.productId });
        return `/seller/products?${params.toString()}`;
      }
      return attachment.url;
    })();
    const handleProductOpen = (event: any) => {
      event.preventDefault();
      if (!productLink) return;
      if (productLink.startsWith("http://") || productLink.startsWith("https://")) {
        window.open(productLink, "_blank", "noopener,noreferrer");
        return;
      }
      navigate(productLink);
    };
    return (
      <div className="rounded-md border bg-muted/40 p-3 space-y-2 max-w-sm">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
          Product Reference
        </p>
        <div className="flex items-center gap-3">
          <img
            src={attachment.productImage || "/placeholder.jpg"}
            alt={productName}
            className="h-14 w-14 rounded-md object-cover border"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight line-clamp-2">{productName}</p>
            <a href={productLink} onClick={handleProductOpen} className="text-xs text-primary hover:underline" data-testid="link-product-reference">
              Open product
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (attachment.kind === "order") {
    const orderNumber = attachment.orderNumber || attachment.name || "Order";
    const actionOwnerLabel =
      attachment.orderActionOwner === "seller"
        ? "Seller Action"
        : attachment.orderActionOwner === "rider"
          ? "Rider Action"
          : "Required Action";
    const role = String(user?.role || "").toLowerCase();
    const orderLink = (() => {
      if (!attachment.orderId) return attachment.url;
      const params = new URLSearchParams({ orderId: attachment.orderId });
      if (attachment.orderNumber) params.set("orderNumber", attachment.orderNumber);

      if (role === "admin" || role === "super_admin") {
        return `/admin/orders?${params.toString()}`;
      }
      if (role === "seller") {
        params.set("context", "seller");
        return `/seller/orders?${params.toString()}`;
      }
      if (role === "rider") {
        return `/rider/deliveries?${params.toString()}`;
      }
      return attachment.url;
    })();
    const handleOrderOpen = () => {
      if (!orderLink) return;
      if (orderLink.startsWith("http://") || orderLink.startsWith("https://")) {
        window.open(orderLink, "_blank", "noopener,noreferrer");
        return;
      }
      navigate(orderLink);
    };
    return (
      <div className="rounded-md border bg-muted/40 p-3 space-y-2 max-w-sm">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
          Order Reference
        </p>
        <div className="space-y-1">
          <p className="text-sm font-semibold leading-tight">#{orderNumber}</p>
          {attachment.orderAction && (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold">{actionOwnerLabel}:</span> {attachment.orderAction}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleOrderOpen}
          className="text-xs text-primary hover:underline bg-transparent border-0 p-0"
          data-testid="link-order-reference"
        >
          Open order
        </button>
      </div>
    );
  }

  return (
    <a href={attachment.url} target="_blank" rel="noreferrer" className="text-sm underline">
      {attachment.name}
    </a>
  );
}
