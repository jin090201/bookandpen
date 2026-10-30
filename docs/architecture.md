# 아키텍처 (architecture.md)

> 작성: AI 초안 / 확인: 개발자(아키텍처 타당성, 기술 선택)

## 1. 한눈에 보기
```
브라우저 (모바일)
 ├─ React 앱 (Vite 번들)
 │   ├─ App.jsx ........ 상태(data)·화면 전환·데이터 변경 함수
 │   ├─ components/ .... BookList(책장·즐겨찾기·설정), BookDetail, ScanEditor, CalendarView(독서 달력·내려받기), StatsView(통계),
 │   │                    공통: Pager(목록 나누기), Chip(선택 칩)
 │   └─ lib/ ........... storage(저장·백업·설정·내보내기·종류 거르기·페이지 표기), date(날짜 표기), ocr, postprocess
 ├─ LocalStorage ....... 기록(reading-notes:v1), 설정(reading-notes:settings:v1), 달력 설정(reading-notes:calendar:v1), 마지막 백업 시각(reading-notes:backup:v1), 알림 띠를 닫은 시각(reading-notes:remind:v1)
 ├─ Tesseract.js ....... 브라우저 안 OCR (kor+eng)
 └─ (외부) 언어 데이터·구글 폰트 내려받기 (인터넷)
서버 없음 → GitHub Pages가 정적 파일만 제공
```

## 2. 기술 선택과 이유
| 영역 | 선택 | 이유 | 대안·주의 |
|---|---|---|---|
| UI | React 18 | 상태 기반 화면, 익숙한 도구 | 앱이 커지면 라우터 도입 검토 |
| 빌드 | Vite 5 (`base: './'`) | 빠른 개발 서버, 하위 경로 배포 가능 | 일반 Live Server로는 JSX 실행 불가 → `npm run dev` |
| 스타일 | Tailwind 3.4 + CSS 변수 | 색·글꼴을 변수로 연결해 테마·설정 즉시 반영 | 기본 `stone`·`white` 색을 변수로 덮어씀 |
| OCR | Tesseract.js v5 (kor+eng) | 서버 없이 사진이 기기 밖으로 안 나감 | 인식 정확도·속도 한계(아래 4절) |
| 저장 | LocalStorage | 서버·로그인 불필요 | 용량 약 5MB, 브라우저 데이터 삭제 시 소실 → 백업 기능으로 보완 |
| 배포 | GitHub Pages + Actions | 무료 정적 호스팅 | 서버 기능이 필요해지면 재검토 |

## 3. 화면 전환·상태
- 라우터 없이 `view`(books / detail / scan)와 `tab`(shelf / favorites / record / settings) 상태로 전환.
- 모든 기록은 `App`의 `data` 하나에 두고, 바뀔 때마다 `saveData`로 저장. 저장 실패 시 상단에 경고 표시.
- 설정은 `useSettings` 훅과 `updateSettings`(저장 + 즉시 적용 + 이벤트 알림)로 화면 간 공유.
- 삭제 직전의 책·필사를 `undo` 상태에 7초간 보관하고, 되돌릴 때 id 기준으로 합칩니다(그 사이 바뀐 다른 기록은 건드리지 않습니다).
- 백업 알림은 `backupReminders`가 마지막 백업 후 30일 경과 또는 저장 공간 80% 이상일 때 안내 문구를 만들고, 설정에서 백업하면 이벤트로 알림 띠를 갱신합니다. 띠의 ✕를 누르면 닫은 시각을 저장해(`reading-notes:remind:v1`) 7일 동안 백업 문구를 숨기고, 저장 공간 경고는 닫을 수 없어 계속 표시합니다.

## 4. 주요 흐름
**필사 추가**: 사진 선택 → `prepareImage`(긴 변 1800px로 축소) → Tesseract 워커(싱글톤, 최초 1회 언어 데이터 로드) → 원문 → `postprocess`(하이픈·강제 줄바꿈·공백 정리) → 사용자가 수정 → 저장.
**설정 적용**: 선택 → `saveSettings` → `applySettings`가 `<html>`에 글자 크기, 글꼴, 색 변수(`--c-*`, `--accent`, `--dot`)를 설정 → Tailwind 색이 즉시 바뀜. '기기 설정'은 `prefers-color-scheme` 변경도 감지.

## 5. 위험·한계
| 항목 | 내용 | 완화 |
|---|---|---|
| 데이터 소실 | 브라우저 데이터 삭제 시 기록 사라짐 | 백업 내보내기·가져오기, 안내 문구 |
| 용량 | LocalStorage 약 5MB | 텍스트만 저장, 저장 실패 경고, 입력 한도(본문 5,000자·메모 500자·사진 10MB), 80% 이상 사용 시 백업 알림 |
| 실수로 삭제 | 확인 창 후에도 되돌리고 싶을 수 있음 | 삭제 직후 7초간 되돌리기 (모든 기록 삭제는 제외) |
| OCR 품질 | 곡면 페이지·흐린 사진에서 오인식 | 직접 수정 UI, (예정) 자르기·낮은 신뢰도 표시 |
| 외부 의존 | 첫 인식 때 언어 데이터 다운로드, 구글 폰트 | 이후 캐시, 폰트는 시스템 글꼴로 대체 |
| CSS `zoom` | 손글씨 크기 보정에 사용 | 지원 안 하는 브라우저에서는 보정만 빠짐 |

## 6. 보안·공개 범위
- 저장소(공개): https://github.com/jin090201/bookandpen · 배포: https://jin090201.github.io/bookandpen/
- 서버·인증 정보 없음. `.gitignore`가 키·인증서·환경 변수·`.npmrc`·테스트 파일·백업 JSON·사진을 제외합니다.
- `public/` 폴더 안의 이미지(아이콘·로고)는 예외로 올라갑니다. 다른 폴더의 이미지는 `.gitignore`에 예외 한 줄을 추가해야 합니다.
- 시작할 때 `navigator.storage.persist()`로 브라우저가 기록을 임의로 지우지 않도록 요청합니다(허용 여부는 브라우저가 결정).
- 검색 엔진 차단(robots.txt, noindex)과 CSP는 적용하지 않기로 했습니다(현 상태 유지, CSP는 이후 검토).

## 7. 개발자가 반드시 확인할 것
- [ ] 서버 없는 구조로 충분한가 (기기 간 동기화가 필요해지면 구조 변경 필요)
- [ ] Tesseract.js의 정확도·속도가 목표를 만족하는가 (실기기 테스트 필요)
- [ ] `App.jsx`에 상태가 모여 있어 기능이 늘면 분리가 필요한 시점은 언제인가
