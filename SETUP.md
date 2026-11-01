# 운영 연결 설정

사이트 주소: https://qkqhticyc-lab.github.io/dnjfdkwhdns/

Supabase 프로젝트: public-investment-site / lrmevhhdfmpnclomhsmz / 서울 / 생성 시 월 $0 견적.
DB·공개 클라이언트 키·게시·GitHub 로그인 설정은 완료되어 있습니다. 아래 값은 복구 시 참고용입니다.

## GitHub Pages

1. https://github.com/qkqhticyc-lab/dnjfdkwhdns/settings/pages
2. Build and deployment → Source → GitHub Actions 선택.
3. Actions의 Publish investment note 실행 결과를 확인합니다. 설정 전 실행이 실패했다면 Re-run all jobs를 누릅니다.

## 방문자 GitHub 로그인

1. https://github.com/settings/applications/new 에서 OAuth App 등록:
   - Application name: 투자노트
   - Homepage URL: https://qkqhticyc-lab.github.io/dnjfdkwhdns/
   - Authorization callback URL: https://lrmevhhdfmpnclomhsmz.supabase.co/auth/v1/callback
2. https://supabase.com/dashboard/project/lrmevhhdfmpnclomhsmz/auth/providers 에서 GitHub 활성화. OAuth App의 Client ID 및 Client Secret 입력 후 저장. Secret은 이 저장소나 채팅에 넣지 않습니다.

   Client ID는 https://github.com/settings/developers 의 해당 OAuth App 상세 화면에서 복사합니다. GitHub 계정명·이메일·저장소 이름을 넣지 않습니다. Client Secret도 같은 앱에서 Generate a new client secret으로 발급한 값을 사용합니다.
3. https://supabase.com/dashboard/project/lrmevhhdfmpnclomhsmz/auth/url-configuration 에서 Site URL과 Redirect URLs에 아래 값을 설정:

   https://qkqhticyc-lab.github.io/dnjfdkwhdns/

마지막 `/`까지 포함합니다. 로컬 로그인도 테스트할 때만 Redirect URLs에 http://127.0.0.1:5183/preview/ 를 추가합니다.

## 최종 확인

`npm run check:services -- https://qkqhticyc-lab.github.io/dnjfdkwhdns/`로 댓글 조회·익명 일지 차단·GitHub 제공자 활성화 상태를 확인합니다.

게시된 페이지에서 GitHub 로그인 → 본인에게 허용된 게시판에 일지 저장 → 새로고침 후 재조회 → 로그아웃을 확인합니다. 공개 일지와 댓글은 다른 회원/비로그인도 읽을 수 있고, 수정/삭제는 작성자만 가능합니다. ‘나의 매매일지’ 작성과 계좌 공유 연결은 운영자만, ‘당신들의 매매일지’ 작성은 회원 누구나 가능합니다. 두 페이지 모두 회원 누구나 댓글을 쓸 수 있습니다. 기존 비공개 investment_entries는 계속 회원별 RLS로 보호합니다.

GitHub 인증 화면으로 이동한 뒤 404가 나면 먼저 OAuth App의 Client ID와 Supabase에 저장한 Client ID가 정확히 일치하는지 확인합니다. 제공자 활성화 검사와 GitHub로의 HTTP 302 이동만으로 OAuth App 설정 전체가 유효하다고 판단할 수 없습니다.

국내 수급·주요 지표·종목 차트·신용잔고는 공개 페이지 내부에서 제공합니다. KIS 자동 가져오기는 기존 소유자 전용 앱에서 처리하고 허용된 새 기록의 일부 필드만 공개 일지에 공유합니다. ‘계좌 매매일지 🔒’ 메뉴는 운영자 로그인 때만 맨 마지막에 표시하며 기존 소유자 전용 접근 정책을 유지합니다.

참고: [Supabase GitHub 로그인](https://supabase.com/docs/guides/auth/social-sign-in/auth-github), [GitHub Pages 배포 설정](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
