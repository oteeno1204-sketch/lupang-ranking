# 루팡 길드 앱 v2.2

> **v4.1 초대코드 안내 (2026-08-27)**
> 신규 회원가입은 길드장/관리자가 발급하는 **숫자 4자리 길드 초대코드 1개**로 계정 생성과 길드 가입을 동시에 처리합니다. 기존 `INVITE_CODE`/`ADMIN_CODE` 기반 가입 절차는 레거시 문서이며 새 배포에는 사용하지 않습니다. 운영 배포 절차는 `docs/V41_FOUR_DIGIT_INVITES_DEPLOY.md`를 따르세요.

> **v5.0 길드 운영 안내 (2026-08-28)**
> 최초 길드장은 프로필 ID 대신 일회용 4자리 owner 코드로 등록하며, 최고관리자 길드 비활성화·복구·영구 삭제와 APK 전용 길드원 전체 투력 갱신 배포는 [`docs/V50_GUILD_LIFECYCLE_AND_BULK_SYNC_DEPLOY.md`](./docs/V50_GUILD_LIFECYCLE_AND_BULK_SYNC_DEPLOY.md)를 따르세요.


## 빠른 APK 빌드

APK용 EAS 설정이 이미 포함되어 있습니다. 처음 한 번 `eas login`과 EAS의 `preview` 환경변수 등록을 마친 뒤 아래 명령으로 APK를 만들 수 있습니다.

```bash
eas build -p android --profile preview
```

자세한 APK 빌드 순서는 [`BUILD_APK.md`](./BUILD_APK.md), v2.2 적용 순서는 [`V22_SETUP.md`](./V22_SETUP.md)를 확인하세요.

Android와 iPhone을 한 코드베이스로 지원하는 길드 전용 앱 v2.2입니다. 승인된 딥 네이비 + 골드/크림 프리미엄 길드 UI를 기준으로 만들었고, 다음 기능이 실제 데이터와 연결되도록 설계되어 있습니다.

- 숫자 4자리 길드 초대코드 + 닉네임 + 4자리 PIN으로 계정 생성과 길드 가입 동시 처리
- 길드원용/member 코드와 길드 관리자용/admin 코드를 길드장·관리자가 별도로 발급
- 앱 재실행 후 로그인 세션 유지
- 공지 목록/상세 및 관리자 작성·수정·삭제
- 일정 목록/상세 및 관리자 작성·수정·삭제
- 홈 대시보드 / 마이페이지 / 로그아웃
- 길드 제안·앨범·전체/1:1 채팅·길드원·다중 캐릭터·투력 관리가 실제 Supabase 데이터와 연결됨
- 캐릭터 서버는 아이라로 고정하고, 캐릭터명으로 공식 랭킹을 조회해 직업·전투력·생활력·매력·종합 점수를 날짜별로 기록
- 종합/전투력/생활력/매력 4개 성장 그래프 및 공식 홈페이지 즉시 갱신
- Android edge-to-edge 하단 내비게이션 영역까지 Safe Area 여백 적용
- 관리자 길드원 내보내기, 길드 마크/설정, 실제 활성 회원 수 연동
- 프로필 커버 사진, 앨범 전체화면 보기와 댓글 기능
- 공식 랭킹 조회는 앱 내부 WebView의 공식 사이트 세션에서 수행

## 기술 스택

- Expo / React Native / TypeScript / Expo Router
- TanStack Query / Zustand / Expo SecureStore
- Supabase PostgreSQL / Edge Functions
- bcryptjs PIN 해시 + 서버 전용 opaque session token

## 1. 앱 의존성 설치

Node.js 20 이상을 권장합니다.

```bash
npm install
```

Expo 버전 정합성 확인:

```bash
npx expo install --check
```

## 2. 로컬 Supabase 준비

Supabase CLI와 Docker가 필요합니다.

```bash
supabase start
supabase db reset
supabase secrets set SESSION_TOKEN_PEPPER='a-long-random-secret'
supabase secrets set GUILD_INVITE_HASH_SECRET='another-long-random-secret'
supabase functions serve api --no-verify-jwt
```

`supabase/config.toml`에도 `api` 함수의 `verify_jwt = false`가 설정되어 있습니다. 이 앱은 Supabase Auth JWT 대신 서버가 직접 검증하는 opaque session token을 사용하기 때문에, Edge Function gateway의 JWT 검증을 끄고 함수 내부에서 세션을 검증합니다.

