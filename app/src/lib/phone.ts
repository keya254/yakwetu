/** Kenyan numbers typed as 07…, 01…, 254… or +254… become +2547…/+2541…; anything else is kept as typed. */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/[\s-]/g, "");
  if (/^0[17]\d{8}$/.test(digits)) return `+254${digits.slice(1)}`;
  if (/^254[17]\d{8}$/.test(digits)) return `+${digits}`;
  return digits;
}

export function validPhone(phone: string): boolean {
  return /^\+\d{9,15}$/.test(phone);
}
