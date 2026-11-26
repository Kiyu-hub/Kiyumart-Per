import assert from "node:assert/strict";
import { buildStudioUrl, isStudioUrl } from "../imageStudio";

const orig = "https://res.cloudinary.com/dg3zhn3wv/image/upload/f_auto,q_auto/v1795639767/kiyumart/uploads/abc.jpg";
const s = buildStudioUrl(orig, { width: 2000, height: 3000 });
assert.ok(s.startsWith("https://res.cloudinary.com/dg3zhn3wv/image/upload/e_background_removal/"), s);
assert.ok(s.endsWith("/v1795639767/kiyumart/uploads/abc.jpg"), s);
assert.ok(!s.includes("f_auto,q_auto/v1"), "old transformations dropped");
assert.ok(s.includes("b_white") && s.includes("f_jpg"), "solid white JPEG");
assert.ok(!s.includes("e_upscale"), "no upscale for large photos");
assert.ok(isStudioUrl(s));
assert.equal(buildStudioUrl(s), s, "idempotent");
const small = buildStudioUrl("https://res.cloudinary.com/x/image/upload/v1/a/b.png", { width: 400, height: 500 });
assert.ok(small.includes("/e_upscale/e_background_removal/") && small.endsWith("/v1/a/b.jpg"), small);
assert.equal(buildStudioUrl("https://example.com/a.jpg"), "https://example.com/a.jpg");
console.log("image-studio tests passed");
