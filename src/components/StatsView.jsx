import { useMemo, useState } from 'react';
import { KIND_LABEL, filterByKind } from '../lib/storage.js';
import { dayKey } from '../lib/date.js';
import { DayList, groupByDay, loadCalSettings, weekdayNames } from './CalendarView.jsx';
import Chip from './Chip.jsx';

const num = (n) => n.toLocaleString('ko-KR');
const chars = (list) => list.reduce((n, t) => n + [...t.content].length, 0);

function Card({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3 text-center">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
      {sub && <p className="text-xs text-stone-500">{sub}</p>}
    </div>
  );
}

export default function StatsView({ books, transcriptions }) {
  const [tab, setTab] = useState('day'); // day | year
  const total = transcriptions.length;
  const completed = books.filter((b) => b.status === 'COMPLETED').length;

  return (
    <div className="px-4 pt-6">
      <h1 className="font-body text-2xl font-bold">통계</h1>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Card label="필사" value={`${num(total)}개`} />
        <Card label="글자 수" value={`${num(chars(transcriptions))}자`} />
        <Card label="완독한 책" value={`${num(completed)}권`} />
      </div>

      <div className="mt-5 grid grid-cols-2 border-b border-stone-200 text-sm">
        {[['day', '일간 통계'], ['year', '연간 통계']].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`py-2 ${tab === k ? 'border-b-2 border-accent font-semibold' : 'text-stone-400'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'day' ? (
        <DayStats books={books} transcriptions={transcriptions} />
      ) : (
        <YearStats books={books} transcriptions={transcriptions} />
      )}
    </div>
  );
}

// ───────────────── 일간 통계 ─────────────────
function DayStats({ books, transcriptions }) {
  const { weekStart } = loadCalSettings();
  const [kind, setKind] = useState('all'); // all | quote | mine | none
  const [selected, setSelected] = useState(() => new Date());
  const names = weekdayNames(weekStart);

  const filtered = useMemo(() => filterByKind(transcriptions, kind), [transcriptions, kind]);
  const byDay = useMemo(() => groupByDay(filtered), [filtered]);
  const titleOf = useMemo(() => {
    const m = Object.fromEntries(books.map((b) => [b.book_id, b.title]));
    return (id) => m[id] || '(삭제된 책)';
  }, [books]);

  // 선택한 날이 들어 있는 한 주
  const start = new Date(selected);
  start.setDate(start.getDate() - ((start.getDay() - weekStart + 7) % 7));
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const keyOf = dayKey;
  const selKey = keyOf(selected);
  const items = byDay[selKey] || [];
  const moveWeek = (delta) => {
    const d = new Date(selected);
    d.setDate(d.getDate() + delta * 7);
    setSelected(d);
  };

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <Chip active={kind === 'all'} onClick={() => setKind('all')}>전체</Chip>
        {Object.entries(KIND_LABEL).map(([k, label]) => (
          <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{label}</Chip>
        ))}
        <Chip active={kind === 'none'} onClick={() => setKind('none')}>미분류</Chip>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button onClick={() => moveWeek(-1)} aria-label="이전 주" className="px-3 py-1 text-lg text-stone-600">‹</button>
        <p className="text-sm font-semibold">
          {selected.getFullYear()}년 {selected.getMonth() + 1}월
        </p>
        <button onClick={() => moveWeek(1)} aria-label="다음 주" className="px-3 py-1 text-lg text-stone-600">›</button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center">
        {week.map((d, i) => {
          const k = keyOf(d);
          const has = (byDay[k] || []).length > 0;
          const on = k === selKey;
          return (
            <button
              key={k}
              onClick={() => setSelected(d)}
              className={`rounded-lg py-1.5 ${on ? 'bg-accent text-on-accent' : 'text-stone-700'}`}
            >
              <span className="block text-xs opacity-70">{names[i]}</span>
              <span className="block text-sm font-medium">{d.getDate()}</span>
              <span className={`mx-auto mt-0.5 block h-1.5 w-1.5 rounded-full ${has ? (on ? 'bg-on-accent' : 'bg-accent') : ''}`} />
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Card label="필사 수" value={`${num(items.length)}개`} />
        <Card label="글자 수" value={`${num(chars(items))}자`} />
      </div>

      <div className="mt-4">
        <DayList items={items} titleOf={titleOf} />
      </div>
    </div>
  );
}

// ───────────────── 연간 통계 ─────────────────
function YearStats({ books, transcriptions }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());

  const months = useMemo(() => {
    const arr = Array.from({ length: 12 }, () => ({ count: 0, chars: 0 }));
    for (const t of transcriptions) {
      if (dayKey(t.created_at).slice(0, 4) !== String(year)) continue;
      const m = new Date(t.created_at).getMonth();
      arr[m].count += 1;
      arr[m].chars += [...t.content].length;
    }
    return arr;
  }, [transcriptions, year]);

  const totalCount = months.reduce((n, m) => n + m.count, 0);
  const totalChars = months.reduce((n, m) => n + m.chars, 0);
  // 월 평균: 올해는 지금 달까지, 지난 해는 12달로 나눕니다
  const divisor = year === now.getFullYear() ? now.getMonth() + 1 : 12;
  const avg = Math.round((totalCount / divisor) * 10) / 10;
  const max = Math.max(...months.map((m) => m.count));
  const topMonth = max > 0 ? months.findIndex((m) => m.count === max) + 1 : null;
  const doneInYear = books.filter(
    (b) => b.status === 'COMPLETED' && b.completed_at && dayKey(b.completed_at).startsWith(String(year))
  ).length;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setYear((y) => y - 1)} aria-label="이전 해" className="px-3 py-1 text-lg text-stone-600">‹</button>
        <p className="text-sm font-semibold">{year}년</p>
        <button onClick={() => setYear((y) => y + 1)} aria-label="다음 해" className="px-3 py-1 text-lg text-stone-600">›</button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Card label="1년 동안" value={`필사 ${num(totalCount)}개`} sub={`${num(totalChars)}자`} />
        <Card label="월 평균" value={`${avg}개`} sub={`완독 ${doneInYear}권`} />
      </div>
      <div className="mt-2">
        <Card label="가장 많이 필사한 달" value={topMonth ? `${topMonth}월` : '-'} sub={topMonth ? `필사 ${max}개` : '아직 기록이 없어요'} />
      </div>

      <div className="mt-5 flex h-28 items-end gap-1.5 border-b border-stone-200">
        {months.map((m, i) => (
          <div key={i} className="flex h-full flex-1 flex-col justify-end" title={`${i + 1}월 ${m.count}개`}>
            <div
              className={`w-full rounded-t ${i + 1 === topMonth ? 'bg-accent' : 'bg-stone-300'}`}
              style={{ height: max > 0 ? `${(m.count / max) * 100}%` : '0%', minHeight: m.count > 0 ? 3 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5 text-center text-[11px] text-stone-400">
        {months.map((_, i) => (
          <span key={i} className="flex-1">{i + 1}</span>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-stone-400">월별 필사 개수</p>
    </div>
  );
}
