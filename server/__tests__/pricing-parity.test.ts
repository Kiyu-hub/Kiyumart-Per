// The price shown to shoppers (phone and desktop) must equal what checkout
// charges: server/routes.ts uses price × (1 − discount / 100). costPrice above
// price is only the crossed-out "was" price.
import { getCurrentSellingPrice, getOriginalDisplayPrice } from "../../client/src/lib/pricing";
import { priceOf, discountOf } from "../../client/src/lib/listing";

const serverCharge = (p: { price: string; discount?: number | null }) =>
  parseFloat(p.price) * (1 - (p.discount || 0) / 100);

const cases = [
  { name: "was-price only (live demo data)", price: "560.00", costPrice: "690.00", discount: 0, was: 690, pct: 19 },
  { name: "percentage discount only", price: "650.00", costPrice: null, discount: 15, was: 650, pct: 15 },
  { name: "no discount", price: "120.00", costPrice: null, discount: 0, was: null, pct: 0 },
  { name: "both set", price: "500.00", costPrice: "800.00", discount: 10, was: 800, pct: 44 },
];

let failures = 0;
const check = (ok: boolean, msg: string) => { if (ok) console.log(`  ✓ ${msg}`); else { failures++; console.error(`  ✗ ${msg}`); } };
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

for (const c of cases) {
  console.log(c.name);
  const charge = serverCharge(c);
  check(near(getCurrentSellingPrice(c), charge), `selling price ${getCurrentSellingPrice(c)} = checkout ${charge}`);
  check(near(priceOf(c), charge), `listing price ${priceOf(c)} = checkout ${charge}`);
  const was = getOriginalDisplayPrice(c);
  if (c.costPrice) check(near(was, parseFloat(c.costPrice)), `was-price shows costPrice ${was}`);
  check(discountOf(c) === c.pct, `badge ${discountOf(c)}% = expected ${c.pct}%`);
}

if (failures) { console.error(`❌ pricing-parity.test failed (${failures})`); process.exit(1); }
console.log("✅ pricing-parity.test passed");
