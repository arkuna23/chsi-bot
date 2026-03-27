export function normalizePrefix(value: string): string {
  const normalized = value.trim();
  if (!/^\d{2,6}$/.test(normalized)) {
    throw new Error('prefix must be 2 to 6 digits');
  }
  return normalized;
}

export function getRootPrefix(prefix: string): string {
  return normalizePrefix(prefix).slice(0, 2);
}
