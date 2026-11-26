import { useMemo, useState } from 'react';
import { KIND_LABEL, filterByKind } from '../lib/storage.js';
import { dayKey, pad } from '../lib/date.js';
import { DayList, MonthPicker, groupByDay, loadCalSettings, weekdayNames } from './CalendarView.jsx';
import Chip from './Chip.jsx';
import GoalCard from './GoalCard.jsx';

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

// 종류 필터 칩 (일간·월간 통계가 함께 씁니다)
function KindChips({ kind, setKind }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Chip active={kind === 'all'} onClick={() => setKind('all')}>전체</Chip>
      {Object.entries(KIND_LABEL).map(([k, label]) => (
        <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{label}</Chip>
      ))}
      <Chip active={kind === 'none'} onClick={() => setKind('none')}>미분류</Chip>
    </div>
  );
}

export default function StatsView({ books, transcriptions }) {
  const [tab, setTab] = useState('day'); // day | month | year
  // 월간 통계가 보여 줄 달 (연간 통계에서 달을 누르면 이 값이 바뀌고 월간으로 넘어옵니다)
  const [monthCur, setMonthCur] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  // 일간 통계가 보여 줄 날 (월간 통계에서 날짜 막대를 누르면 이 값이 바뀌고 일간으로 넘어옵니다)
  const [daySel, setDaySel] = useState(() => new Date());
  const total = transcriptions.length;
  // 목표·월간·연간 통계와 같은 기준입니다: 완독 날짜(completed_at)가 있는 완독 책만 셉니다.
  const completed = books.filter((b) => b.status === 'COMPLETED' && b.completed_at).length;

  return (
    <div className="px-4 pt-6">
      <h1 className="font-body text-2xl font-bold">통계</h1>

      <p className="mt-4 text-xs font-medium text-stone-500">전체 기간</p>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        <Card label="필사" value={`${num(total)}개`} />
        <Card label="글자 수" value={`${num(chars(transcriptions))}자`} />
        <Card label="완독한 책" value={`${num(completed)}권`} />
      </div>

      <GoalCard books={books} />

      <div className="mt-5 grid grid-cols-3 border-b border-stone-200 text-sm">
        {[['day', '일간 통계'], ['month', '월간 통계'], ['year', '연간 통계']].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`py-2 ${tab === k ? 'border-b-2 border-accent font-semibold' : 'text-stone-400'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'day' && (
        <DayStats books={books} transcriptions={transcriptions} selected={daySel} setSelected={setDaySel} />
      )}
      {tab === 'month' && (
        <MonthStats
          books={books}
          transcriptions={transcriptions}
          cur={monthCur}
          setCur={setMonthCur}
          onOpenDay={(y, m, d) => {
            setDaySel(new Date(y, m, d));
            setTab('day');
          }}
        />
      )}
      {tab === 'year' && (
        <YearStats
          books={books}
          transcriptions={transcriptions}
          onOpenMonth={(y, m) => {
            setMonthCur({ y, m });
            setTab('month');
          }}
        />
      )}
    </div>
  );
}

// ───────────────── 일간 통계 ─────────────────
function DayStats({ books, transcriptions, selected, setSelected }) {
  const { weekStart } = loadCalSettings();
  const [kind, setKind] = useState('all'); // all | quote | mine | none
  const [picking, setPicking] = useState(false); // 연·월 고르기 창이 열려 있는지
  const names = weekdayNames(weekStart);

  const filtered = useMemo(() => filterByKind(transcriptions, kind), [transcriptions, kind]);
  const byDay = useMemo(() => groupByDay(filtered), [filtered]);
  const markedMonths = useMemo(() => new Set(Object.keys(byDay).map((k) => k.slice(0, 7))), [byDay]);
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
  // 미래는 볼 수 없으므로, 오늘이 든 주에서는 다음 주로 못 가고 오늘 이후 날짜는 누를 수 없습니다.
  const todayKey = keyOf(new Date());
  const weekHasToday = week.some((d) => keyOf(d) >= todayKey);
  const items = byDay[selKey] || [];
  // 그날 완독한 책 (달력과 같은 기준: 완독 날짜가 있는 완독 책)
  const doneTitles = books
    .filter((b) => b.status === 'COMPLETED' && b.completed_at && dayKey(b.completed_at) === selKey)
    .map((b) => b.title);
  const moveWeek = (delta) => {
    const d = new Date(selected);
    d.setDate(d.getDate() + delta * 7);
    // 일주일 뒤가 오늘보다 늦으면(미래) 오늘로 맞춥니다.
    setSelected(keyOf(d) > todayKey ? new Date() : d);
  };
  // 달을 고르면 그 달 1일이 있는 주로 이동합니다. (이번 달이면 오늘)
  const pickMonth = (y, m) => {
    const now = new Date();
    setSelected(y === now.getFullYear() && m === now.getMonth() ? now : new Date(y, m, 1));
    setPicking(false);
  };

  return (
    <div className="mt-4">
      <KindChips kind={kind} setKind={setKind} />

      <div className="mt-4 rounded-xl border border-stone-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <button onClick={() => moveWeek(-1)} aria-label="이전 주" className="px-3 py-1 text-lg text-stone-600">‹</button>
        <button
          onClick={() => setPicking((v) => !v)}
          aria-expanded={picking}
          aria-label="연·월 고르기"
          className="rounded-lg px-3 py-1 text-sm font-semibold"
        >
          {selected.getFullYear()}년 {selected.getMonth() + 1}월{' '}
          <span className="text-xs text-stone-400">{picking ? '▴' : '▾'}</span>
        </button>
        <button
          onClick={() => moveWeek(1)}
          disabled={weekHasToday}
          aria-label="다음 주"
          className="px-3 py-1 text-lg text-stone-600 disabled:opacity-30"
        >
          ›
        </button>
      </div>
      {picking && (
        <MonthPicker
          key={`${selected.getFullYear()}-${selected.getMonth()}`}
          year={selected.getFullYear()}
          month={selected.getMonth()}
          marked={markedMonths}
          onPick={pickMonth}
          onClose={() => setPicking(false)}
          noFuture
        />
      )}

      <div className="mt-2 grid grid-cols-7 gap-1 text-center">
        {week.map((d, i) => {
          const k = keyOf(d);
          const has = (byDay[k] || []).length > 0;
          const on = k === selKey;
          return (
            <button
              key={k}
              onClick={() => setSelected(d)}
              disabled={k > todayKey}
              className={`rounded-lg py-1.5 disabled:opacity-30 ${on ? 'bg-accent text-on-accent' : 'text-stone-700'}`}
            >
              <span className="block text-xs opacity-70">{names[i]}</span>
              <span className="block text-sm font-medium">{d.getDate()}</span>
              <span className={`mx-auto mt-0.5 block h-1.5 w-1.5 rounded-full ${has ? (on ? 'bg-on-accent' : 'bg-accent') : ''}`} />
            </button>
          );
        })}
      </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Card label="필사 수" value={`${num(items.length)}개`} />
        <Card label="글자 수" value={`${num(chars(items))}자`} />
      </div>
      {doneTitles.length > 0 && (
        <div className="mt-2">
          <Card label="✓ 완독한 책" value={doneTitles.join(', ')} />
        </div>
      )}

      <div className="mt-4">
        <DayList key={selKey} items={items} titleOf={titleOf} />
      </div>
    </div>
  );
}

// ───────────────── 월간 통계 ─────────────────
function MonthStats({ books, transcriptions, cur, setCur, onOpenDay }) {
  const [kind, setKind] = useState('all'); // all | quote | mine | none
  const [picking, setPicking] = useState(false); // 연·월 고르기 창이 열려 있는지

  const filtered = useMemo(() => filterByKind(transcriptions, kind), [transcriptions, kind]);
  const byDay = useMemo(() => groupByDay(filtered), [filtered]);
  const markedMonths = useMemo(() => new Set(Object.keys(byDay).map((k) => k.slice(0, 7))), [byDay]);

  const ym = `${cur.y}-${pad(cur.m + 1)}`;
  const daysInMonth = new Date(cur.y, cur.m + 1, 0).getDate();
  // 날짜별 필사 개수 (1일부터 말일까지)
  const days = Array.from({ length: daysInMonth }, (_, i) => (byDay[`${ym}-${pad(i + 1)}`] || []).length);
  const monthItems = days.flatMap((_, i) => byDay[`${ym}-${pad(i + 1)}`] || []);
  const count = monthItems.length;
  const activeDays = days.filter((n) => n > 0).length;
  const max = Math.max(...days);
  const topDay = max > 0 ? days.indexOf(max) + 1 : null;
  const done = books.filter(
    (b) => b.status === 'COMPLETED' && b.completed_at && dayKey(b.completed_at).startsWith(ym)
  ).length;

  // 미래는 볼 수 없으므로 이번 달(또는 그 이후)에서는 다음 달로 못 갑니다.
  const nowD = new Date();
  const isThisMonth = cur.y * 12 + cur.m >= nowD.getFullYear() * 12 + nowD.getMonth();
  const move = (delta) => {
    const d = new Date(cur.y, cur.m + delta, 1);
    setCur({ y: d.getFullYear(), m: d.getMonth() });
  };
  const pick = (y, m) => {
    setCur({ y, m });
    setPicking(false);
  };

  return (
    <div className="mt-4">
      <KindChips kind={kind} setKind={setKind} />

      <div className="mt-4 flex items-center justify-between">
        <button onClick={() => move(-1)} aria-label="이전 달" className="px-3 py-1 text-lg text-stone-600">‹</button>
        <button
          onClick={() => setPicking((v) => !v)}
          aria-expanded={picking}
          aria-label="연·월 고르기"
          className="rounded-lg px-3 py-1 text-sm font-semibold"
        >
          {cur.y}년 {cur.m + 1}월 <span className="text-xs text-stone-400">{picking ? '▴' : '▾'}</span>
        </button>
        <button
          onClick={() => move(1)}
          disabled={isThisMonth}
          aria-label="다음 달"
          className="px-3 py-1 text-lg text-stone-600 disabled:opacity-30"
        >
          ›
        </button>
      </div>
      {picking && (
        <MonthPicker
          key={ym}
          year={cur.y}
          month={cur.m}
          marked={markedMonths}
          onPick={pick}
          onClose={() => setPicking(false)}
          noFuture
        />
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Card label="이 달 필사" value={`${num(count)}개`} />
        <Card label="글자 수" value={`${num(chars(monthItems))}자`} />
        <Card label="필사한 날" value={`${activeDays}일`} />
        <Card label="완독한 책" value={`${done}권`} />
      </div>
      <div className="mt-2">
        <Card
          label="가장 많이 필사한 날"
          value={topDay ? `${cur.m + 1}월 ${topDay}일` : '-'}
          sub={topDay ? `필사 ${max}개` : '아직 기록이 없어요.'}
        />
      </div>

      <div className="mt-4 rounded-xl border border-stone-200 bg-white p-3">
      <div className="flex h-28 items-end gap-px border-b border-stone-200">
        {days.map((n, i) => (
          <button
            key={i}
            onClick={() => onOpenDay(cur.y, cur.m, i + 1)}
            disabled={dayKey(new Date(cur.y, cur.m, i + 1)) > dayKey(new Date())}
            aria-label={`${cur.m + 1}월 ${i + 1}일 필사 ${n}개, 일간 통계 보기`}
            className="flex h-full flex-1 flex-col justify-end disabled:cursor-default"
            title={`${cur.m + 1}월 ${i + 1}일 ${n}개`}
          >
            <div
              className={`w-full rounded-t ${i + 1 === topDay ? 'bg-accent' : 'bg-stone-300'}`}
              style={{ height: max > 0 ? `${(n / max) * 100}%` : '0%', minHeight: n > 0 ? 3 : 0 }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-px text-center text-[11px] text-stone-400">
        {days.map((_, i) => (
          <span key={i} className="flex-1">
            {i === 0 || (i + 1) % 5 === 0 ? i + 1 : ''}
          </span>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-stone-400">날짜별 필사 개수 · 막대를 누르면 일간 통계로 가요.</p>
      </div>
    </div>
  );
}

// ───────────────── 연도 고르기 창 (올해 기준 과거 5년과 올해, 미래는 없음) ─────────────────
const YEAR_RANGE = 5;

function YearPicker({ year, thisYear, marked, onPick, onClose }) {
  const years = Array.from({ length: YEAR_RANGE + 1 }, (_, i) => thisYear - YEAR_RANGE + i);
  return (
    <div className="mx-auto mt-2 max-w-sm rounded-xl border border-stone-200 bg-white p-3">
      <div className="grid grid-cols-4 gap-2">
        {years.map((y) => {
          const on = y === year;
          const has = marked.has(y);
          return (
            <button
              key={y}
              onClick={() => onPick(y)}
              aria-label={`${y}년${has ? ' 필사 있음' : ''}`}
              className={`relative rounded-lg py-2 text-sm ${
                on ? 'bg-accent text-on-accent' : 'border border-stone-200 text-stone-700'
              } ${!on && y === thisYear ? 'ring-1 ring-stone-400' : ''}`}
            >
              {y}
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
        <button onClick={() => onPick(thisYear)} className="px-2 py-1">올해</button>
        <button onClick={onClose} className="px-2 py-1">닫기</button>
      </div>
    </div>
  );
}

// ───────────────── 연간 통계 ─────────────────
function YearStats({ books, transcriptions, onOpenMonth }) {
  const now = new Date();
  const thisYear = now.getFullYear();
  const maxYear = thisYear; // 미래 연도로는 이동하지 않습니다
  const minYear = thisYear - YEAR_RANGE; // 연도 고르기 창과 같이 과거 5년까지만 이동합니다
  // 올해에서 아직 오지 않은 달은 월간 통계로 열 수 없습니다.
  const isFutureMonth = (i) => year > thisYear || (year === thisYear && i > now.getMonth());
  const [year, setYear] = useState(thisYear);
  const [picking, setPicking] = useState(false); // 연도 고르기 창이 열려 있는지

  // 필사가 있는 해 (고르기 창에 점으로 표시)
  const markedYears = useMemo(
    () => new Set(transcriptions.map((t) => Number(dayKey(t.created_at).slice(0, 4)))),
    [transcriptions]
  );

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
  const divisor = year === thisYear ? now.getMonth() + 1 : 12;
  const avg = Math.round((totalCount / divisor) * 10) / 10;
  const max = Math.max(...months.map((m) => m.count));
  const topMonth = max > 0 ? months.findIndex((m) => m.count === max) + 1 : null;
  const doneInYear = books.filter(
    (b) => b.status === 'COMPLETED' && b.completed_at && dayKey(b.completed_at).startsWith(String(year))
  ).length;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setYear((y) => Math.max(y - 1, minYear))}
          disabled={year <= minYear}
          aria-label="이전 해"
          className="px-3 py-1 text-lg text-stone-600 disabled:opacity-30"
        >
          ‹
        </button>
        <button
          onClick={() => setPicking((v) => !v)}
          aria-expanded={picking}
          aria-label="연도 고르기"
          className="rounded-lg px-3 py-1 text-sm font-semibold"
        >
          {year}년 <span className="text-xs text-stone-400">{picking ? '▴' : '▾'}</span>
        </button>
        <button
          onClick={() => setYear((y) => Math.min(y + 1, maxYear))}
          disabled={year >= maxYear}
          aria-label="다음 해"
          className="px-3 py-1 text-lg text-stone-600 disabled:opacity-30"
        >
          ›
        </button>
      </div>
      {picking && (
        <YearPicker
          year={year}
          thisYear={thisYear}
          marked={markedYears}
          onPick={(y) => {
            setYear(y);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Card label="1년 동안" value={`필사 ${num(totalCount)}개`} sub={`${num(totalChars)}자`} />
        <Card label="월 평균" value={`${avg}개`} sub={`완독 ${doneInYear}권`} />
      </div>
      <div className="mt-2">
        <Card label="가장 많이 필사한 달" value={topMonth ? `${topMonth}월` : '-'} sub={topMonth ? `필사 ${max}개` : '아직 기록이 없어요.'} />
      </div>

      <div className="mt-4 rounded-xl border border-stone-200 bg-white p-3">
      <div className="flex h-28 items-end gap-1.5 border-b border-stone-200">
        {months.map((m, i) => (
          <button
            key={i}
            onClick={() => onOpenMonth(year, i)}
            disabled={isFutureMonth(i)}
            aria-label={`${year}년 ${i + 1}월 월간 통계 보기, 필사 ${m.count}개`}
            title={`${i + 1}월 ${m.count}개`}
            className="flex h-full flex-1 flex-col justify-end disabled:cursor-default"
          >
            <div
              className={`w-full rounded-t ${i + 1 === topMonth ? 'bg-accent' : 'bg-stone-300'}`}
              style={{ height: max > 0 ? `${(m.count / max) * 100}%` : '0%', minHeight: m.count > 0 ? 3 : 0 }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5 text-center text-[11px] text-stone-400">
        {months.map((_, i) => (
          <button
            key={i}
            onClick={() => onOpenMonth(year, i)}
            disabled={isFutureMonth(i)}
            aria-label={`${year}년 ${i + 1}월 월간 통계 보기`}
            className="flex-1 py-1 disabled:opacity-40"
          >
            {i + 1}
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-stone-400">월별 필사 개수 · 달을 누르면 월간 통계로 가요.</p>
      </div>
    </div>
  );
}
