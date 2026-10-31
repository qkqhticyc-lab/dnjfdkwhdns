# 투자노트

국내·미국 투자자를 위한 시장 화면, 공개 댓글, 회원별 비공개 매매일지입니다. GitHub Pages에 올릴 정적 웹사이트와 Supabase 데이터베이스 설정을 포함합니다.

## 현재 상태

- 화면·입력 처리·저장 권한 SQL·자동 게시 워크플로를 준비했습니다.
- 저장소: https://github.com/qkqhticyc-lab/dnjfdkwhdns
- 게시 주소: https://qkqhticyc-lab.github.io/dnjfdkwhdns/ (배포 및 HTTP 200 확인)
- 서울 리전 Supabase DB, GitHub 로그인 제공자와 Pages를 연결했습니다. 설정값은 [SETUP.md](SETUP.md)에 기록했습니다.
- 연결 전에는 로그인·저장 버튼을 비활성화합니다. 브라우저에만 저장하고 서버 저장으로 표시하지 않습니다.
- 방문자는 시장 화면과 공개 댓글을 로그인 없이 읽고, GitHub 로그인 후 댓글과 자신의 일지를 작성합니다.
- 실제 GitHub 로그인·일지 저장·새로고침 후 유지까지 사용자 확인을 완료했습니다.
- 회원 일지는 직접 작성하는 기록입니다. 기존 한국투자증권 자동 연동은 소유자 전용 Sites 앱에 남아 있고, 이 코드로 이전하지 않았습니다.

## 시장 데이터 범위

TradingView 외부 위젯에서 실제 가격이 표시되는 FOREXCOM:NSXUSD, FOREXCOM:SPXUSD, FX_IDC:USDKRW를 확인했습니다. 미국 지수는 **CFD 가격**으로 표시하며 현물 지수와 구분합니다. 제공처의 갱신·시세 지연 정책을 따릅니다.

코스피·코스닥 지수는 테스트한 위젯에서 제공되지 않았습니다. 현재 국내 지수를 선택하면 네이버페이 증권 원문 링크를 표시합니다. 국내 지수의 사이트 내 자동 갱신은 아직 구현되지 않았으며, 공개 재배포를 허용하는 데이터 제공처 연결이 추가로 필요합니다.

위젯은 TradingView 도메인의 별도 iframe에 넣어 회원 세션이 있는 문서에서 외부 차트 스크립트를 실행하지 않습니다. 출처 표시와 직접 열기 링크를 제공합니다.

## 사이트 내 리포트

‘판단에 앞서, 확인할 자료’는 외부 사이트 바로가기 대신 실제 보고서 목록을 표시합니다.

- 목표주가: 네이버페이 증권 리서치의 종목·증권사·발행일·목표주가·이전 목표주가. 제공처의 해당 증권사 이전 값과 비교하고 값이 없으면 비교 불가로 표시합니다. 다른 증권사 값이나 현재 주가와 섞어 비교하지 않습니다.
- 실적 발표·리뷰: 국내 보고서 중 실적 리뷰를 분류합니다. 실적 수치는 도입부의 실제 기록·발표 문장에서 확인된 경우에만 표시하고, YoY와 QoQ를 구분합니다. 전망·누적 수치와 뒤쪽 자회사 설명은 추출에서 제외합니다. 이는 증권사 보고서 목록이며 자체 작성한 공시 분석 보고서는 아닙니다.
- 해외주식: 연합인포맥스 공개 리포트 목록의 국내 증권사 해외 종목·산업·시황 보고서입니다. 종목명·티커·증권사·제목·발행일·원문 PDF를 표시합니다. 원문에서 검증하지 않은 목표가·현재가를 만들어 넣지 않습니다.
- 날짜·키워드 검색, 분류 필터, 30건씩 더 보기, PC/모바일 화면을 지원합니다. 보고서 제목은 원문으로 연결됩니다.

`npm run collect:research`가 최근 7일 범위에서 국내 최대 200건, 해외 최대 200건을 수집해 `data/research.json`을 만듭니다. 시장 전체 보고서 수가 아니라 수집된 범위의 건수입니다. 상세 본문은 처리 중에만 읽고, 공개 파일에는 짧은 제목과 사실 정보만 저장합니다.

