import { withPermanentMultiVendor } from "../../shared/marketplaceMode";

async function run() {
  const settings = { isMultiVendor: false, primaryColor: "#009688", shopDisplayMode: "by-category", bannerId: "example" };
  const result = withPermanentMultiVendor(settings);
  if (result.isMultiVendor !== true) throw new Error("Single-store mode must never activate");
  if (settings.isMultiVendor !== false) throw new Error("The input must not be mutated");
  if (result.primaryColor !== "#009688" || result.shopDisplayMode !== "by-category" || result.bannerId !== "example") {
    throw new Error("Marketplace enforcement must not change colours, banners, or discovery");
  }
  const update = withPermanentMultiVendor({ isMultiVendor: false });
  if (update.isMultiVendor !== true) throw new Error("Legacy requests must be overridden");
  const food = withPermanentMultiVendor({ restaurantsEnabled: true });
  if (food.restaurantsEnabled !== false) throw new Error("Fashion-only: restaurants must never activate");
  console.log("marketplace-mode-locked.test passed");
}
run().catch(err => { console.error(err); process.exitCode = 1; });
