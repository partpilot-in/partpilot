export function partLookupPath(part: { mpn: string; manufacturer?: string }) {
  const params = new URLSearchParams({ mpn: part.mpn });
  if (part.manufacturer) params.set("manufacturer", part.manufacturer);
  return `/parts/lookup?${params.toString()}`;
}