GitHub Actions는 UTC 매시 17분·47분에 수집→검증된 코드 빌드→Pages 배포를 실행하도록 설정했습니다. 실행 지연이 있을 수 있으며, 공개 저장소가 60일간 활동이 없으면 GitHub에서 예약 실행을 중지할 수 있습니다. [GitHub 예약 실행 안내](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

수집 오류는 이전 성공 자료와 원래 수집 시각을 보존합니다. 일부 상세 조회 실패도 표시합니다. 2시간 이상 갱신이 없으면 화면에 갱신 지연을 표시합니다. 브라우저의 ‘다시 불러오기’는 마지막 배포 자료를 다시 읽습니다. 새 수집을 즉시 실행하려면 저장소 Actions에서 Publish investment note → Run workflow를 사용합니다.

수집 결과 캐시는 `.cache/research`이며 공개 API가 변경되면 수집기 수정이 필요합니다. 사용자의 Supabase 로그인·일지 DB는 수집에 사용하지 않습니다.

## 로컬 실행

Node.js 22 이상에서 실행합니다.

```sh
npm ci
npm run build
npm run preview
```

미리보기: http://127.0.0.1:5183/preview/

## 실제 서비스 연결

1. 현재 프로젝트는 GitHub와 Supabase 연결이 완료되었습니다. 새 환경으로 복제할 때만 별도 계정을 연결합니다.
2. 현재 DB에는 supabase/migrations/202610310001_members.sql을 이미 적용했습니다. 다시 실행하지 않습니다. 새 프로젝트를 만들 때만 적용합니다.
3. Supabase Authentication의 GitHub 제공자를 설정합니다. GitHub OAuth App의 callback은 https://PROJECT_REF.supabase.co/auth/v1/callback 입니다. Client Secret은 Supabase 제공자 설정에만 저장합니다.
4. 배포 주소를 Supabase Site URL 및 허용 Redirect URL에 등록합니다. 프로젝트 Pages라면 /REPOSITORY/ 경로와 마지막 /까지 일치시킵니다.
5. site.config.json의 supabase.url과 publishableKey를 채웁니다. publishable/anon 키만 허용하며 service_role 또는 sb_secret_ 키를 넣지 않습니다. authProvider 기본값은 github입니다.
6. 새 GitHub 저장소의 main에 소스를 올리고 Settings → Pages → Source를 GitHub Actions로 선택합니다. .github/workflows/pages.yml이 dist를 게시합니다.
7. 실제 로그인, 새로고침 뒤 기록 유지, 서로 다른 두 계정의 데이터 분리, 공개 댓글 조회/삭제를 최종 확인합니다.

GitHub OAuth는 GitHub 계정을 요구합니다. ChatGPT 계정은 회원 기능에 필요하지 않습니다. 기존 소유자 전용 계좌 연동 일지는 별도 인증을 유지합니다. 다른 로그인 제공자로 바꾸려면 해당 제공자와 로그인 버튼 문구도 함께 설정해야 합니다.

이메일 로그인은 현재 구현하지 않았습니다. Supabase 기본 이메일 발송 기능만으로 일반 방문자에게 가입 메일을 보낼 수 있다고 가정하지 않습니다. 이메일 방식을 추가하면 별도 SMTP 설정을 확인해야 합니다.

## 저장 및 권한

- investment_entries: authenticated 역할만 접근 가능하며 조회·추가·수정·삭제 모두 owner_id = auth.uid()를 데이터베이스 RLS로 강제합니다.
- investment_comments: 누구나 읽고 로그인한 작성자만 추가·삭제할 수 있습니다. 닉네임·본문·작성 시각과 불투명한 작성자 UUID는 공개 데이터입니다. 이메일은 댓글 테이블에 저장하지 않습니다.
- 댓글은 2,000자, 매매 이유는 3,000자, 복기는 5,000자까지입니다. 댓글 삽입 시 작성 시각을 서버에서 정하고 최근 1분 동안 남아 있는 댓글이 5개면 추가를 제한합니다.
- 운영자 삭제는 Supabase 관리 화면에서 가능합니다. 사이트 내 운영자 관리 화면은 아직 없습니다.
- 표시 및 JSON 내보내기는 최근 매매 500건까지입니다. 댓글은 20개 단위로 추가 조회합니다.
- 계좌번호, KIS App Key/App Secret, 체결내역은 공개 저장소에 복사하지 않았습니다.

## 검증

```sh
node tests/permissions.mjs
node tests/browser.mjs
node tests/research-browser.mjs
npm run check:services
# 배포된 설정으로 읽기 전용 점검:
npm run check:services -- https://qkqhticyc-lab.github.io/dnjfdkwhdns/
```

권한 테스트는 PGlite의 실제 PostgreSQL 엔진에서 SQL을 적용하고 anonymous/회원 A/회원 B 역할로 실행합니다. 테스트용 auth 스키마는 실제 Supabase auth.uid() 동작을 모사합니다. 브라우저 테스트에는 Playwright와 Chrome이 필요합니다. PLAYWRIGHT_MODULE에 설치된 Playwright 모듈 경로, CHROME_PATH에 Chrome 경로를 지정할 수 있습니다. 먼저 로컬 미리보기 서버를 실행합니다.

통과 항목: 익명 비공개 접근 차단, 회원 간 조회·수정·삭제·소유자 위조 차단, 자신의 일지 CRUD, 공개 댓글 권한, 삽입 시각·횟수 제한, PC/390px 레이아웃, 설정 미완료 상태, 모의 API를 통한 일지/댓글 입력과 수정·삭제, HTML 입력의 텍스트 표시, 로그아웃 시 기록 제거.

실제 Supabase DB에서도 tests/remote-permissions.sql로 회원별 CRUD, 다른 회원 접근·소유자 위조 차단, 익명 접근 권한을 검증했고 테스트 데이터는 전부 롤백했습니다. Supabase 보안 advisor 경고는 0건입니다. 공개 API의 댓글 조회와 익명 일지 접근 차단도 확인했습니다.

GitHub Actions는 게시 전에 npm test로 DB 권한 및 리포트 정규화·수치 구분·오류 시 자료 보존 테스트를 실행합니다. check:services는 읽기 전용 설정 점검이며 로그인 성공이나 사용자 데이터의 영속 저장까지 보장하지 않습니다. 실제 계정 로그인·저장·재조회는 사용자 직접 확인을 완료했습니다.

배포 후 실제 브라우저에서도 공개 댓글 조회, 익명 입력 잠금, PC/390px 화면과 JavaScript 오류 없음을 확인했습니다. GitHub 로그인 요청은 올바른 Supabase callback을 포함해 GitHub 인증 페이지로 HTTP 302 이동합니다. 로그인 제공자 활성화 점검도 통과했습니다.

## 참고

- [GitHub Pages 워크플로](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Supabase GitHub 로그인 설정](https://supabase.com/docs/guides/auth/social-sign-in/auth-github)
- [Supabase 행 수준 접근 제어](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [TradingView 위젯](https://www.tradingview.com/widget-docs/)
