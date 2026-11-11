/** GST state / UT codes (first two digits of a GSTIN). */
export const STATES: ReadonlyArray<readonly [code: string, name: string]> = [
  ["01", "Jammu and Kashmir"],
  ["02", "Himachal Pradesh"],
  ["03", "Punjab"],
  ["04", "Chandigarh"],
  ["05", "Uttarakhand"],
  ["06", "Haryana"],
  ["07", "Delhi"],
  ["08", "Rajasthan"],
  ["09", "Uttar Pradesh"],
  ["10", "Bihar"],
  ["11", "Sikkim"],
  ["12", "Arunachal Pradesh"],
  ["13", "Nagaland"],
  ["14", "Manipur"],
  ["15", "Mizoram"],
  ["16", "Tripura"],
  ["17", "Meghalaya"],
  ["18", "Assam"],
  ["19", "West Bengal"],
  ["20", "Jharkhand"],
  ["21", "Odisha"],
  ["22", "Chhattisgarh"],
  ["23", "Madhya Pradesh"],
  ["24", "Gujarat"],
  ["26", "Dadra and Nagar Haveli and Daman and Diu"],
  ["27", "Maharashtra"],
  ["29", "Karnataka"],
  ["30", "Goa"],
  ["31", "Lakshadweep"],
  ["32", "Kerala"],
  ["33", "Tamil Nadu"],
  ["34", "Puducherry"],
  ["35", "Andaman and Nicobar Islands"],
  ["36", "Telangana"],
  ["37", "Andhra Pradesh"],
  ["38", "Ladakh"],
  ["97", "Other Territory"],
];

const BY_CODE = new Map(STATES.map(([c, n]) => [c, n]));

/** UTs without a legislature charge UTGST instead of SGST. */
export const UT_WITHOUT_LEGISLATURE = new Set(["04", "26", "31", "35", "38"]);

export const stateName = (code: string | null | undefined) => (code && BY_CODE.get(code)) || "";
export const isStateCode = (code: string | null | undefined) => !!code && BY_CODE.has(code);
export const stateLabel = (code: string) => `${code} - ${stateName(code)}`;

/** Label to print for the state component of intra-state tax. */
export const sgstLabel = (stateCode: string) => (UT_WITHOUT_LEGISLATURE.has(stateCode) ? "UTGST" : "SGST");
