# 운영 연결 설정

사이트 주소: https://qkqhticyc-lab.github.io/dnjfdkwhdns/

Supabase 프로젝트: public-investment-site / lrmevhhdfmpnclomhsmz / 서울 / 생성 시 월 $0 견적.
DB와 공개 클라이언트 키는 연결되어 있습니다. 아래 두 설정은 플러그인에서 변경하는 기능이 없어 관리 화면에서 완료합니다.

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
3. https://supabase.com/dashboard/project/lrmevhhdfmpnclomhsmz/auth/url-configuration 에서 Site URL과 Redirect URLs에 아래 값을 설정:

   https://qkqhticyc-lab.github.io/dnjfdkwhdns/

마지막 `/`까지 포함합니다. 로컬 로그인도 테스트할 때만 Redirect URLs에 http://127.0.0.1:5183/preview/ 를 추가합니다.

## 최종 확인

`npm run check:services -- https://qkqhticyc-lab.github.io/dnjfdkwhdns/`로 댓글 조회·익명 일지 차단·GitHub 제공자 활성화 상태를 확인합니다.

게시된 페이지에서 GitHub 로그인 → 매매일지 저장 → 새로고침 후 재조회 → 로그아웃을 확인합니다. 별도 GitHub 계정에서는 첫 계정의 일지가 보이지 않아야 합니다. 공개 댓글은 로그아웃 상태에서도 보여야 합니다.

현재 국내 지수는 외부 페이지 링크이고, KIS 자동 가져오기는 기존 소유자 전용 앱에서만 제공합니다.

참고: [Supabase GitHub 로그인](https://supabase.com/docs/guides/auth/social-sign-in/auth-github), [GitHub Pages 배포 설정](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
