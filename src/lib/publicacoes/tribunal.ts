export function tribunalFromFonte(fonte: string): string {
  const prefix = 'dje-';
  const lower = fonte.toLowerCase();
  if (!lower.startsWith(prefix)) return '—';
  const resto = fonte.slice(prefix.length).trim();
  return resto ? resto.toUpperCase() : '—';
}
