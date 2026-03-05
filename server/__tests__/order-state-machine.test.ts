import { assertCanTransition, getAllowedTransitions } from "../services/orderStateMachine";

async function run() {
  const baseOrder: any = {
    id: "o-1",
    status: "delivering",
    paymentStatus: "completed",
    riderId: "r-1",
  };

  // Canonicalization: legacy "delivering" should behave as "en_route".
  const allowedForRider = getAllowedTransitions(baseOrder, "rider");
  if (!allowedForRider.includes("delivered")) {
    throw new Error("Expected rider to be allowed to move delivering/en_route -> delivered");
  }

  // Guard: invalid transition should fail.
  const invalid = assertCanTransition({
    order: { ...baseOrder, status: "pending", paymentStatus: "pending" },
    targetStatus: "delivered",
    actorId: "r-1",
    actorRole: "rider",
  });
  if (invalid.valid) {
    throw new Error("Expected pending -> delivered to be rejected");
  }

  const sellerReady = assertCanTransition({
    order: { ...baseOrder, status: "processing", paymentStatus: "completed", riderId: null },
    targetStatus: "ready",
    actorId: "s-1",
    actorRole: "seller",
  });
  if (!sellerReady.valid) {
    throw new Error("Expected processing -> ready to be allowed for seller");
  }

  console.log("✅ order-state-machine.test passed");
}

run().catch((err) => {
  console.error("❌ order-state-machine.test failed", err);
  throw err;
});
