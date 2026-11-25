import { kindText, pageText, safeFilename } from './storage.js';
import { dayKey, dotDate, pad } from './date.js';

// 읽기용 문서(.md·.txt)를 만드는 코드입니다. 설정의 "읽기용 문서로 내려받기"에서 씁니다.
// 이 파일은 읽고 공유하는 용도라서 가져오기로 되살릴 수 없습니다(복원은 백업 .json).

// 날짜별로 묶기: { 'YYYY-MM-DD': [필사…] } (같은 날은 작성순)
function groupByDayKey(transcriptions) {
  const m = {};
  for (const t of [...transcriptions].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    (m[dayKey(t.created_at)] ||= []).push(t);
  }
  return m;
}

// 완독한 날: { 'YYYY-MM-DD': [책 제목…] } (완독 날짜가 있는 완독 책만, 통계와 같은 기준)
function groupDoneByDay(books) {
  const m = {};
  for (const b of books) {
    if (b.status === 'COMPLETED' && b.completed_at) (m[dayKey(b.completed_at)] ||= []).push(b.title);
  }
  return m;
}

// days: 파일에 넣을 날(필사한 날과 완독한 날), doneByDay: 완독한 날의 책 제목 목록
// 요약의 "필사한 날"은 필사가 있는 날만 세고, 완독만 한 날도 날짜 항목으로 넣습니다.
function buildFileText({ days, byDay, doneByDay, titleOf, label, format }) {
  const writtenDays = days.filter((k) => (byDay[k] || []).length > 0);
  const totalCount = days.reduce((n, k) => n + (byDay[k] || []).length, 0);
  const doneCount = days.reduce((n, k) => n + (doneByDay[k] || []).length, 0);
  const summary = `필사한 날 ${writtenDays.length}일 · 필사 ${totalCount}개${doneCount > 0 ? ` · 완독 ${doneCount}권` : ''}`;
  const stamp = dotDate(new Date());
  const dayLabel = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return `${y}년 ${m}월 ${d}일`;
  };
  const lines = [];
  if (format === 'md') {
    lines.push(`# 독서 달력 · ${label}`, '');
    lines.push(`${summary} · ${stamp} 내보냄`, '');
    for (const k of days) {
      lines.push(`## ${dayLabel(k)}`, '');
      if ((doneByDay[k] || []).length > 0) lines.push(`✓ 완독: ${doneByDay[k].join(', ')}`, '');
      for (const t of byDay[k] || []) {
        const head = [titleOf(t.book_id), kindText(t)];
        if (t.page) head.push(pageText(t));
        lines.push(`### ${head.join(' · ')}${t.favorite ? ' ★' : ''}`, '');
        lines.push(...t.content.split('\n').map((l) => (l.trim() ? `> ${l}` : '>')), '');
        if (t.memo) lines.push(`메모: ${t.memo}`, '');
      }
    }
  } else {
    lines.push(`독서 달력 · ${label}`, summary, '');
    for (const k of days) {
      lines.push(`[${dayLabel(k)}]`, '');
      if ((doneByDay[k] || []).length > 0) lines.push(`✓ 완독: ${doneByDay[k].join(', ')}`, '');
      for (const t of byDay[k] || []) {
        lines.push(
          `${titleOf(t.book_id)} · [${kindText(t)}]${t.page ? ` ${pageText(t)}` : ''}${t.favorite ? ' ★' : ''}`,
          t.content
        );
        if (t.memo) lines.push(`메모: ${t.memo}`);
        lines.push('', '----', '');
      }
    }
  }
  return lines.join('\n');
}

// 범위: 'all'(전체) · 'year'(올해) · 'month'(월 하나, ym = {y, m}; m은 0~11)
// 내려받을 기록이 없으면 null을 돌려줍니다.
export function buildReadingDocument({ books, transcriptions, range, ym, format }) {
  const byDay = groupByDayKey(transcriptions);
  const doneByDay = groupDoneByDay(books);
  const titleMap = Object.fromEntries(books.map((b) => [b.book_id, b.title]));
  const titleOf = (id) => titleMap[id] || '(삭제된 책)';

  const thisYear = new Date().getFullYear();
  let prefix = '';
  let label = '전체';
  let name = '독서달력-전체';
  if (range === 'year') {
    prefix = `${thisYear}-`;
    label = `${thisYear}년`;
    name = `독서달력-${thisYear}`;
  } else if (range === 'month') {
    prefix = `${ym.y}-${pad(ym.m + 1)}-`;
    label = `${ym.y}년 ${ym.m + 1}월`;
    name = `독서달력-${ym.y}-${pad(ym.m + 1)}`;
  }
  const days = [...new Set([...Object.keys(byDay), ...Object.keys(doneByDay)])]
    .filter((k) => k.startsWith(prefix))
    .sort();
  if (days.length === 0) return null;

  const ext = format === 'txt' ? 'txt' : 'md';
  return {
    filename: `${safeFilename(name)}.${ext}`,
    text: buildFileText({ days, byDay, doneByDay, titleOf, label, format: ext }),
    mime: ext === 'md' ? 'text/markdown' : 'text/plain',
  };
}
