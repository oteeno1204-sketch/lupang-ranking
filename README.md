# Lupang Ranking Browser Service

A tiny Chromium/Playwright service used only by the Lupang PWA to read the public Mabinogi Mobile ranking page when direct Supabase Edge requests are blocked with HTTP 403.

## Endpoints
- `GET /health`
- `POST /lookup` body: `{ "server": "아이라", "characterName": "히이릴" }`

The service returns public stats only. It has no Supabase credentials and cannot update app data.

## Environment
- `PORT=3000`
- `ALLOWED_ORIGINS=https://lupang.expo.app` (comma separated; defaults also include local Expo web origins)
- `RATE_LIMIT_PER_MINUTE=20`

## Docker
```bash
docker build -t lupang-ranking-browser .
docker run --rm -p 3000:3000 -e ALLOWED_ORIGINS=https://lupang.expo.app lupang-ranking-browser
```
