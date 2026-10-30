// OCR 텍스트 후처리: 책 특유의 강제 줄바꿈·하이픈·공백 정리
export function postprocess(raw) {
  if (!raw) return '';

  let text = raw.replace(/\r\n?/g, '\n');

  // 1) 영문 단어 중간에 끊긴 하이픈 제거 (예: "exam-\nple" -> "example")
  text = text.replace(/([A-Za-z])-\n([a-z])/g, '$1$2');

  // 2) 단락 내 강제 줄바꿈을 공백으로 치환 (빈 줄=단락 구분은 유지)
  text = text.replace(/(?<!\n)\n(?!\n)/g, ' ');

  // 3) 연속 공백/탭 하나로
  text = text.replace(/[ \t ]{2,}/g, ' ');

  // 4) 3줄 이상 연속 빈 줄은 한 단락 구분으로
  text = text.replace(/\n{3,}/g, '\n\n');

  // 5) 줄 앞뒤 공백 제거
  text = text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();

  return text;
}
