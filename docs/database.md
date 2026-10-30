# 데이터 설계 (database.md)

> 작성: AI 초안 / 확인: 개발자(데이터 무결성, 정규화, 보안)
> 서버 DB는 없고, 브라우저 LocalStorage에 JSON으로 저장합니다.

## 1. 저장 위치(키)
| 키 | 내용 | 백업에 포함 |
|---|---|---|
| `reading-notes:v1` | `{ books: [...], transcriptions: [...] }` | 포함 |
| `reading-notes:settings:v1` | 화면 설정 | 미포함 |
| `reading-notes:calendar:v1` | 달력 설정(5절) | 미포함 |
| `reading-notes:backup:v1` | 마지막 백업 시각(ISO 8601). 백업 알림 계산용 | 미포함 |
| `reading-notes:remind:v1` | 백업 알림 띠를 닫은 시각(ISO 8601). 닫은 뒤 7일 동안 백업 문구를 숨김. 없으면 닫은 적 없음 | 미포함 |

## 2. 관계도
```
books (1) ───< transcriptions (N)
   book_id          book_id (FK)
```
- 책을 지우면 그 책의 필사도 함께 지웁니다(앱 코드에서 처리).

## 3. books
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| book_id | string | O | 고유 id (`crypto.randomUUID`, 없으면 시간+난수) |
| title | string | O | 제목 (앞뒤 공백 제거) |
| author | string | | 저자, 비어 있으면 `''` |
| status | string | O | `WISH`(읽고 싶은) / `READING` / `COMPLETED` / `STOPPED` |
| completed_at | string | | 완독으로 바꾼 시각(ISO 8601). 완독이 아니게 되면 삭제. 없는 기존 기록은 날짜 없이 권수에만 집계 |
| created_at | string | O | ISO 8601 시각 |

## 4. transcriptions
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| transcription_id | string | O | 고유 id |
| book_id | string | O | books.book_id |
| content | string | O | 필사 본문 (비어 있거나 5,000자를 넘으면 저장 안 됨) |
| page | number \| null | | 1 이상 정수, 없으면 null |
| memo | string | | 메모 (필사에 덧붙이는 말, 500자 이하) |
| kinds | string[] | | `quote`(책 문장) / `mine`(내 글)을 함께 담을 수 있고, 빈 배열은 미분류 |
| kind | string | | (예전 기록) `quote` / `thought` / `summary`. `kinds`가 없으면 quote → 책 문장, thought·summary → 내 글, 값이 없으면 책 문장으로 읽음 |
| favorite | boolean | | 없는 기존 기록은 `false`로 취급 |
| created_at | string | O | ISO 8601 시각 |

## 5. 설정 (`reading-notes:settings:v1`) · 달력 설정 (`reading-notes:calendar:v1`)
- 달력 설정: `weekStart`(0 일요일 / 1 월요일), `mode`(shade 진하기 / dot 점), `range`(month 보는 달 / all 전체), `format`(md / txt). 백업에는 포함되지 않음.

| 필드 | 값 | 기본값 |
|---|---|---|
| size | `sm` `md` `lg` `xl` (100·112.5·125·137.5% = 16·18·20·22px) | `md` |
| uiFont | `sans` `dodum` `batang` | `sans` |
| bodyFont | `sans` `serif` `batang` `dodum` `pen` | `serif` |
| theme | `light` `dark` `sepia` `auto` | `light` |
| accent | `ink` `violet` `blue` | `ink` |
| cover | `blue` `purple` `pink` `multi` | `multi` |
| shade | `auto` `1` `2` `3` | `auto` |
| letter | `title` `author` `none` | `title` |
| cols | `2` `3` | `3` |
| round | `4` `12` | `12` |
| showDot / showBadge | boolean | `true` |

- 불러올 때 값을 검사해 잘못된 값은 기본값으로 되돌립니다.
- 예전 값은 자동 변환: `letter` 1·2 → `title`, 0 → `none`. 삭제된 포인트 색(`green` 등)은 `ink`로 돌아갑니다.

## 6. 백업 파일 (JSON)
```json
{ "app": "bookandpen", "version": 1, "exported_at": "ISO 시각", "books": [], "transcriptions": [] }
```
- 가져오기: `app` 값이 허용 목록(bookandpen 및 예전 이름)이어야 함. 책·필사의 필수 필드가 맞는 항목만 받음.
- 병합 규칙: 같은 id는 건너뜀(기존 기록 유지). 책이 없는 필사는 받지 않음.

## 7. 무결성·정규화·보안 점검
| 항목 | 현재 상태 | 비고 |
|---|---|---|
| 참조 무결성 | 삭제 시 앱 코드로 연쇄 삭제, 가져오기 때 책 없는 필사 제외 | DB 제약이 없어 코드가 유일한 보장 |
| 정규화 | 책·필사 분리(1:N) | 저자는 책에 문자열로 저장(저자 테이블 없음) |
| 용량 | 약 5MB, 저장 실패 시 경고, 사용률 80% 이상이면 백업 알림 | 이미지 미저장, 입력 한도(본문 5,000자·메모 500자·사진 10MB) |
| 보안 | 서버 전송 없음, 암호화 없음 | 기기를 다른 사람이 쓰면 기록이 보임 |
| 버전 | 키에 `v1`, 백업에 `version: 1` | 구조가 바뀌면 변환 코드 필요 |

## 8. 개발자가 반드시 확인할 것
- [ ] 저자를 문자열로 두는 것이 충분한가 (저자별 모아보기 요구가 생기면 구조 검토)
- [ ] 값이 없는 기존 기록(kind, kinds, favorite, completed_at) 처리가 항상 유지되는가
- [ ] 백업 가져오기 병합 규칙이 사용자 기대(수정된 기록은 덮어쓰지 않음)와 맞는가
