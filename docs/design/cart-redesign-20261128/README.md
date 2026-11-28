# Cart page redesign — proposal (phone only)

Status: **proposal, awaiting owner + Design Director approval.** No app code changed. Desktop cart (`client/src/pages/Cart.tsx`) stays as is.

Canvas: https://claude.ai/artifact/8FH5HGmGChzqdGMLAyJgRe

Key changes vs current `MobileCart.tsx`:
- Items grouped by shop (matches multi-vendor: each shop ships separately, coupons are per shop)
- "Deliver to" row up top; delivery shown per shop once a location is set (no invented fees)
- Select / deselect items for checkout; Save for later; low-stock note
- Variant chip (size · colour) tappable to change
- Per-shop coupon field
- "Unavailable" section for sold-out items (excluded from checkout, "Find similar")
- Summary shows original total, discounts, delivery, coupons, total; Paystack trust note
- Sticky bar: total, savings, Checkout (n)
- Empty-cart state

Prices use the checkout rule (price × (1 − discount%)).
