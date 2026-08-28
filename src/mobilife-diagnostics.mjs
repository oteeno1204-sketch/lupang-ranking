export function isMobiLifeSearchPending(text) {
  const normalized = String(text ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  return /캐릭터\s*검색\s*중|검색\s*중|최신\s*랭킹\s*데이터를\s*검색|최신\s*데이터를\s*가져오고/.test(normalized);
}

export function compactDiagnosticText(text, maxLength = 1200) {
  return String(text ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, Math.max(0, maxLength));
}
