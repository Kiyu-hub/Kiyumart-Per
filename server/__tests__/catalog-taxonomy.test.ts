import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CATALOG_DEPARTMENTS, FASHION_SUBCATEGORIES, PROTECTED_FASHION_BANNER_SLUGS } from "../../shared/catalogTaxonomy";

assert.equal(CATALOG_DEPARTMENTS.length, 27);
assert.equal(FASHION_SUBCATEGORIES.length, 20);
assert.equal(new Set(CATALOG_DEPARTMENTS.map(d=>d.slug)).size, CATALOG_DEPARTMENTS.length, "Department slugs must be unique");
assert.equal(new Set(FASHION_SUBCATEGORIES.map(d=>d.slug)).size, FASHION_SUBCATEGORIES.length, "Subcategory slugs must be unique");

const liveDepartments=CATALOG_DEPARTMENTS.filter(d=>d.enabledByDefault);
assert.deepEqual(liveDepartments.map(d=>d.slug), ["clothing"], "Only Clothing & Fashion should launch");
assert.ok(CATALOG_DEPARTMENTS.every(d=>!d.enabledByDefault || d.launchReady), "Enabled departments must be launch-ready");

for(const slug of PROTECTED_FASHION_BANNER_SLUGS) {
  assert.ok(FASHION_SUBCATEGORIES.some(c=>c.slug===slug), `Banner slug ${slug} must exist`);
}
for(const c of FASHION_SUBCATEGORIES) {
  assert.ok(c.image.startsWith("/attached_assets/"), "Fashion cover images must be version-controlled app assets");
  const relative=c.image.replace(/^\//,"");
  assert.ok(fs.existsSync(path.resolve(process.cwd(),relative)), `Cover image missing: ${relative}`);
}

console.log("catalog-taxonomy.test passed");
