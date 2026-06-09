const MAX_CHUNK = 500;

export function splitIntoChunks(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const parts =
      paragraph.length > MAX_CHUNK
        ? splitByLength(paragraph, MAX_CHUNK)
        : [paragraph];
    for (const part of parts) {
      const candidate = current ? `${current}\n\n${part}` : part;
      if (candidate.length > MAX_CHUNK && current.length > 0) {
        chunks.push(current);
        current = part;
      } else {
        current = candidate;
      }
    }
  }

  if (current.trim().length > 0) chunks.push(current.trim());
  if (chunks.length === 0 && text.trim().length > 0) {
    return splitByLength(text.trim(), MAX_CHUNK);
  }
  return chunks;
}

function splitByLength(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + maxLen, text.length);
    let breakAt = end;
    if (end < text.length) {
      const nextPeriod = text.indexOf("。", i + maxLen - 50);
      if (nextPeriod > 0 && nextPeriod < i + maxLen + 50) {
        breakAt = nextPeriod + 1;
      }
    }
    chunks.push(text.slice(i, breakAt).trim());
    i = breakAt;
  }
  return chunks.filter((chunk) => chunk.length > 0);
}
