import { useMemo, useState } from 'react';
import { downloadTextFile, kindText, pageText, safeFilename } from '../lib/storage.js';
import { dayKey, dotDate, pad } from '../lib/date.js';
import Pager, { usePaging } from './Pager.jsx';

// ───────────────── 공통 도우미 (통계 화면에서도 씁니다) ─────────────────
const SETTINGS_KEY = 'reading-notes:calendar:v1';
const DEFAULT_CAL = { weekStart: 0, mode: 'shade', range: 'month', format: 'md' };

export function loadCalSettings() {
  try {
    const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      weekStart: v.weekStart === 1 ? 1 : 0,
      mode: v.mode === 'dot' ? 'dot' : 'shade',
      range: v.range === 'all' ? 'all' : 'month',
      format: v.format === 'txt' ? 'txt' : 'md',
    };
  } catch {
    return { ...DEFAULT_CAL };
  }
}

function saveCalSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 저장 실패는 무시 (이번 화면에서만 적용) */
  }
}

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const weekdayNames = (weekStart) =>
  weekStart === 1 ? [...WEEKDAYS.slice(1), WEEKDAYS[0]] : WEEKDAYS;

// 필사 목록을 날짜별로 묶기: { 'YYYY-MM-DD': [필사…] } (같은 날은 작성순)
export function groupByDay(transcriptions) {
  const m = {};
  for (const t of [...transcriptions].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    (m[dayKey(t.created_at)] ||= []).push(t);
  }
  return m;
}

