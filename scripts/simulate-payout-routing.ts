import {
  isValidGhanaMobileMoneyNumber,
  normalizeGhanaMobileMoneyNumber,
  normalizeGhanaMobileMoneyProvider,
  resolveGhanaMobileMoneyBankCode,
} from "../server/paystack";

type MobileMoneyCase = {
  provider: string;
  mobileNumber: string;
};

const mobileMoneyCases: MobileMoneyCase[] = [
  { provider: "mtn", mobileNumber: "0241234567" },
  { provider: "vod", mobileNumber: "0201234567" },
  { provider: "atl", mobileNumber: "0271234567" },
  { provider: "mtn", mobileNumber: "754576546" },
  { provider: "atm", mobileNumber: "0271234567" },
];

const describeMobileMoneyCase = (testCase: MobileMoneyCase) => {
  const normalizedProvider = normalizeGhanaMobileMoneyProvider(testCase.provider);
  const normalizedNumber = normalizeGhanaMobileMoneyNumber(testCase.mobileNumber);
  return {
    input: testCase,
    normalizedProvider,
    normalizedNumber,
    bankCode: resolveGhanaMobileMoneyBankCode(normalizedProvider),
    isValid: isValidGhanaMobileMoneyNumber(normalizedNumber, normalizedProvider),
  };
};

const calculateSellerShareKobo = (subtotal: number, couponDiscount: number, commissionRate: number) => {
  const merchandiseNet = Math.max(0, subtotal - couponDiscount);
  return Math.round(Math.max(0, merchandiseNet * (100 - commissionRate) / 100) * 100);
};

const bankSplitSimulation = {
  subtotal: 250,
  couponDiscount: 20,
  commissionRate: 12,
};

const bankSellerShareKobo = calculateSellerShareKobo(
  bankSplitSimulation.subtotal,
  bankSplitSimulation.couponDiscount,
  bankSplitSimulation.commissionRate,
);

console.log("=== MOBILE MONEY ROUTING SIMULATION ===");
for (const testCase of mobileMoneyCases) {
  console.log(JSON.stringify(describeMobileMoneyCase(testCase), null, 2));
}

console.log("=== BANK SPLIT SIMULATION ===");
console.log(JSON.stringify({
  ...bankSplitSimulation,
  sellerShareKobo: bankSellerShareKobo,
  sellerShareGhs: (bankSellerShareKobo / 100).toFixed(2),
  platformCommissionGhs: (((bankSplitSimulation.subtotal - bankSplitSimulation.couponDiscount) * bankSplitSimulation.commissionRate) / 100).toFixed(2),
}, null, 2));
