import {
  MASKED_SUPPORT_NAME,
  resolveSupportDisplayName,
  shouldMaskSupportIdentityForViewer,
} from "../services/supportMessagingService";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  assert(
    shouldMaskSupportIdentityForViewer({ senderRole: "admin", viewerRole: "buyer" }) === true,
    "Expected admin identity to be masked for buyers"
  );
  assert(
    shouldMaskSupportIdentityForViewer({ senderRole: "super_admin", viewerRole: "seller" }) === true,
    "Expected super admin identity to be masked for sellers"
  );
  assert(
    shouldMaskSupportIdentityForViewer({ senderRole: "admin", viewerRole: "agent" }) === false,
    "Expected support staff viewers to see real admin identity"
  );

  const masked = resolveSupportDisplayName({
    senderRole: "admin",
    senderName: "Platform Admin",
    viewerRole: "buyer",
  });
  assert(masked === MASKED_SUPPORT_NAME, "Expected masked support display name");

  const unmasked = resolveSupportDisplayName({
    senderRole: "agent",
    senderName: "Support Agent A",
    viewerRole: "buyer",
  });
  assert(unmasked === "Support Agent A", "Expected non-admin support names to remain visible");

  console.log("support-messaging-service.test passed");
}

run().catch((err) => {
  console.error("support-messaging-service.test failed", err);
  throw err;
});
