export const RAZORPAY_TEST_CARD = {
  network: "Domestic Mastercard",
  number: "5267 3181 8797 5449",
  expiry: "Any future month/year",
  cvv: "Any 3 digits",
  mockOtp: "Exactly 4 digits, for example 1234",
} as const;

export const RAZORPAY_TEST_NETBANKING = {
  method: "Netbanking",
  instruction: "Choose any listed bank, then select Success on Razorpay’s mock bank page.",
} as const;

export const RAZORPAY_TEST_UPI = {
  method: "UPI",
  successId: "success@razorpay",
} as const;

export function isRazorpayTestKey(keyId: string | null | undefined) {
  return Boolean(keyId?.startsWith("rzp_test_"));
}

export function paymentAmountMessage(amountRupees: number) {
  return Number.isFinite(amountRupees) && amountRupees >= 1 && amountRupees <= 5000
    ? null
    : "Enter an amount between ₹1 and ₹5,000 before opening Razorpay Checkout.";
}
