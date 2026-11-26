import assert from "node:assert/strict";
import {
  canTransitionFashionRequest,
  depositDuePesewas,
  nextFashionPaymentPesewas,
  validServiceType,
  validateFashionImages,
} from "../../shared/fashionServiceRules";

assert.equal(validServiceType("tailoring"), true);
assert.equal(validServiceType("custom_design"), true);
assert.equal(validServiceType("unapproved-service"), false);

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

console.log("fashion-service-rules.test passed");