> `SESSION_TOKEN_PEPPER`, `GUILD_INVITE_HASH_SECRET`, PIN은 클라이언트 `.env`에 넣지 않습니다. v4.1 초대코드는 길드 관리 화면에서 4자리로 발급되며 DB에는 원문 대신 해시만 저장합니다. PIN도 bcrypt 해시만 DB에 저장합니다. 기존 `INVITE_CODE`/`ADMIN_CODE`는 v4.0 레거시 가입 secret이며 v4.1 신규 회원가입에서는 사용하지 않습니다.

## 3. 클라이언트 환경 변수

`.env.example`을 `.env`로 복사합니다.

```dotenv
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=replace-with-local-anon-key
```

로컬 Supabase의 anon key는 `supabase status`에서 확인할 수 있습니다.

실제 스마트폰에서 테스트할 때 `127.0.0.1`은 스마트폰 자신을 가리킵니다. 같은 Wi-Fi에서 개발 PC의 LAN IP를 사용하거나, 접근 가능한 Supabase 개발 URL을 사용하세요.

## 4. 앱 실행

```bash
npm start
```

Android:

```bash
npm run android
```

iOS(macOS + Xcode):

```bash
npm run ios
```

Expo Go로 확인할 경우 QR 코드를 스캔해 실행할 수 있습니다. 네이티브 모듈 버전이 Expo Go와 맞지 않으면 development build를 사용하세요.

## 5. 테스트

클라이언트/Jest:

```bash
npm test
npm run typecheck
```

Edge Function/Deno:

```bash
SESSION_TOKEN_PEPPER=test-pepper deno test supabase/functions/api/tests --allow-env
```

## 6. 인증/권한 수동 검증

관리자 가입(`admin` 타입 4자리 코드 사용):

```bash
curl -s http://127.0.0.1:54321/functions/v1/api/register \
  -H 'content-type: application/json' \
  -d '{"inviteCode":"1234","nickname":"관리자테스트","pin":"1234"}'
```

일반 회원 가입(`member` 타입 4자리 코드 사용):

```bash
curl -s http://127.0.0.1:54321/functions/v1/api/register \
  -H 'content-type: application/json' \
  -d '{"inviteCode":"5678","nickname":"회원테스트","pin":"1234"}'
```

응답의 `data.token`을 사용해 다음을 확인합니다.

- 일반 회원 token으로 `POST /notices` → HTTP 403
- 관리자 token으로 `POST /notices` → HTTP 201
- 생성 공지가 `GET /notices`에서 조회됨
- 일정도 일반 회원 POST → 403, 관리자 POST → 201

예시:

```bash
curl -i http://127.0.0.1:54321/functions/v1/api/notices \
  -X POST \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer YOUR_OPAQUE_SESSION_TOKEN' \
  -d '{"title":"길드 공지","body":"테스트 공지입니다.","isImportant":true}'
```

## 7. 세션 유지 smoke test

Android와 iOS 각각에서:

1. 가입 또는 로그인
2. 홈 진입 확인
3. 앱 완전 종료
4. 앱 다시 실행
5. 로그인 화면 없이 홈 진입하는지 확인
6. 로그아웃
7. 앱 재실행 시 로그인 화면으로 가는지 확인

세션 token은 `Expo SecureStore`의 `lupang.sessionToken` 키에만 보관합니다. PIN은 디바이스에 저장하지 않습니다.

## 8. 화면 크기 확인

다음 폭을 권장합니다.

- iPhone SE급 작은 화면
- 일반 iPhone
- Android 360dp
- Android 412dp

확인 항목:

- Safe Area 침범 없음
- 긴 공지 제목이 카드 밖으로 넘치지 않음
- 360dp 이하 홈 카드가 1열로 전환
- 그보다 넓은 일반 스마트폰에서 2열 카드 유지
- 버튼 터치 영역이 잘리지 않음

## 9. Expo doctor / native smoke check

```bash
npx expo-doctor
npx expo prebuild --clean --no-install
```

`android/`, `ios/` 폴더는 managed workflow를 유지하기 위해 Git에 커밋하지 않습니다.

## 10. Edge Function 배포

```bash
npx supabase@latest secrets set SESSION_TOKEN_PEPPER='your-production-random-secret' --project-ref cqvwdehrsycjjuluxmxr
npx supabase@latest secrets set GUILD_INVITE_HASH_SECRET='your-production-random-invite-hash-secret' --project-ref cqvwdehrsycjjuluxmxr
npx supabase@latest functions deploy api --project-ref cqvwdehrsycjjuluxmxr --no-verify-jwt
```

