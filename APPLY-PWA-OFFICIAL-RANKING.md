# PWA 공식 넥슨 랭킹 조회 수정

## 원인
현재 Render `lupang-ranking` 운영 저장소의 `src/lookup.mjs`가 `mabimobi.life` API를 호출하고 있어 403 응답으로 PWA 랭킹 조회가 실패합니다.
APK는 앱 내부 WebView에서 넥슨 공식 랭킹 페이지를 직접 조회하므로 정상 동작합니다.

## 수정 내용
이 패키지는 PWA 중계 서버가 아래 순서로 공식 넥슨 랭킹을 조회하도록 변경한 버전입니다.

1. Chromium/Playwright로 `https://mabinogimobile.nexon.com/Ranking/List?t=4` 접속
2. 페이지 내부 same-origin 컨텍스트에서 `POST /Ranking/List/rankdata`
3. 캐릭터명 검색
4. 아이라 서버 정확 일치 확인
5. 전투력/생활력/매력/종합 점수 파싱
6. 기존 PWA `/lookup` 응답 형식으로 반환

APK 쪽 코드는 변경하지 않습니다.

## GitHub/Render 적용
대상 저장소: `oteeno1204-sketch/lupang-ranking`

이 압축의 파일들을 저장소 루트에 그대로 덮어씁니다. 특히 아래 3개는 반드시 교체되어야 합니다.

- `src/lookup.mjs`
- `package.json`
- `Dockerfile`

그리고 `src/parser.mjs`, `src/server.mjs`, `src/contracts.mjs`, `test/`도 함께 올리는 것을 권장합니다.

main 브랜치에 커밋/푸시하면 현재 Render 서비스는 Auto Deploy가 켜져 있으므로 새 배포가 자동 시작됩니다.

## 정상 배포 확인
Render 로그에서 더 이상 아래 문구가 나오면 안 됩니다.

- `mobilife direct api failed`
- `GTFO`

대신 서비스가 시작된 뒤 PWA에서 캐릭터 갱신을 누르면 `/lookup` 요청이 들어와야 합니다.

## 테스트
이 패키지에서 실행:

```powershell
npm install
npm test
```

현재 포함 테스트는 공식 넥슨 브라우저 조회 구조와 파서를 검증합니다.
