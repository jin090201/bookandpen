# 배포 (deployment.md)

> 작성: AI 초안 / 확인: 개발자(배포 절차, 실제 Pages 설정)
> 기준: 현재 코드(v1.1). 서버가 없는 정적 웹앱이라 운영 서버·DB·컨테이너는 없습니다.

## 1. 환경
| 구분 | 내용 |
|---|---|
| 개발 | Windows, Node.js, npm. `npm install` 후 `npm run dev` |
| 빌드·배포 | GitHub Actions(ubuntu-latest), Node 20, `npm install` → `npm run build` |
| 호스팅 | GitHub Pages(정적 파일만 제공). 주소: https://jin090201.github.io/bookandpen/ |
| 저장소(공개) | https://github.com/jin090201/bookandpen |

## 2. 환경 변수
- 필요한 환경 변수와 비밀 값이 없습니다. 서버·API 키도 없습니다.
- 혹시 `.env` 계열 파일을 만들더라도 `.gitignore`가 제외합니다(`.env`, `.env.*`, `*.pem`, `*.key`, `.npmrc` 등).

## 3. 개발 실행
```
npm install
npm run dev
```
- 같은 Wi-Fi의 폰에서 터미널의 `Network` 주소(예: http://192.168.x.x:5173/)로 접속해 확인합니다.
- 카메라 촬영은 https에서 가장 안정적이라 http 개발 주소에서는 "사진 불러오기"로 시험합니다.
- 개발 서버에는 CSP가 적용되지 않습니다(5절).

## 4. 빌드와 미리보기
```
npm run build      # dist/ 생성
npm run preview    # dist/를 로컬에서 열어 봄(보통 http://localhost:4173/)
```
- `vite.config.js`의 `base: './'`로 자산 경로를 상대 경로로 만들어, 저장소 하위 경로(/bookandpen/)에서도 깨지지 않습니다.
- 배포본과 같은 CSP를 확인하려면 개발 서버가 아니라 `preview`로 봅니다. `dist/index.html`의 `<head>`에 `Content-Security-Policy` meta가 있어야 합니다.
- `dist/`는 커밋하지 않습니다(`.gitignore`).

## 5. CSP (콘텐츠 보안 정책)
- `vite.config.js`의 `cspPlugin`이 **빌드할 때만** `<meta http-equiv="Content-Security-Policy">`를 넣습니다. 개발 서버는 인라인 스크립트를 주입해 CSP를 넣으면 깨지기 때문입니다.
- GitHub Pages는 HTTP 헤더를 바꿀 수 없어 meta 방식을 쓰며, `frame-ancestors` 등 일부 지시어는 meta에서 동작하지 않습니다.
- 허용 대상은 다음과 같습니다.

| 지시어 | 허용 | 이유 |
|---|---|---|
| default-src | 'self' | 기본은 같은 출처만 허용 |
| script-src | 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net | OCR 엔진(wasm)과 워커 |
| worker-src | 'self' blob: | Tesseract 워커 실행 |
| connect-src | 'self' https://cdn.jsdelivr.net | 엔진·언어 데이터 내려받기 |
| style-src | 'self' 'unsafe-inline' https://fonts.googleapis.com | 글꼴 CSS, React 인라인 스타일 |
| font-src | https://fonts.gstatic.com | 글꼴 파일 |
| img-src | 'self' data: blob: | 사진 미리보기 |
| object-src · base-uri · form-action | 'none' · 'self' · 'self' | 불필요한 기능 차단 |

- 외부 주소를 새로 쓰게 되면(예: 책 검색 API) 같은 파일의 `CSP`에 그 주소를 추가해야 합니다. 빼먹으면 배포본에서만 막힙니다.
- OCR이나 글꼴이 안 되면 배포본의 개발자 도구 콘솔에서 `Refused to ...` 메시지로 막힌 주소를 찾습니다.

## 6. 배포 절차
1. 수정 후 `npm run build`가 통과하는지 확인합니다.
2. `git status`로 올라갈 파일을 확인합니다(공개 저장소 주의, 7절).
3. 커밋하고 `main`에 push합니다.
4. `.github/workflows/deploy.yml`이 자동으로 실행됩니다: 빌드(`npm install`, `npm run build`) → `dist`를 Pages 산출물로 올림 → 배포.
5. 저장소의 Actions 탭에서 성공했는지 보고, 배포 주소에서 확인합니다.

- 수동 실행: Actions 탭에서 "Deploy to GitHub Pages"를 `workflow_dispatch`로 다시 실행할 수 있습니다.
- 처음 설정: 저장소 Settings → Pages → Source를 **GitHub Actions**로 합니다(현재 설정되어 있음).
- 새 push가 오면 진행 중인 배포는 취소되고 최신 것만 배포됩니다(`concurrency`).

## 7. 올리기 전 점검 (공개 저장소)
커밋하지 않는 것: 비밀 값, 개인 정보, png·jpg(단 `public/` 폴더는 예외), 백업 json, `docs/test-spec.md`, `node_modules`, `dist`, `CLAUDE.local.md`. 시험에 쓴 사진도 올리지 않습니다. 커밋 이메일은 noreply 주소를 씁니다.

## 8. 배포 후 확인
- [ ] 배포 주소가 열리고 최신 화면(문구·기능)이 보이는가 (안 보이면 브라우저 캐시를 지우고 다시)
- [ ] 폰에서 사진 인식이 끝까지 되는가 (CSP 적용 상태에서의 OCR)
- [ ] 글꼴(화면 글꼴, 손글씨)이 나오는가
- [ ] 개발자 도구 콘솔에 `Refused to ...` 오류가 없는가
- [ ] 저장해 둔 기록이 그대로 있는가 (저장 주소가 같으면 LocalStorage가 유지됨)

## 9. 문제가 생겼을 때 되돌리기
- 직전 변경이 문제라면 해당 커밋을 되돌리는 새 커밋(`git revert`)을 만들어 push하면 자동으로 이전 모습으로 다시 배포됩니다.
- 저장 구조(LocalStorage 키)를 바꾼 배포는 되돌리기 전에 데이터 변환을 먼저 점검합니다(database.md 참고).

## 10. 이 앱에 해당하지 않는 것
| 일반 배포 문서 항목 | 북앤펜 |
|---|---|
| 운영·개발 서버 분리 | 없음(GitHub Pages 한 곳) |
| 환경 변수(.env) 목록 | 없음 |
| DB 마이그레이션 | 없음. 저장 구조가 바뀌면 앱 안의 변환 코드가 처리 |
| 컨테이너(Docker) | 없음 |

## 11. 개발자가 반드시 확인할 것
- [ ] Pages 설정(Source: GitHub Actions)이 유지되고 있는가
- [ ] 배포 후 폰에서 OCR·글꼴이 CSP 아래에서 정상인가
- [ ] 외부 주소를 추가할 때 CSP에도 넣는 절차를 지키고 있는가
