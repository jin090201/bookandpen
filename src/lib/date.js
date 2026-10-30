// 날짜 표기 공통 부분 (모두 기기의 날짜 기준)
export const pad = (n) => String(n).padStart(2, '0');

const toDate = (v) => (v instanceof Date ? v : new Date(v));

// 'YYYY-MM-DD' (달력·통계에서 날짜를 묶는 키)
export function dayKey(v) {
  const d = toDate(v);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 'YYYY.MM.DD' (화면·내보내기 표시용)
export function dotDate(v) {
  const d = toDate(v);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

// 'YYYYMMDD' (파일 이름용)
export function fileStamp(v = new Date()) {
  const d = toDate(v);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
