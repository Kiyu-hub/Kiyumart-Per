# Cart page redesign — proposals A / B / C (phone only)

Status: **proposal, awaiting owner + Design Director approval.** No app code changed. Desktop cart (`client/src/pages/Cart.tsx`) stays as is.

Canvas: https://claude.ai/artifact/8FH5HGmGChzqdGMLAyJgRe

Three styles to choose from: **A** clean cards (Main.dc.html, current KiyuMart look), **B** editorial / fashion-magazine (B.dc.html), **C** bold app with teal header and steps (C.dc.html). Same features in all three.

Key changes vs current `MobileCart.tsx`:
- Items grouped by shop (matches multi-vendor: each shop delivers separately, coupons are per shop)
- "Deliver to" row up top; delivery shown per shop once a location is set (no invented fees)
- Select / deselect items for checkout; Save for later; low-stock note
- Variant chip (size · colour) tappable to change
- Shop coupons found automatically: one tap applies the code (no typing); "Enter a code" when none is available
- "Unavailable" section for sold-out items (excluded from checkout, "Find similar")
- Summary: Items, Discounts, Delivery, Shop coupons, **Charges (Paystack 1.95%)**, Total. The charge uses `platform_settings.processingFeePercent` (default 1.95%, Paystack Ghana's local rate) and the same gross-up as the server checkout: fee = base × r / (1 − r). The customer pays it.
- Sticky bar: total, savings, Checkout (n)
- Empty-cart state

Prices use the checkout rule (price × (1 − discount%)).

Wording: "delivery" throughout, never "shipping".
