/**
 * Scales a human-written amount such as "1½ cups", "200 g", "¾ cup" or
 * "2 fillets (≈200 g each)" by a factor. Only the leading quantity is scaled;
 * amounts without one ("to taste", "handful", "pinch") are returned unchanged.
 */
const FRACTIONS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const LEADING = /^(\d+(?:[.,]\d+)?)?(?:\s*([¼½¾⅓⅔⅛]))?(?:\s*\/\s*(\d+))?/;

export function parseLeadingQuantity(amount: string): { value: number; length: number } | null {
  const m = LEADING.exec(amount.trim());
  if (!m || (!m[1] && !m[2])) return null;
  let value = m[1] ? parseFloat(m[1].replace(',', '.')) : 0;
  if (m[2]) value += FRACTIONS[m[2]];
  if (m[3] && m[1] && !m[2]) value = parseFloat(m[1]) / parseInt(m[3], 10); // "1/2"
  return { value, length: m[0].length };
}

export function formatQuantity(value: number): string {
  const whole = Math.floor(value + 1e-9);
  const rest = value - whole;
  const candidates: [string, number][] = [['', 0], ['¼', 0.25], ['⅓', 1 / 3], ['½', 0.5], ['⅔', 2 / 3], ['¾', 0.75], ['', 1]];
  // Large quantities (grams, ml) read better rounded.
  if (value >= 20) return String(Math.round(value / 5) * 5);
  if (value >= 5) return String(Math.round(value));
  const [sym, frac] = candidates.reduce((best, c) => (Math.abs(c[1] - rest) < Math.abs(best[1] - rest) ? c : best));
  const w = whole + (frac === 1 ? 1 : 0);
  if (!sym) return String(w || (value > 0 ? '¼' : '0'));
  return w ? `${w}${sym}` : sym;
}

export function scaleAmount(amount: string | undefined, factor: number): string | undefined {
  if (!amount || factor === 1) return amount;
  const trimmed = amount.trim();
  const q = parseLeadingQuantity(trimmed);
  if (!q) return amount;
  const scaled = q.value * factor;
  let rest = trimmed.slice(q.length);
  if (q.value <= 1 && scaled > 1) rest = rest.replace(/^(\s*)([a-z]+)/i, (m, sp: string, word: string) => sp + pluralUnit(word));
  if (q.value > 1 && scaled <= 1) rest = rest.replace(/^(\s*)([a-z]+)/i, (m, sp: string, word: string) => sp + singularUnit(word));
  return `${formatQuantity(scaled)}${rest}`;
}

const COUNTABLE = ['cup', 'clove', 'can', 'fillet', 'head', 'stalk', 'sheet', 'leaf', 'slice', 'stick', 'sprig', 'bunch'];

function pluralUnit(word: string): string {
  const w = word.toLowerCase();
  if (w === 'leaf') return 'leaves';
  if (w === 'bunch') return 'bunches';
  return COUNTABLE.includes(w) ? `${word}s` : word;
}

function singularUnit(word: string): string {
  const w = word.toLowerCase();
  if (w === 'leaves') return 'leaf';
  if (w === 'bunches') return 'bunch';
  return COUNTABLE.includes(w.replace(/s$/, '')) && w.endsWith('s') ? word.slice(0, -1) : word;
}
