# 북앤펜 (BookAndPen)

## 1. Overview
- 목적: 책을 사진으로 찍어 필사를 기록하는 모바일 웹 앱
- 주요 기능: OCR 필사, 책장·즐겨찾기·기록 탭, 백업

## 2. Tech Stack
- React 18, Vite 5 (base './'), Tailwind 3.4
- Tesseract.js v5 (kor+eng), LocalStorage
- 배포: GitHub Pages (Actions)

## 3. Coding Principles
- 앱 화면 문구는 "~해요", 문서와 코드 주석은 "~습니다"
- 저장 키는 reading-notes:* 를 유지하고, 구조를 바꾸면 변환 코드를 둔다
- 변경 사항은 docs/에 반영한다

## 4. Response Guidelines
- 항상 한국어로 답한다
- 파일을 만들기 전에 먼저 알린다
