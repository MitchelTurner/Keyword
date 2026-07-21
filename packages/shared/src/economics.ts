/** Pure client/server helpers for assumption sensitivity. */

export function priceFloors(
  avgCpc: number,
  convRate: number,
  ltvCacRatio: number,
): {
  impliedCac: number;
  annualPriceFloor: number;
  monthlyPriceFloor: number;
} {
  const cr = convRate > 0 ? convRate : 0.015;
  const ratio = ltvCacRatio > 0 ? ltvCacRatio : 3;
  const impliedCac = avgCpc / cr;
  const annualPriceFloor = impliedCac / ratio;
  return {
    impliedCac,
    annualPriceFloor,
    monthlyPriceFloor: annualPriceFloor / 12,
  };
}
