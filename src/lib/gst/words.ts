const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const two = (n: number) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""));
const three = (n: number) => {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? ONES[h] + " Hundred" : "", r ? two(r) : ""].filter(Boolean).join(" ");
};

/** Integer to words using the Indian system (thousand, lakh, crore). */
export function intToWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1e3;
  if (crore) parts.push(intToWords(crore) + " Crore");
  if (lakh) parts.push(two(lakh) + " Lakh");
  if (thousand) parts.push(two(thousand) + " Thousand");
  if (rest) parts.push(three(rest));
  return parts.join(" ");
}

/** Amount (in paise) to words, e.g. 12550 -> "Rupees One Hundred Twenty Five and Fifty Paise Only". */
export function paiseToWords(paise: number): string {
  const p = Math.abs(Math.round(paise));
  const rupees = Math.floor(p / 100);
  const rem = p % 100;
  let words = "Rupees " + intToWords(rupees);
  if (rem) words += " and " + two(rem) + " Paise";
  return words + " Only";
}
