export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-GB');
}
