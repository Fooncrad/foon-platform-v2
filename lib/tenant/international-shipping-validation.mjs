/** Validate country codes against the platform catalogue before any cross-border approval. */
export function normalizeForeignCountries(value, merchantCountry, supportedCountryCodes) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 80 ||
      typeof merchantCountry !== 'string' || !supportedCountryCodes.has(merchantCountry.toUpperCase())) return null;
  const local = merchantCountry.toUpperCase();
  const foreign = new Set();
  for (const country of value) {
    if (typeof country !== 'string' || !/^[A-Z]{2}$/.test(country) || !supportedCountryCodes.has(country)) return null;
    if (country !== local) foreign.add(country);
  }
  return [...foreign];
}

/** Stored JSON must be validated again; a malformed or legacy value must never grant delivery access. */
export function parseRequestedForeignCountries(value, merchantCountry, supportedCountryCodes) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return normalizeForeignCountries(parsed, merchantCountry, supportedCountryCodes);
  } catch {
    return null;
  }
}
