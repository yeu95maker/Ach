/** Small text helpers shared by provider mappers. */

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

/** Turns a block of instructions into clean steps, dropping "STEP 1" headers and leading numbering. */
export function splitSteps(text: string): string[] {
  const lines = text
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^(step\s*)?\d+[.):-]?$/i.test(l))
    .map((l) => l.replace(/^(?:step\s*\d+\s*[:.)-]?\s*|\d+\s*[.)]\s+|[-•▪]\s+)/i, '').trim())
    .filter((l) => l.length > 1);
  // One long paragraph: split into sentences and pair them up so steps stay readable.
  if (lines.length === 1 && lines[0].length > 280) {
    const sentences = lines[0].match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? lines;
    const steps: string[] = [];
    for (let i = 0; i < sentences.length; i += 2) steps.push(sentences.slice(i, i + 2).join(' '));
    return steps;
  }
  return lines;
}

export function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
