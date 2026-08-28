export function buildMobiLifeRankingUrl(characterName) {
  const url = new URL('https://mabimobi.life/ranking');
  url.searchParams.set('character_name', String(characterName ?? '').trim());
  url.searchParams.set('sort_by', 'total');
  url.searchParams.set('sort_order', 'desc');
  return url.toString();
}
