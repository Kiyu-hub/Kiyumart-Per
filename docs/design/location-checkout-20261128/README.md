# Phone delivery details & checkout — proposal (28 Nov 2026)

Canvas: https://claude.ai/artifact/G1UMuMSmSE4Cajm6BhYLTS — awaiting owner approval. Nothing in the app has changed yet.

- **Location** — map (only when the admin's `showCheckoutDeliveryMap` is on), "Use my current location", detected area/town/region, optional house/landmark, delivery option, phone, Save.
- **LocationPickup** — Pickup selected while no pickup points exist yet: empty state until an admin adds them; Save is off.
- **LocationNoMap** — admin has turned the map off: detect + search instead.
- **LocationRiders** — own riders on (`isExternalRiderSystemEnabled` false): Rider delivery with the zone fee matched from the location, or Pickup.
- **CheckoutNoAddress / Checkout / OrderPlaced** — checkout shows the saved details with Change; Pay stays off until details exist; per-shop coupons, delivery "Confirmed after checkout", Paystack charges as in the approved cart.

Fields map to existing checkout state: deliveryAddress, deliveryLat/Lng, deliveryMethod, externalDeliveryType, selectedPickupStationId, selectedZoneId, deliveryPhone.

## Owner feedback round 1 (28 Nov)
- Map is the app's own map (Esri satellite tiles, Leaflet controls). Not draggable, no movable pin: tapping "Use my current location" centres it on the buyer.
- Delivery wording (round 2): the shop arranges delivery (Yango, Bolt, Uber, bus or rider); the customer pays the driver for delivery when the parcel arrives.
- Pickup points stay empty until an admin adds them.
- Added **TrackOrder**: status timeline (Order placed → Preparing delivery → Packaged → On the way → Completed), delivery fee "To be confirmed", deliver-to, items, payment, help button.
