# Wishlist & Profile — redesign (phone)

Canvas: https://claude.ai/artifact/Emx5XWph9eAJdJFyvVZzfD (its own canvas; the cart canvas is unchanged)

## Wishlist — APPROVED by the owner (28 Nov 2026), loaded + empty
- Same look as the approved cart (A). Shop name on each card; price uses the checkout rule
  (fixes the current full-price bug); Add to cart; sold-out items greyed with "Find similar".
- Discount badge = the app's product-card badge: red #EF4444, white "NN% OFF". Sold out: dark grey.
- No "price dropped" label or filter (owner: nothing that isn't a real feature). Filters: All / In stock.
- Empty: heart card + Start shopping, then "Popular right now" (with % OFF badges and save hearts).

## Profile — three plain (monochrome) options, awaiting the owner's pick
Built from the desktop profile (Profile.tsx): name, email, "{role} Account", Settings + Logout,
Profile · Orders · Settings (Personal Information form; Order History "Order #… / View Details";
Change Password, Email Notifications).
- A: plain list.
- B: desktop tabs (interactive), closest to desktop.
- C: plain summary (Orders/Wishlist counts, recent orders, account rows).
Desktop pages unchanged.