// 날짜별 필사 목록(책 제목·종류·페이지·내용·메모)
// 글이 길면 내용 4줄·메모 2줄까지만 보여 주고 "더 보기"로 펼치며, 5개씩 나눠 보여 줍니다.
// 날짜가 바뀌면 처음부터 보이도록 부르는 쪽에서 key={날짜}를 줍니다.
export function DayList({ items, titleOf }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const { curPage, totalPages, pageItems, goPage } = usePaging(items, undefined, false);
  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-stone-400">이 날은 필사한 글이 없어요.</p>;
  }
  return (
    <>
      <ul className="space-y-2">
        {pageItems.map((t) => {
          const open = expanded.has(t.transcription_id);
          const longContent = t.content.length > 100 || t.content.split('\n').length > 4;
          const longMemo = !!t.memo && (t.memo.length > 50 || t.memo.split('\n').length > 2);
          return (
            <li key={t.transcription_id} className="rounded-xl border border-stone-200 bg-white p-3">
              <p className="text-xs text-stone-500">
                {titleOf(t.book_id)} · {kindText(t)}
                {t.page ? ` · ${pageText(t)}` : ''}
                {t.favorite ? ' · ★' : ''}
              </p>
              <p
                className={`mt-1 whitespace-pre-wrap font-body text-sm leading-relaxed ${
                  open ? '' : 'line-clamp-4'
                }`}
              >
                {t.content}
              </p>
              {t.memo && (
                <p
                  className={`mt-2 whitespace-pre-wrap rounded-lg bg-stone-100 p-2 text-xs text-stone-600 ${
                    open ? '' : 'line-clamp-2'
                  }`}
                >
                  메모: {t.memo}
                </p>
              )}
              {(longContent || longMemo) && (
                <button onClick={() => toggle(t.transcription_id)} className="mt-1 text-sm text-stone-500">
                  {open ? '접기' : '더 보기'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <Pager curPage={curPage} totalPages={totalPages} goPage={goPage} />
    </>
  );
}

// ───────────────── 연·월 고르기 창 (달력 제목을 누르면 열립니다) ─────────────────
// year/month: 지금 보는 연·월(month는 0~11), marked: 기록이 있는 달의 "YYYY-MM" 모음
// noFuture: true이면 이번 달 이후(미래)는 고를 수 없습니다.
export function MonthPicker({ year, month, marked, onPick, onClose, noFuture = false }) {
  const [y, setY] = useState(year);
  const now = new Date();
  const isFuture = (yy, mm) =>
    noFuture && (yy > now.getFullYear() || (yy === now.getFullYear() && mm > now.getMonth()));
  return (
    <div className="mx-auto mt-2 max-w-sm rounded-xl border border-stone-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setY(y - 1)} aria-label="이전 해" className="px-3 py-1 text-lg text-stone-600">‹</button>
        <p className="text-sm font-semibold">{y}년</p>
        <button
          onClick={() => setY(y + 1)}
          disabled={noFuture && y >= now.getFullYear()}
          aria-label="다음 해"
          className="px-3 py-1 text-lg text-stone-600 disabled:opacity-30"
        >
          ›
        </button>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {Array.from({ length: 12 }, (_, m) => {
          const on = y === year && m === month;
          const isNow = y === now.getFullYear() && m === now.getMonth();
          const has = marked.has(`${y}-${pad(m + 1)}`);
          return (
            <button
              key={m}
              onClick={() => onPick(y, m)}
              disabled={isFuture(y, m)}
              aria-label={`${y}년 ${m + 1}월${has ? ' 필사 있음' : ''}`}
              className={`relative rounded-lg py-2 text-sm disabled:opacity-30 ${
                on ? 'bg-accent text-on-accent' : 'border border-stone-200 text-stone-700'
              } ${!on && isNow ? 'ring-1 ring-stone-400' : ''}`}
            >
              {m + 1}월
              {has && (
                <span
                  className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                    on ? 'bg-on-accent' : 'bg-accent'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-sm text-stone-500">
        <button onClick={() => onPick(now.getFullYear(), now.getMonth())} className="px-2 py-1">이번 달</button>
        <button onClick={onClose} className="px-2 py-1">닫기</button>
      </div>
    </div>
  );
}

// ───────────────── 내려받기 파일 만들기 ─────────────────
function buildCalendarFile({ days, byDay, titleOf, label, format }) {
  const totalCount = days.reduce((n, k) => n + byDay[k].length, 0);
  const stamp = dotDate(new Date());
  const dayLabel = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return `${y}년 ${m}월 ${d}일`;
  };
  const lines = [];
  if (format === 'md') {
    lines.push(`# 독서 달력 · ${label}`, '');
    lines.push(`필사한 날 ${days.length}일 · 필사 ${totalCount}개 · ${stamp} 내보냄`, '');
    for (const k of days) {
      lines.push(`## ${dayLabel(k)}`, '');
      for (const t of byDay[k]) {
        const head = [titleOf(t.book_id), kindText(t)];
        if (t.page) head.push(pageText(t));
        lines.push(`### ${head.join(' · ')}${t.favorite ? ' ★' : ''}`, '');
        lines.push(...t.content.split('\n').map((l) => (l.trim() ? `> ${l}` : '>')), '');
        if (t.memo) lines.push(`메모: ${t.memo}`, '');
      }
    }
  } else {
    lines.push(`독서 달력 · ${label}`, `필사한 날 ${days.length}일 · 필사 ${totalCount}개`, '');
    for (const k of days) {
      lines.push(`[${dayLabel(k)}]`, '');
      for (const t of byDay[k]) {
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

// ───────────────── 독서 달력 화면 ─────────────────
export default function CalendarView({ books, transcriptions }) {
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() }); // m: 0~11
  const [selected, setSelected] = useState(dayKey(today.toISOString()));
  const [cal, setCal] = useState(loadCalSettings);
  const [draft, setDraft] = useState(null); // 설정 창이 열려 있으면 편집 중인 값
  const [msg, setMsg] = useState('');
  const [picking, setPicking] = useState(false); // 연·월 고르기 창이 열려 있는지

  const byDay = useMemo(() => groupByDay(transcriptions), [transcriptions]);
  const markedMonths = useMemo(() => new Set(Object.keys(byDay).map((k) => k.slice(0, 7))), [byDay]);
  const titleOf = useMemo(() => {
    const m = Object.fromEntries(books.map((b) => [b.book_id, b.title]));
    return (id) => m[id] || '(삭제된 책)';
  }, [books]);

  const first = new Date(cursor.y, cursor.m, 1);
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const lead = (first.getDay() - cal.weekStart + 7) % 7;
  const cells = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const monthKey = (d) => `${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}`;
  const monthLabel = `${cursor.y}년 ${cursor.m + 1}월`;

  const moveMonth = (delta) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(null);
  };
  const pickMonth = (y, m) => {
    setCursor({ y, m });
    setSelected(null);
    setPicking(false);
  };

  const shadeClass = (n) =>
    n >= 3
      ? 'bg-accent text-on-accent'
      : n === 2
      ? 'bg-accent/45 text-stone-900'
      : n === 1
      ? 'bg-accent/20 text-stone-900'
      : 'text-stone-700';

  const monthDays = Object.keys(byDay).filter((k) => k.startsWith(`${cursor.y}-${pad(cursor.m + 1)}-`));
  const monthCount = monthDays.reduce((n, k) => n + byDay[k].length, 0);

  const download = () => {
    const days = (cal.range === 'all' ? Object.keys(byDay) : monthDays).sort();
    if (days.length === 0) {
      setMsg('내려받을 필사가 없어요.');
      return;
    }
    const label = cal.range === 'all' ? '전체' : monthLabel;
    const text = buildCalendarFile({ days, byDay, titleOf, label, format: cal.format });
    const ext = cal.format === 'md' ? 'md' : 'txt';
    const name = cal.range === 'all' ? '독서달력-전체' : `독서달력-${cursor.y}-${pad(cursor.m + 1)}`;
    downloadTextFile(
      `${safeFilename(name)}.${ext}`,
      text,
      cal.format === 'md' ? 'text/markdown' : 'text/plain'
    );
    setMsg('파일을 내려받았어요.');
  };

  const saveDraft = () => {
    setCal(draft);
    saveCalSettings(draft);
    setDraft(null);
  };

  const Choice = ({ label, value, field, options }) => (
    <div className="mt-3">
      <p className="text-sm font-medium text-stone-700">{label}</p>
      <div className="mt-1 flex gap-2">
        {options.map(([v, text]) => (
          <button
            key={String(v)}
            onClick={() => setDraft((d) => ({ ...d, [field]: v }))}
            className={`flex-1 rounded-lg border py-2 text-sm ${
              value === v
                ? 'border-accent bg-accent text-on-accent'
                : 'border-stone-300 bg-white text-stone-600'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );

  // 설정 화면
  if (draft) {
    return (
      <div className="px-4 pt-6">
        <h1 className="font-body text-2xl font-bold">독서 달력 설정</h1>
        <Choice label="한 주의 시작" value={draft.weekStart} field="weekStart" options={[[0, '일요일'], [1, '월요일']]} />
        <Choice label="날짜 표시" value={draft.mode} field="mode" options={[['shade', '진하기'], ['dot', '점']]} />
        <Choice label="내려받기 범위" value={draft.range} field="range" options={[['month', '보는 달만'], ['all', '전체']]} />
        <Choice label="내려받기 형식" value={draft.format} field="format" options={[['md', '마크다운'], ['txt', '텍스트']]} />
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button onClick={() => setDraft(null)} className="rounded-xl border border-stone-300 py-3 text-sm font-medium">
            취소
          </button>
          <button onClick={saveDraft} className="rounded-xl bg-accent py-3 text-sm font-semibold text-on-accent">
            저장
          </button>
        </div>
      </div>
    );
  }

  const selectedItems = selected ? byDay[selected] || [] : [];
  const selectedLabel = selected
    ? `${Number(selected.slice(5, 7))}월 ${Number(selected.slice(8, 10))}일`
    : '';

  return (
    <div className="px-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="font-body text-2xl font-bold">독서 달력</h1>
        <div className="flex items-center gap-3 text-sm text-stone-600">
          <button onClick={() => { setMsg(''); setDraft(cal); }}>설정</button>
          <button onClick={download}>내려받기</button>
        </div>
      </div>
      {msg && <p className="mt-1 text-xs text-stone-500">{msg}</p>}

      <div className="mt-4 flex items-center justify-between">
        <button onClick={() => moveMonth(-1)} aria-label="이전 달" className="px-3 py-1 text-lg text-stone-600">‹</button>
        <button
          onClick={() => setPicking((v) => !v)}
          aria-expanded={picking}
          aria-label="연·월 고르기"
          className="rounded-lg px-3 py-1 font-semibold"
        >
          {monthLabel} <span className="text-xs text-stone-400">{picking ? '▴' : '▾'}</span>
        </button>
        <button onClick={() => moveMonth(1)} aria-label="다음 달" className="px-3 py-1 text-lg text-stone-600">›</button>
      </div>
      {picking && (
        <MonthPicker
          key={`${cursor.y}-${cursor.m}`}
          year={cursor.y}
          month={cursor.m}
          marked={markedMonths}
          onPick={pickMonth}
          onClose={() => setPicking(false)}
        />
      )}
      <p className="text-center text-xs text-stone-500">
        이 달 필사한 날 {monthDays.length}일 · 필사 {monthCount}개
      </p>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-stone-500">
        {weekdayNames(cal.weekStart).map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={`b${i}`} />;
          const key = monthKey(d);
          const n = (byDay[key] || []).length;
          const isToday = key === dayKey(today.toISOString());
          return (
            <button
              key={key}
              onClick={() => setSelected(key)}
              aria-label={`${cursor.m + 1}월 ${d}일 필사 ${n}개`}
              className={`relative flex aspect-square items-center justify-center rounded-lg text-sm ${
                cal.mode === 'shade' ? shadeClass(n) : 'text-stone-700'
              } ${selected === key ? 'ring-2 ring-accent' : isToday ? 'ring-1 ring-stone-400' : ''}`}
            >
              {d}
              {cal.mode === 'dot' && n > 0 && (
                <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        {selected ? (
          <>
            <p className="mb-2 text-sm font-semibold text-stone-700">
              {selectedLabel} · 필사 {selectedItems.length}개
            </p>
            <DayList key={selected} items={selectedItems} titleOf={titleOf} />
          </>
        ) : (
          <p className="py-4 text-center text-sm text-stone-400">날짜를 누르면 그날의 필사가 보여요.</p>
        )}
      </div>
    </div>
  );
}
