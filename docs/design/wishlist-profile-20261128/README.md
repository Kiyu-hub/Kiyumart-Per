# Wishlist & Profile — redesign (phone)

Canvas: https://claude.ai/artifact/Emx5XWph9eAJdJFyvVZzfD (its own canvas; the cart canvas is unchanged)

## Wishlist — APPROVED by the owner (28 Nov 2026), loaded + empty
- Same look as the approved cart (A). Shop name on each card; price uses the checkout rule
  (fixes the current full-price bug); Add to cart; sold-out items greyed with "Find similar".
- Discount badge = the app's product-card badge: red #EF4444, white "NN% OFF". Sold out: dark grey.
- No "price dropped" label or filter (owner: nothing that isn't a real feature). Filters: All / In stock.
- Empty: heart card + Start shopping, then "Popular right now" (with % OFF badges and save hearts).

## Profile — by role, in the current KiyuMart design (awaiting the owner's approval)
Teal #00796B / #009688 accents, #F2F2F7 background, white rounded cards (same look as the cart and wishlist).
Menus use only pages that exist today (MobileProfile.tsx + DashboardSidebar.tsx); bottom bar matches
MobileBottomNavA (Home · Cart · role button · Wishlist · Profile).
- Buyer (normal user): orders / active / wishlist; Shopping, Account, Support.
- Seller: products / active orders / reviews; Store (dashboard, products, orders, analytics, reviews,
  promotions, earnings & payouts, store settings); centre button "Dashboard".
- Rider: Rider hub (dashboard, deliveries, earnings, messages, settings); centre "Tasks".
- Pickup agent: Agent hub (orders, earnings, shift); centre "Pickup".
- Admin: "Limited access — set by the Super Admin" note; only permitted admin areas; centre "Admin".
- Super Admin: "Full access" note; Platform control (admin permissions, users, platform settings,
  payout approvals, platform earnings), Operations, Monitoring; centre "Super Admin".
Example names and numbers only. Desktop unchanged.
