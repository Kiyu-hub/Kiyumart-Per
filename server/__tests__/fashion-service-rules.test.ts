import assert from "node:assert/strict";
import {
  canTransitionFashionRequest,
  canQuoteFashionRequest,
  fashionRequestListScope,
  depositDuePesewas,
  nextFashionPaymentPesewas,
  validServiceType,
  validateFashionImages,
  validatedPaystackCheckoutUrl,
} from "../../shared/fashionServiceRules";

assert.equal(validServiceType("tailoring"), true);
assert.equal(validServiceType("custom_design"), true);
assert.equal(validServiceType("unapproved-service"), false);

// A seller's own purchases must not be buried in their incoming service requests.
assert.equal(fashionRequestListScope("seller"), "seller");
assert.equal(fashionRequestListScope("seller", "buyer"), "buyer");
assert.equal(fashionRequestListScope("buyer"), "buyer");
assert.equal(fashionRequestListScope("super_admin"), "all");
assert.equal(fashionRequestListScope("super_admin", "buyer"), "buyer");

// A quotation must not overwrite a booking once accepted or paid.
assert.equal(canQuoteFashionRequest("pending", 0), true);
assert.equal(canQuoteFashionRequest("quoted", 0), true);
assert.equal(canQuoteFashionRequest("accepted", 0), false);
assert.equal(canQuoteFashionRequest("quoted", 500), false);
assert.equal(canQuoteFashionRequest("cancelled", 0), false);

assert.equal(depositDuePesewas(10001, 50), 5001);
assert.equal(depositDuePesewas(10000, 100), 10000);
assert.throws(() => depositDuePesewas(99, 50));
assert.throws(() => depositDuePesewas(10000, 25));

assert.equal(nextFashionPaymentPesewas(10000, 50, 0), 5000);
assert.equal(nextFashionPaymentPesewas(10000, 50, 5000), 5000);
assert.equal(nextFashionPaymentPesewas(10000, 50, 10000), 0);
assert.throws(() => nextFashionPaymentPesewas(10000, 50, 12000));

assert.equal(canTransitionFashionRequest("accepted", "in_progress", "seller", 4999, 5000), false);
assert.equal(canTransitionFashionRequest("accepted", "in_progress", "seller", 5000, 5000), true);
assert.equal(canTransitionFashionRequest("in_progress", "ready_for_collection", "seller", 5000, 5000), true);
assert.equal(canTransitionFashionRequest("ready_for_collection", "completed", "buyer", 10000, 5000), true);
assert.equal(canTransitionFashionRequest("pending", "completed", "seller", 0, 0), false);
assert.equal(canTransitionFashionRequest("accepted", "cancelled", "buyer", 0, 5000), true);
assert.equal(canTransitionFashionRequest("accepted", "cancelled", "buyer", 5000, 5000), false);

assert.deepEqual(validateFashionImages(["https://example.com/design.png"], 1), ["https://example.com/design.png"]);
assert.throws(() => validateFashionImages(["http://example.com/unsafe.png"], 1));
assert.throws(() => validateFashionImages(["https://example.com/a.png", "https://example.com/b.png"], 1));

// Paystack's API initializes at api.paystack.co but sends buyers to checkout.paystack.com.
assert.equal(validatedPaystackCheckoutUrl("https://checkout.paystack.com/abc123"), "https://checkout.paystack.com/abc123");
assert.equal(validatedPaystackCheckoutUrl("http://checkout.paystack.com/abc123"), null);
assert.equal(validatedPaystackCheckoutUrl("https://checkout.paystack.co/abc123"), null);
assert.equal(validatedPaystackCheckoutUrl("https://checkout.paystack.com.evil.example/abc123"), null);
assert.equal(validatedPaystackCheckoutUrl("https://evil.example/"), null);
assert.equal(validatedPaystackCheckoutUrl("https://user@checkout.paystack.com/abc123"), null);
assert.equal(validatedPaystackCheckoutUrl("https://checkout.paystack.com:8443/abc123"), null);
assert.equal(validatedPaystackCheckoutUrl("not a URL"), null);

console.log("fashion-service-rules.test passed");
