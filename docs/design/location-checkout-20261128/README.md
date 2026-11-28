# Phone delivery details & checkout — proposal (28 Nov 2026)

Canvas: https://claude.ai/artifact/G1UMuMSmSE4Cajm6BhYLTS — awaiting owner approval. Nothing in the app has changed yet.

- **Location** — map (only when the admin's `showCheckoutDeliveryMap` is on), "Use my current location", detected area/town/region, optional house/landmark, delivery option, phone, Save.
- **LocationPickup** — Pickup selected: pickup point list, pickup phone.
- **LocationNoMap** — admin has turned the map off: detect + search instead.
- **LocationRiders** — own riders on (`isExternalRiderSystemEnabled` false): Rider delivery with the zone fee matched from the location, or Pickup.
- **CheckoutNoAddress / Checkout / OrderPlaced** — checkout shows the saved details with Change; Pay stays off until details exist; per-shop coupons, delivery "Confirmed after checkout", Paystack charges as in the approved cart.

Fields map to existing checkout state: deliveryAddress, deliveryLat/Lng, deliveryMethod, externalDeliveryType, selectedPickupStationId, selectedZoneId, deliveryPhone.
