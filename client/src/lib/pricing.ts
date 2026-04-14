export interface PriceableProductLike {
  price: string | number;
  costPrice?: string | number | null;
  discount?: number | null;
}

export interface QuantifiedPriceableProductLike extends PriceableProductLike {
  quantity: number;
}

function toNumber(value: string | number | null | undefined) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(numeric) ? numeric : 0;
}

export function getCurrentSellingPrice(product: PriceableProductLike) {
  const sellingPrice = Math.max(0, toNumber(product.price));
  const originalPrice = toNumber(product.costPrice);

  if (originalPrice > sellingPrice && sellingPrice > 0) {
    return sellingPrice;
  }

  const productDiscount = Number(product.discount ?? 0);
  if (productDiscount > 0) {
    return Math.max(0, sellingPrice * (1 - productDiscount / 100));
  }

  return sellingPrice;
}

export function getOriginalDisplayPrice(product: PriceableProductLike) {
  const sellingPrice = Math.max(0, toNumber(product.price));
  const originalPrice = toNumber(product.costPrice);
  return originalPrice > sellingPrice ? originalPrice : sellingPrice;
}

export function calculateProductPricingSummary(items: QuantifiedPriceableProductLike[]) {
  return items.reduce(
    (summary, item) => {
      const quantity = Math.max(0, Number(item.quantity) || 0);
      const currentPrice = getCurrentSellingPrice(item);
      const originalPrice = getOriginalDisplayPrice(item);

      summary.subtotal += currentPrice * quantity;
      summary.originalSubtotal += originalPrice * quantity;
      summary.productSavings += Math.max(0, (originalPrice - currentPrice) * quantity);
      return summary;
    },
    {
      subtotal: 0,
      originalSubtotal: 0,
      productSavings: 0,
    },
  );
}