클라이언트의 `EXPO_PUBLIC_SUPABASE_URL`과 `EXPO_PUBLIC_SUPABASE_ANON_KEY`를 운영 프로젝트 값으로 바꾼 뒤 Android/iOS 빌드를 진행합니다.

## v1 데이터 구조

- `profiles` — 닉네임, PIN hash, member/admin role, 로그인 잠금 정보
- `app_sessions` — raw token이 아닌 SHA-256 + server pepper token hash와 만료/폐기 정보
- `notices` — 공지
- `schedules` — 일정

모든 테이블은 RLS가 켜져 있으며 v1에서는 anon/authenticated 직접 DB 정책을 열지 않습니다. 데이터 접근은 service role을 가진 Edge Function을 통해서만 수행합니다.

# v2 기능 확장

v2는 기존 로그인/공지/일정에 아래 기능을 추가합니다.

- 길드 제안: 모든 길드원 작성, 참가/취소, 인원 제한, 작성자/관리자 관리
- 길드 앨범: 사진 최대 10장, 글, 좋아요, 작성자/관리자 관리
- 길드 채팅: 전체 길드방 + 1:1 채팅, 텍스트/사진, 읽지 않은 메시지 표시
- 길드원/개인공간: 프로필 사진/소개, 여러 캐릭터, 대표 캐릭터
- 투력 관리: 날짜별 기록, 최근 변화량, 성장 그래프, 대표 캐릭터 기준 길드 순위
- 푸시 알림: 새 공지, 새 일정, 새 1:1 메시지

## 기존 lupine2에 v2 적용

이 프로젝트가 사용하는 Supabase 프로젝트 ref는 `cqvwdehrsycjjuluxmxr`입니다.

```powershell
npx supabase login
npx supabase link --project-ref cqvwdehrsycjjuluxmxr
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy api --no-verify-jwt
```

`INVITE_CODE`/`ADMIN_CODE`는 v2~v4.0 당시 사용한 레거시 가입 secret입니다. v4.1 신규 회원가입은 이를 사용하지 않으며 `SESSION_TOKEN_PEPPER`와 `GUILD_INVITE_HASH_SECRET`을 서버 secret으로 유지합니다. secret 값을 클라이언트 파일에 넣지 마세요.

v2 migration은 `supabase/migrations/202608240001_v2_features.sql`입니다. 사진은 private Storage bucket `profiles`, `albums`, `chat`에 저장되고 앱은 Edge Function이 발급하는 signed URL만 사용합니다.

## v2 APK 빌드

v2는 사진/알림 네이티브 모듈이 추가되므로 기존 APK에 OTA만 하는 대신 새 APK를 빌드합니다.

```powershell
npm install
npx expo install --check
eas init
eas build -p android --profile preview --clear-cache
```

`eas init`에서 새 프로젝트를 만들지 말고 기존 `@gomhes-team/lupang-guild-app` 프로젝트에 연결합니다. 기존 EAS 프로젝트의 preview 환경변수 `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`가 그대로 연결돼 있는지 `eas env:list --environment preview`로 확인하세요.

Android 앱 버전은 `0.2.0`, `versionCode`는 `2`입니다. 기존 루팡 APK와 같은 `com.lupang.guild` 패키지와 같은 EAS keystore를 사용하면 기존 앱 위에 업데이트 설치할 수 있습니다.

## 푸시 알림 참고

앱 코드는 Expo Push Token 등록과 딥링크 처리를 포함합니다. 실제 Android 원격 푸시가 도착하려면 해당 EAS 프로젝트에 Android FCM v1 자격 증명이 설정되어 있어야 합니다. 앱 자체 기능은 FCM 설정 전에도 동작하며, 푸시 등록 실패는 앱 실행을 막지 않습니다.

## v4.0 다중 길드 플랫폼

v4.0부터 계정은 한 번에 하나의 활성 길드에 소속되며, 공지·일정·앨범·제안·단체채팅·길드 업로드는 로그인 계정의 현재 길드로 서버에서 분리됩니다. 1:1 채팅은 길드와 무관한 전역 대화로 유지되고, 길드 순위와 모든 길드 캐릭터를 합친 연합 순위를 제공합니다.

운영 배포와 `GUILD_INVITE_HASH_SECRET`, 두 번째 길드 `별빛` 인수 테스트, 롤백 절차는 [`docs/V40_MULTI_GUILD_DEPLOY.md`](./docs/V40_MULTI_GUILD_DEPLOY.md)를 따르세요.
