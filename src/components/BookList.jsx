import { useMemo, useRef, useState } from 'react';
import Chip from './Chip.jsx';
import EmptyState from './EmptyState.jsx';
import Note, { DOUBT_WARNING, RichText } from './Note.jsx';
import Pager, { usePaging } from './Pager.jsx';
import SearchView, { Highlight, buildPattern, findTranscriptions } from './SearchView.jsx';
import { MonthPicker, loadCalSettings, saveCalSettings } from './CalendarView.jsx';
import { buildReadingDocument } from '../lib/calendarExport.js';
import { dayKey, dotDate, fileStamp } from '../lib/date.js';
import {
  ACCENT_OPTIONS,
  BODY_FONT_IDS,
  COLS_OPTIONS,
  COVER_OPTIONS,
  FONT_OPTIONS,
  LETTER_OPTIONS,
  LIMITS,
  ROUND_OPTIONS,
  SHADE_OPTIONS,
  SIZE_OPTIONS,
  THEME_OPTIONS,
  UI_FONT_IDS,
  addRecentSearch,
  buildBackup,
  clearGoals,
  clearRecentSearches,
  countChars,
  coverColors,
  downloadTextFile,
  getLastBackup,
  loadRecentSearches,
  markBackup,
  pageText,
  parseBackup,
  removeRecentSearch,
  showLimitCount,
  storageUsage,
  updateSettings,
  useSettings,
} from '../lib/storage.js';

export const STATUS_LABEL = {
  WISH: '읽고 싶은',
  READING: '읽는 중',
  COMPLETED: '완독',
  STOPPED: '중단',
};

const STATUS_STYLE = {
  WISH: 'bg-indigo-100 text-indigo-800',
  READING: 'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  STOPPED: 'bg-stone-200 text-stone-600',
};

const SORTS = {
  recent: '최근 필사순',
  created: '등록순',
  title: '제목순',
  author: '저자순',
  count: '필사 많은 순',
};

const DAY = 24 * 60 * 60 * 1000;

// 표지 안에 들어가는 글자: 제목 전체 또는 제목 + 저자 (small = 설정 미리보기용)
function CoverText({ title, author, mode, cols, small }) {
  if (mode === 'none') return null;
  const titleSize = small
    ? cols === 2
      ? 'text-sm'
      : 'text-xs'
    : cols === 2
    ? 'text-xl'
    : 'text-base';
  const authorSize = small ? 'text-[10px]' : cols === 2 ? 'text-sm' : 'text-xs';
  const clamp = small ? 'line-clamp-3' : 'line-clamp-4';
  const name = (author || '').trim();
  return (
    <div className="w-full px-2 text-center">
      <p className={`font-body font-bold leading-snug ${titleSize} ${clamp}`}>
        {title}
      </p>
      {mode === 'author' && name && (
        <p className={`mt-1.5 truncate ${authorSize}`}>{name}</p>
      )}
    </div>
  );
}

// 목록형에서 쓰는 짧은 날짜: 올해면 "11.19", 다른 해면 "2025.12.03"
function shortDate(iso) {
  const full = dotDate(iso);
  return full.slice(0, 4) === String(new Date().getFullYear()) ? full.slice(5) : full;
}

// "오늘 / N일 전": 달력·통계와 같은 날짜(dayKey, 기기의 날짜) 기준으로 셉니다.
// (24시간이 지났는지로 세면 밤늦게 쓴 필사가 다음 날 새벽까지 "오늘"로 남아 달력과 하루 어긋납니다.)
function daysAgo(iso) {
  const d = Math.round((new Date(dayKey(new Date())) - new Date(dayKey(iso))) / DAY);
  return d <= 0 ? '오늘' : `${d}일 전`;
}

// ───────────────── 책장 탭 ─────────────────
export default function BookList({
  books,
  transcriptions,
  onAdd,
  onOpen,
  onDeleteBooks,
  query, // 검색어(App이 들고 있어 책 상세·다른 탭에 다녀와도 유지됨)
  setQuery,
  scope, // 검색 범위: all(전체) | book(책) | tx(필사)
  setScope,
  txKind, // 필사 범위의 종류 필터: all | quote | mine | none
  setTxKind,
}) {
  const [recent, setRecent] = useState(loadRecentSearches); // 최근 검색어
  const [searchFocused, setSearchFocused] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [publisher, setPublisher] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [sort, setSort] = useState('recent');
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState([]);
  const settings = useSettings(); // 화면 구성 편집에서 고른 표지·카드 설정

  // 책 등록 순서(0부터): 표지 밝기 '자동 순환'에 씁니다. 정렬을 바꿔도 색이 그대로입니다.
  const rankOf = useMemo(() => {
    const m = {};
    [...books]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .forEach((b, i) => {
        m[b.book_id] = i;
      });
    return m;
  }, [books]);

  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    // 제목과 저자가 같은 책이 이미 있으면 확인합니다(재독·다른 판본은 허용).
    // 저자가 비어 있는 쪽이 있으면 저자를 알 수 없으므로 제목만 같아도 확인합니다.
    // 저자는 한쪽이 다른 쪽을 포함해도("헤르만"과 "헤르만 헤세") 같은 저자로 봅니다.
    const norm = (s) => (s || '').trim().toLowerCase();
    const same = (a, b) => norm(a) === norm(b);
    // 출판사는 두 책 모두 있고 서로 다르면 다른 판본으로 봅니다(비어 있으면 모르므로 같은 것으로 봅니다).
    const similar = (a, b) => {
      const x = norm(a);
      const y = norm(b);
      return !x || !y || x.includes(y) || y.includes(x);
    };
    if (
      books.some(
        (b) =>
          same(b.title, title) &&
          similar(b.author, author) &&
          similar(b.publisher, publisher)
      ) &&
      !window.confirm('같은 책이 이미 있어요. 그래도 추가할까요?')
    ) {
      return;
    }
    onAdd({ title, author, publisher });
    setTitle('');
    setAuthor('');
    setPublisher('');
    setShowForm(false);
  };

  // 책별 필사 개수·마지막 필사 시각
  const stats = useMemo(() => {
    const m = {};
    for (const t of transcriptions) {
      const s = m[t.book_id] || (m[t.book_id] = { count: 0, last: '' });
      s.count += 1;
      if (t.created_at > s.last) s.last = t.created_at;
    }
    return m;
  }, [transcriptions]);

  const countOf = (status) =>
    status === 'ALL' ? books.length : books.filter((b) => b.status === status).length;

  const visible = useMemo(() => {
    // 검색어: 제목·저자에서 찾습니다. 띄어쓰기와 대소문자는 구분하지 않습니다.
    const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, '');
    const q = norm(query);
    const list = books.filter(
      (b) =>
        (filter === 'ALL' || b.status === filter) &&
        (!q || norm(b.title).includes(q) || norm(b.author).includes(q) || norm(b.publisher).includes(q))
    );
    const lastOf = (b) => stats[b.book_id]?.last || b.created_at;
    const cmp = {
      recent: (a, b) => lastOf(b).localeCompare(lastOf(a)),
      created: (a, b) => b.created_at.localeCompare(a.created_at),
      title: (a, b) => a.title.localeCompare(b.title, 'ko'),
      // 저자 없는 책은 맨 뒤, 저자가 같으면 제목순
      author: (a, b) => {
        const x = (a.author || '').trim();
        const y = (b.author || '').trim();
        if (!x && y) return 1;
        if (x && !y) return -1;
        return x.localeCompare(y, 'ko') || a.title.localeCompare(b.title, 'ko');
      },
      count: (a, b) =>
        (stats[b.book_id]?.count || 0) - (stats[a.book_id]?.count || 0),
    }[sort];
    return [...list].sort(cmp);
  }, [books, filter, sort, stats, query]);

  // ---- 검색: 책(제목·저자)과 필사(본문·메모)를 한 칸에서 찾습니다 ----
  const hasQuery = query.trim() !== '';
  const effScope = editMode ? 'book' : hasQuery ? scope : 'all'; // 편집 모드에서는 책만 보여 줍니다
  const found = useMemo(() => findTranscriptions(transcriptions, query), [transcriptions, query]);
  const bookMatchCount = useMemo(() => {
    const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, '');
    const q = norm(query);
    return q
      ? books.filter(
          (b) => norm(b.title).includes(q) || norm(b.author).includes(q) || norm(b.publisher).includes(q)
        ).length
      : 0;
  }, [books, query]);

  // 책이 검색에 걸린 이유: 제목에는 없고 저자(또는 출판사)에만 있을 때 그 줄을 카드에 보여 줍니다.
  const searchPattern = useMemo(() => buildPattern(query), [query]);
  const matchReason = (b) => {
    if (!searchPattern) return null;
    const hit = (s) => {
      searchPattern.lastIndex = 0;
      return searchPattern.test(s || '');
    };
    if (hit(b.title)) return null;
    if (hit(b.author)) return { label: '저자', text: b.author };
    if (hit(b.publisher)) return { label: '출판사', text: b.publisher };
    return null;
  };

  // 최근 검색어는 엔터를 누르거나 결과를 눌러 이동할 때만 저장합니다(입력 도중에는 저장하지 않음).
  const rememberSearch = () => {
    if (hasQuery) setRecent(addRecentSearch(query));
  };
  const openBook = (id) => {
    rememberSearch();
    onOpen(id);
  };
  // 검색어를 모두 지우면 범위와 필사 종류도 처음(전체)으로 돌아갑니다.
  const changeQuery = (v) => {
    setQuery(v);
    if (!v.trim()) {
      setScope('all');
      setTxKind('all');
    }
  };

  const toggleSelect = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const allSelected = visible.length > 0 && visible.every((b) => selected.includes(b.book_id));
  const toggleAll = () =>
    setSelected(allSelected ? [] : visible.map((b) => b.book_id));

  const exitEdit = () => {
    setEditMode(false);
    setSelected([]);
  };

  const deleteSelected = () => {
    if (selected.length === 0) return;
    if (
      window.confirm(
        `선택한 책 ${selected.length}권과 모든 필사 기록을 삭제할까요? 삭제한 뒤 10초 안에는 되돌릴 수 있어요.`
      )
    ) {
      onDeleteBooks(selected);
      exitEdit();
    }
  };

  return (
    <div className="px-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="font-body text-2xl font-bold">북앤펜</h1>
        <div className="flex items-center gap-3 text-sm">
          {!editMode && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="text-stone-600"
            >
              {showForm ? '닫기' : '+ 책 등록'}
            </button>
          )}
          {books.length > 0 && (
            <button
              onClick={() => (editMode ? exitEdit() : setEditMode(true))}
              className="text-stone-600"
            >
              {editMode ? '완료' : '편집'}
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-sm text-stone-500">
        책 사진을 찍으면 글이 인식돼요. 모든 기록은 이 기기에만 저장돼요.
      </p>

      {showForm && !editMode && (
        <form
          onSubmit={submit}
          className="mt-4 space-y-2 rounded-xl border border-stone-200 bg-white p-4"
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="책 제목 (필수)"
            maxLength={LIMITS.title}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-stone-500"
          />
          {showLimitCount(title, LIMITS.title) && (
            <p className="text-right text-xs text-stone-500">
              {countChars(title)} / {LIMITS.title}자
            </p>
          )}
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="저자"
            maxLength={LIMITS.author}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-stone-500"
          />
          {showLimitCount(author, LIMITS.author) && (
            <p className="text-right text-xs text-stone-500">
              {countChars(author)} / {LIMITS.author}자
            </p>
          )}
          <input
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
            placeholder="출판사"
            maxLength={LIMITS.publisher}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-stone-500"
          />
          {showLimitCount(publisher, LIMITS.publisher) && (
            <p className="text-right text-xs text-stone-500">
              {countChars(publisher)} / {LIMITS.publisher}자
            </p>
          )}
          <button
            type="submit"
            disabled={!title.trim()}
            className="w-full rounded-lg bg-accent py-2.5 font-medium text-on-accent disabled:bg-stone-300"
          >
            등록하기
          </button>
        </form>
      )}

      {books.length > 0 && (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault(); // 키보드의 검색(엔터)
            rememberSearch();
            e.currentTarget.querySelector('input')?.blur();
          }}
        >
          <div className="relative">
            <input
              type="search"
              value={query}
              onChange={(e) => changeQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              placeholder="제목·저자·출판사·필사 내용에서 찾기"
              aria-label="책과 필사 검색"
              className="w-full rounded-xl border border-stone-300 bg-white py-2 pl-3 pr-10 text-base outline-none focus:border-stone-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => changeQuery('')}
                aria-label="검색어 지우기"
                className="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-1 text-stone-400"
              >
                ✕
              </button>
            )}
          </div>
          {/* 최근 검색어: 검색 칸을 눌렀고 아직 입력이 없을 때만 보입니다. */}
          {searchFocused && !hasQuery && !editMode && recent.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-stone-500">
                <span>최근 검색</span>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('최근 검색어를 모두 지울까요?')) {
                      clearRecentSearches();
                      setRecent([]);
                    }
                  }}
                >
                  모두 지우기
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {recent.map((t) => (
                  <span
                    key={t}
                    className="flex items-center rounded-full border border-stone-300 bg-white text-xs text-stone-600"
                  >
                    <button type="button" onClick={() => setQuery(t)} className="py-1 pl-3 pr-1.5">
                      {t}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecent(removeRecentSearch(t))}
                      aria-label={`${t} 지우기`}
                      className="py-1 pl-0.5 pr-2.5 text-stone-400"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </form>
      )}

      {/* 검색 범위 칩: 검색어가 있을 때만 보이고, 숫자는 결과 개수입니다. */}
      {hasQuery && !editMode && (
        <div className="mt-3 flex gap-1.5">
          {[
            ['all', '전체'],
            ['book', `책(제목·저자·출판사) ${bookMatchCount}`],
            ['tx', `필사 ${found.length}`],
          ].map(([v, label]) => (
            <Chip key={v} active={scope === v} onClick={() => setScope(v)}>
              {label}
            </Chip>
          ))}
        </div>
      )}

      {/* 필사 범위에서는 책용 도구(상태 칩·정렬·보기 전환)를 숨깁니다. */}
      {effScope !== 'tx' && (
        <>
      {/* 상태 칩: 한 줄로 늘어놓고 넘치면 옆으로 밀어서 봅니다. */}
      <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
        {[['ALL', '전체'], ...Object.entries(STATUS_LABEL)].map(([v, label]) => (
          <span key={v} className="shrink-0">
            <Chip active={filter === v} onClick={() => setFilter(v)}>
              {label} {countOf(v)}
            </Chip>
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-b border-stone-200 pb-2">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="정렬"
          className="bg-transparent text-sm text-stone-600 outline-none"
        >
          {Object.entries(SORTS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        {/* 보기 전환: 표지형 / 목록형 (선택은 화면 설정에 저장) */}
        <div className="flex gap-1">
          {[
            ['cover', '▦', '표지형 보기'],
            ['list', '☰', '목록형 보기'],
          ].map(([v, icon, label]) => (
            <button
              key={v}
              onClick={() => updateSettings({ view: v })}
              aria-label={label}
              aria-pressed={settings.view === v}
              className={`rounded-md border px-2.5 py-1 text-sm ${
                settings.view === v
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-stone-300 bg-white text-stone-500'
              }`}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>
        </>
      )}

      {editMode && visible.length > 0 && (
        <div className="mt-2 flex items-center justify-between border-b border-stone-200 pb-2 text-sm">
          <button onClick={toggleAll} className="font-medium text-stone-700">
            {allSelected ? '전체 해제' : `전체 선택 (${visible.length})`}
          </button>
          <span className="text-stone-500">{selected.length}권 선택</span>
        </div>
      )}

      {/* "전체" 범위에서 검색 중이면 책 구역임을 표시합니다. */}
      {effScope === 'all' && hasQuery && books.length > 0 && (
        <h2 className="mt-4 text-sm font-semibold text-stone-700">책 ({visible.length})</h2>
      )}

      {effScope === 'tx' ? null : books.length === 0 ? (
        <div className="mt-8 rounded-xl border border-stone-200 bg-white p-5 text-center">
          <p className="font-body text-lg font-bold">첫 책을 등록해 보세요</p>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            책을 등록하고 페이지를 사진으로 찍으면
            <br />
            글자가 인식돼 필사 노트에 쌓여요.
          </p>
          <p className="mt-3 text-xs text-stone-500">
            1 책 등록 › 2 사진 찍기 › 3 고쳐서 저장
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-on-accent"
          >
            + 책 등록
          </button>
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          title={query.trim() ? '찾는 책이 없어요.' : '이 상태의 책이 없어요.'}
          hint={query.trim() ? '다른 글자로 찾아 보세요.' : '다른 상태를 눌러 보세요.'}
        />
      ) : settings.view === 'list' ? (
        <ul className="mt-4 space-y-2">
          {visible.map((b) => {
            const s = stats[b.book_id];
            const lastIso = s?.last || b.created_at;
            const isNew = Date.now() - new Date(lastIso).getTime() < 3 * DAY;
            const checked = selected.includes(b.book_id);
            return (
              <li key={b.book_id}>
                <button
                  onClick={() => (editMode ? toggleSelect(b.book_id) : openBook(b.book_id))}
                  className={`flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left ${
                    checked ? 'border-accent' : 'border-stone-200'
                  }`}
                >
                  {editMode && (
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                        checked
                          ? 'border-accent bg-accent text-on-accent'
                          : 'border-stone-400 bg-white'
                      }`}
                    >
                      {checked ? '✓' : ''}
                    </span>
                  )}
                  {/* 작은 표지: 색은 표지 설정을 따르고, 글자는 제목의 첫 글자만 넣습니다. */}
                  <div
                    style={{
                      ...coverColors(settings, b.title, rankOf[b.book_id] || 0),
                      borderRadius: Math.min(settings.round, 10),
                    }}
                    className="relative flex aspect-[3/4] w-14 shrink-0 items-center justify-center shadow-sm"
                  >
                    <span className="font-body text-lg font-bold">{[...b.title][0]}</span>
                    {settings.showDot && isNew && !editMode && (
                      <span
                        className="absolute left-1 top-1 h-2 w-2 rounded-full bg-dot"
                        style={{ boxShadow: '0 0 0 1.5px rgba(255,255,255,0.8)' }}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-body text-base font-semibold leading-snug">
                      {b.title}
                    </p>
                    <p
                      className={`mt-0.5 truncate text-sm ${
                        b.author ? 'text-stone-500' : 'text-stone-400'
                      }`}
                    >
                      {b.author ? (
                        searchPattern ? (
                          <Highlight text={b.author} pattern={searchPattern} />
                        ) : (
                          b.author
                        )
                      ) : (
                        '저자 미입력'
                      )}
                    </p>
                    {matchReason(b)?.label === '출판사' && (
                      <p className="mt-0.5 truncate text-xs text-stone-500">
                        출판사: <Highlight text={b.publisher} pattern={searchPattern} />
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500">
                      {settings.showBadge && (
                        <span className={`rounded px-1.5 py-0.5 ${STATUS_STYLE[b.status]}`}>
                          {STATUS_LABEL[b.status]}
                        </span>
                      )}
                      <span>
                        {s?.count
                          ? `필사 ${s.count}개 · 마지막 ${shortDate(s.last)}`
                          : '필사 없음'}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul
          className={`mt-4 grid gap-3 ${
            settings.cols === 2 ? 'grid-cols-2' : 'grid-cols-3'
          }`}
        >
          {visible.map((b) => {
            const s = stats[b.book_id];
            const lastIso = s?.last || b.created_at;
            const isNew = Date.now() - new Date(lastIso).getTime() < 3 * DAY;
            const checked = selected.includes(b.book_id);
            return (
              <li key={b.book_id}>
                <button
                  onClick={() =>
                    editMode ? toggleSelect(b.book_id) : openBook(b.book_id)
                  }
                  className="block w-full text-left"
                >
                  <div
                    style={{
                      ...coverColors(settings, b.title, rankOf[b.book_id] || 0),
                      borderRadius: settings.round,
                    }}
                    className={`relative flex aspect-[3/4] items-center justify-center shadow-sm ${
                      checked ? 'ring-2 ring-accent' : ''
                    }`}
                  >
                    <CoverText
                      title={b.title}
                      author={b.author}
                      mode={settings.letter}
                      cols={settings.cols}
                    />
                    {settings.showDot && isNew && !editMode && (
                      <span
                        className="absolute left-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-dot"
                        style={{ boxShadow: '0 0 0 1.5px rgba(255,255,255,0.8)' }}
                      />
                    )}
                    {editMode && (
                      <span
                        className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
                          checked
                            ? 'border-accent bg-accent text-on-accent'
                            : 'border-stone-400 bg-white/80'
                        }`}
                      >
                        {checked ? '✓' : ''}
                      </span>
                    )}
                    {settings.showBadge && (
                      <span
                        className={`absolute bottom-1.5 right-1.5 rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[b.status]}`}
                      >
                        {STATUS_LABEL[b.status]}
                      </span>
                    )}
                  </div>
                  {/* 표지에 제목이 없을 때(없음)만 표지 아래에 제목을 보여 줍니다 */}
                  {settings.letter === 'none' && (
                    <p className="mt-1.5 line-clamp-2 font-body text-sm font-semibold leading-snug">
                      {b.title}
                    </p>
                  )}
                  <p
                    className={`truncate text-xs text-stone-500 ${
                      settings.letter === 'none' ? 'mt-0.5' : 'mt-1.5'
                    }`}
                  >
                    필사 {s?.count || 0}개
                    {s?.last ? ` · ${daysAgo(s.last)}` : ''}
                  </p>
                  {matchReason(b) && (
                    <p className="mt-0.5 truncate text-xs text-stone-500">
                      {matchReason(b).label}:{' '}
                      <Highlight text={matchReason(b).text} pattern={searchPattern} />
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* 필사 결과: "전체" 범위에서는 3개 미리보기, "필사" 범위에서는 전체 목록 */}
      {hasQuery && effScope !== 'book' && (
        <SearchView
          books={books}
          found={found}
          query={query}
          kindFilter={txKind}
          setKindFilter={setTxKind}
          onOpen={openBook}
          preview={effScope === 'all'}
          onShowAll={() => setScope('tx')}
        />
      )}

      {editMode && (
        <div className="fixed inset-x-0 bottom-14 mx-auto max-w-md bg-gradient-to-t from-stone-50 via-stone-50 to-transparent p-3 pt-6">
          <button
            onClick={deleteSelected}
            disabled={selected.length === 0}
            className="w-full rounded-xl bg-red-600 py-3 font-semibold text-white shadow-lg disabled:bg-stone-300"
          >
            {selected.length > 0 ? `선택한 책 ${selected.length}권 삭제` : '선택 삭제'}
          </button>
        </div>
      )}
    </div>
  );
}

// ───────────────── 즐겨찾기 탭 ─────────────────

export function FavoritesView({
  books,
  transcriptions,
  onOpen,
  onToggleFavorite,
  onUnfavorite, // (ids: string[]) => 여러 개 즐겨찾기 해제
}) {
  const [selecting, setSelecting] = useState(false); // 선택 모드
  const [picked, setPicked] = useState(() => new Set()); // 선택한 필사 id
  const [expanded, setExpanded] = useState(() => new Set()); // 펼친 필사 id
  const toggleExpanded = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const favs = transcriptions
    .filter((t) => t.favorite)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const bookOf = (id) => books.find((b) => b.book_id === id);

  // 목록 나누기 (해제로 목록 수가 줄어도 마지막 목록으로 보정)
  const { curPage, totalPages, pageItems, goPage } = usePaging(favs);

  const pickedIds = favs
    .filter((t) => picked.has(t.transcription_id))
    .map((t) => t.transcription_id);
  const allPicked = favs.length > 0 && pickedIds.length === favs.length;

  const togglePicked = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePickAll = () =>
    setPicked(allPicked ? new Set() : new Set(favs.map((t) => t.transcription_id)));
  const exitSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
  };

  const unfavoriteSelected = () => {
    if (pickedIds.length === 0) return;
    if (
      window.confirm(
        `선택한 ${pickedIds.length}개의 즐겨찾기를 해제할까요? 필사 내용은 지워지지 않아요.`
      )
    ) {
      onUnfavorite(pickedIds);
      exitSelecting();
    }
  };

  const unfavoriteAll = () => {
    if (favs.length === 0) return;
    if (
      window.confirm(
        `즐겨찾기 ${favs.length}개를 모두 해제할까요? ★만 해제되고 필사 내용은 지워지지 않아요.`
      )
    ) {
      onUnfavorite(favs.map((t) => t.transcription_id));
      exitSelecting();
    }
  };

  return (
    <div className="px-4 pt-6">
      <h1 className="font-body text-2xl font-bold">즐겨찾기</h1>
      <p className="mt-1 text-sm text-stone-500">
        별표를 단 문장을 모아 봐요. ({favs.length})
      </p>

      {favs.length > 0 && !selecting && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs">
          <button
            onClick={() => setSelecting(true)}
            className="rounded-md border border-stone-300 bg-white px-2 py-1 text-stone-600"
          >
            선택
          </button>
          <button
            onClick={unfavoriteAll}
            className="rounded-md border border-stone-300 bg-white px-2 py-1 text-stone-700"
          >
            전체 즐겨찾기 해제
          </button>
        </div>
      )}

      {selecting && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600">
          <span className="font-semibold">{pickedIds.length}개 선택</span>
          <button onClick={togglePickAll} className="underline">
            {allPicked ? '전체 선택 해제' : '전체 선택'}
          </button>
          <button
            onClick={unfavoriteSelected}
            disabled={pickedIds.length === 0}
            className="ml-auto rounded-md border border-stone-300 bg-white px-2 py-1 text-stone-700 disabled:opacity-40"
          >
            선택한 {pickedIds.length}개 해제
          </button>
          <button onClick={exitSelecting} className="ml-1 text-stone-500">
            취소
          </button>
        </div>
      )}

      {favs.length === 0 ? (
        <EmptyState title="책의 필사 옆 ☆를 눌러 보세요." className="mt-8" />
      ) : (
        <ul className="mt-4 space-y-3">
          {pageItems.map((t) => {
            const b = bookOf(t.book_id);
            const isPicked = picked.has(t.transcription_id);
            return (
              <li
                key={t.transcription_id}
                className={`rounded-xl border bg-white p-4 ${
                  selecting && isPicked ? 'border-accent' : 'border-stone-200'
                }`}
              >
                {selecting && (
                  <label className="mb-2 flex items-center gap-2 text-sm text-stone-600">
                    <input
                      type="checkbox"
                      checked={isPicked}
                      onChange={() => togglePicked(t.transcription_id)}
                      className="h-4 w-4"
                    />
                    선택
                  </label>
                )}
                <p
                  className={`whitespace-pre-wrap font-body text-base leading-relaxed ${
                    expanded.has(t.transcription_id) ? '' : 'line-clamp-4'
                  }`}
                >
                  {t.content}
                </p>
                {(t.content.length > 100 || t.content.split('\n').length > 4) && (
                  <button
                    onClick={() => toggleExpanded(t.transcription_id)}
                    className="mt-1 text-sm text-stone-500"
                  >
                    {expanded.has(t.transcription_id) ? '접기' : '더 보기'}
                  </button>
                )}
                <div className="mt-3 flex items-center text-xs text-stone-400">
                  <button
                    onClick={() => b && onOpen(b.book_id)}
                    className="min-w-0 truncate text-left text-stone-500 underline"
                  >
                    {b ? b.title : '삭제된 책'}
                    {t.page ? ` · ${pageText(t)}` : ''}
                  </button>
                  <button
                    onClick={() => onToggleFavorite(t.transcription_id)}
                    className="ml-auto text-lg text-amber-500"
                    aria-label="즐겨찾기 해제"
                  >
                    ★
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Pager curPage={curPage} totalPages={totalPages} goPage={goPage} />
    </div>
  );
}

// ───────────────── 설정 탭 (글자 설정 · 화면 구성 편집 · 데이터 · 정보 · 사용 방법) ─────────────────
// 사용 방법 항목: a의 **글자**는 굵게, tip은 💡 팁 상자, warn은 ⚠ 주의 상자로 보여 줍니다.
const GUIDE = [
  {
    q: '1. 책 등록하기',
    a: '책장 탭 오른쪽 위의 **+ 책 등록**을 누르고 제목을 입력한 뒤 **등록하기**를 누르세요.\n저자와 출판사는 비워도 돼요.',
    tip: '제목, 저자, 출판사를 잘못 썼다면 책을 열고 **책 정보 수정**에서 고칠 수 있어요.',
  },
  {
    q: '2. 사진으로 필사하기',
    a: '책을 열고 **📷 필사 추가하기**를 눌러 사진을 넣으세요.\n필요한 부분만 네모로 골라 **이 부분으로 인식하기**를 누르면 글자가 인식돼요.\n틀린 글자를 고친 뒤 **저장하기**를 누르면 끝이에요.\n지난 필사는 **기록한 날**을 바꿔서 넣을 수 있어요.\n며칠에 걸쳐 썼다면 날마다 나눠서 저장해 주세요. 달력과 통계에 날마다 기록돼요.',
    tip: '페이지 숫자와 머리글은 네모에서 빼 주세요. 인식이 안 맞으면 폰의 글자 복사 기능(구글 렌즈 등)으로 복사해 붙여 넣어도 돼요.\n글자를 못 찾았다는 안내가 나오면 **다시 고르기**로 영역을 넓히거나, **직접 입력하기**로 바로 적을 수 있어요.',
  },
  {
    q: '3. 마음에 든 문장 모아 보기',
    a: '필사 옆의 ☆를 누르면 ★가 되고 **즐겨찾기** 탭에 모여요.\n즐겨찾기 탭에서는 여러 개를 골라 한꺼번에 해제할 수도 있어요.',
    tip: '긴 필사는 4줄까지만 보여요. **더 보기**를 누르면 펼쳐져요.',
  },
  {
    q: '4. 책 찾고 정리하기',
    a: '> 책은 **칩·검색·정렬**로 찾고, **편집**으로 한꺼번에 정리해요.\n\n책장 위의 칩으로 상태별(읽고 싶은, 읽는 중, 완독, 중단)로 거르고, 검색 칸에서 책 제목, 저자, 필사 내용과 메모를 함께 찾을 수 있어요.\n검색어 아래의 칩(**전체 · 책 · 필사**)으로 찾을 범위를 바꿔요. **필사**를 누르면 필사만 모아 볼 수 있고, 검색 칸을 누르면 최근 검색어가 보여요.\n정렬(최근 필사순, 등록순, 제목순, 저자순, 필사 많은 순)은 칩 아래에서, 보기 방식(▦ 표지형 / ☰ 목록형)은 그 오른쪽에서 바꿔요.\n**편집**을 누르면 여러 권을 골라 삭제할 수 있고, **전체 선택**으로 한 번에 고를 수도 있어요.',
    tip: '검색에서는 띄어쓰기와 대소문자를 구분하지 않아요.',
  },
  {
    q: '5. 표시의 뜻',
    a: '표지 왼쪽 위의 회색 점은 3일 안에 필사한 책이에요.\n오른쪽 아래 배지는 책의 읽기 상태(읽고 싶은, 읽는 중, 완독, 중단)예요.\n목록형에서는 점은 작은 표지에, 배지는 제목 아래에 보여요.',
    tip: '세피아 테마에서는 점이 갈색 톤의 진한 회색으로 보여요.',
  },
  {
    q: '6. 백업하기',
    a: '> 기록은 **백업 파일(.json)**로 보관하고, 문서(.md, .txt)는 읽는 용도예요.\n\n**백업하기**\n기록은 이 기기의 브라우저에만 저장돼요. 브라우저 데이터를 지우면 사라져요.\n설정의 **데이터**에서 **백업 내보내기**로 백업 파일을 가끔 내려받아 두세요.\n\n**다른 기기에서 불러오기**\n**가져오기**로 불러올 수 있어요. 자세한 내용은 11번을 보세요.\n\n**읽기용 문서로 내려받기**\n읽고 공유하는 용도라서, 이 파일로는 기록을 되살릴 수 없어요.\n월별이나 올해 기록을 문서로 보고 싶을 때 쓰세요.',
    tip: '글자 크기, 색 같은 화면 설정은 백업에 들어가지 않아서, 다른 기기에서는 설정에서 다시 골라 주세요.',
  },
  {
    q: '7. 화면 바꾸기',
    a: '**글자 크기**와 **글꼴**, 그리고 **화면 구성 편집**의 색 테마, 포인트 색, 표지 모양을 바꿀 수 있어요.\n바꾸면 바로 적용돼요.',
    tip: '화면 구성 편집에는 미리보기가 위쪽에 붙어 있어서, 옵션을 바꾸면 바로 어떻게 보이는지 확인할 수 있어요.',
  },
  {
    q: '8. 설정 항목 접고 펼치기',
    a: '설정의 각 항목은 이름을 누르면 펼쳐지고, 다시 누르면 접혀요.\n설정 탭에 들어올 때마다 화면 구성 편집만 펼쳐진 상태로 시작해요.',
  },
  {
    q: '9. 잘못 읽은 글자 찾기',
    a: '인식이 끝나면 필사 내용 아래에 **잘못 읽었을 수 있는 글자**가 나올 수 있어요. 눌러 보면 본문에서 그 글자를 찾아 줘요.\n글자가 많이 깨지면 책을 평평하게 펴서 다시 찍어 보세요. 그래도 안 맞으면 **2번**의 글자 복사 방법을 써 보세요.',
    warn: DOUBT_WARNING,
  },
  {
    q: '10. 필사 내보내기와 공유',
    a: '책을 열면 필사를 **.md**나 **.txt** 파일로 내려받을 수 있어요.\n**공유**로 다른 앱에 보낼 수도 있어요. PC에서는 **복사**로 보여요.',
  },
  {
    q: '11. 가져오기와 백업 파일',
    a: '> **북앤펜 백업 파일(.json)**만 가져올 수 있어요.\n\n**가져올 수 있는 파일**\n설정 → 데이터의 **백업 내보내기**로 받은 .json 파일\n\n**가져올 수 없는 파일**\n읽기용 문서(.md, .txt)와 다른 앱의 파일\n읽고 공유하는 용도라서 기록을 되살릴 수 없어요.\n\n**가져오면 이렇게 돼요**\n이미 있는 기록은 건너뛰고, 없는 기록만 더해져요.\n올해 완독 목표도 들어 있고, 이미 목표를 정한 해는 그대로 둬요.\n화면 설정은 들어 있지 않아요.',
    warn: '백업 파일을 직접 고치면 틀린 값은 고쳐서 받거나 그 기록만 건너뛸 수 있어요.',
  },
  {
    q: '12. 기록 탭에서 날짜별로 보기',
    a: '> **달력**으로 날짜별 기록을, **통계**로 일·월·연 단위 기록과 완독 목표를 봐요.\n\n**달력**\n**기록** 탭의 **달력**에서는 필사한 날이 진하게 보이고, 책을 완독한 날에는 ✓ 표시가 붙어요.\n날짜를 누르면 그날의 필사와 완독한 책이 보여요.\n제목(**2026년 11월 ▾**)을 누르면 연도와 달을 골라 바로 이동할 수 있어요.\n\n**통계**\n일간·월간·연간으로 볼 수 있고, 제목을 눌러 연도와 달을 고를 수 있어요.\n연간에서 달을 누르면 월간 통계로, 월간에서 날짜 막대를 누르면 일간 통계로 이동해요.\n통계 위쪽에서는 올해 읽을 책 수(**완독 목표**)를 정하고 진행을 볼 수 있어요.\n\n오늘 이후의 날짜와 달은 볼 수 없어요.',
    tip: '긴 필사는 4줄까지만 보여요. **더 보기**를 누르면 펼쳐져요.\n한 번에 5개씩 보이고, 넘으면 아래 번호로 넘겨 볼 수 있어요.\n완독 수는 책을 **완독**으로 바꾼 날짜를 기준으로 세요.',
  },
];

function Hint({ children }) {
  return <p className="mt-0.5 whitespace-pre-line text-xs text-stone-500">{children}</p>;
}

// 화면 구성 편집 미리보기: 옵션을 바꾸면 바로 달라져요 (현재 색 테마·포인트 색 그대로 표시)
const PREVIEW_BOOKS = [
  { title: '노인과 바다', author: '어니스트 헤밍웨이', status: 'READING', fresh: true },
  { title: '어린 왕자', author: '생텍쥐페리', status: 'COMPLETED', fresh: false },
  { title: '데미안', author: '헤르만 헤세', status: 'WISH', fresh: false },
];

function ScreenPreview({ settings }) {
  const list = PREVIEW_BOOKS.slice(0, settings.cols);
  return (
    <div className="sticky top-2 z-10 mt-3 overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
      <p className="px-3 pt-2 text-xs text-stone-500">미리보기</p>
      <ul
        className={`grid gap-2 px-3 pb-2 pt-1 ${
          settings.cols === 2 ? 'grid-cols-2' : 'grid-cols-3'
        }`}
      >
        {list.map((b, i) => (
          <li key={b.title}>
            <div
              style={{ ...coverColors(settings, b.title, i), borderRadius: settings.round }}
              className="relative flex aspect-[3/2.4] items-center justify-center shadow-sm"
            >
              <CoverText
                title={b.title}
                author={b.author}
                mode={settings.letter}
                cols={settings.cols}
                small
              />
              {settings.showDot && b.fresh && (
                <span
                  className="absolute left-1 top-1 h-2 w-2 rounded-full bg-dot"
                  style={{ boxShadow: '0 0 0 1.5px rgba(255,255,255,0.8)' }}
                />
              )}
              {settings.showBadge && (
                <span
                  className={`absolute bottom-1 right-1 rounded px-1 text-[10px] ${STATUS_STYLE[b.status]}`}
                >
                  {STATUS_LABEL[b.status]}
                </span>
              )}
            </div>
            {settings.letter === 'none' && (
              <p className="mt-1 truncate text-xs">{b.title}</p>
            )}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-4 border-t border-stone-200 py-1.5 text-xs">
        {PREVIEW_TABS.map(([icon, label], i) => (
          <span
            key={label}
            className={`flex flex-col items-center ${i === 0 ? 'font-semibold text-accent' : 'text-stone-400'}`}
          >
            <span className={`text-base leading-none ${i === 0 ? '' : 'opacity-40'}`}>{icon}</span>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChoiceButton({ active, onClick, children, style, small }) {
  return (
    <button
      onClick={onClick}
      style={style}
      className={`rounded-lg border py-2 ${small ? 'px-1 text-xs' : 'px-2 text-sm'} ${
        active
          ? 'border-accent bg-accent text-on-accent'
          : 'border-stone-300 bg-white text-stone-700'
      }`}
    >
      {children}
    </button>
  );
}

// 화면 구성 미리보기의 하단 탭입니다. App.jsx의 TABS와 같은 아이콘·순서로 맞춰 둡니다.
const PREVIEW_TABS = [
  ['📚', '책장'],
  ['★', '즐겨찾기'],
  ['📝', '기록'],
  ['⚙', '설정'],
];

// 접고 펼 수 있는 설정 카드. 접힌 상태에서는 제목 옆에 현재 선택을 작게 보여 줍니다.
function Section({ title, summary, open, onToggle, children }) {
  return (
    <div className="mt-4 rounded-xl border border-stone-200 bg-white">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-stone-700">
          {title}
          {summary && (
            <span className="ml-2 text-xs font-normal text-stone-500">{summary}</span>
          )}
        </span>
        <span
          className={`text-xs text-stone-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        >
          ▾
        </span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// 안내 설명(사용 방법, 개인정보 안내)을 보여 줍니다.
// 본문이 3줄 이상이면 줄마다 "-"를 붙이고, 그보다 짧으면 줄바꿈만 그대로 보여 줍니다.
// 사용 방법은 12개 항목의 모양을 맞추려고 always를 줘서 줄 수와 상관없이 항상 "-"를 붙입니다.
// 굵은 글씨만 있는 줄은 소제목으로, 빈 줄은 구역 사이 간격으로 보여 줍니다.
// 줄이 길어 넘어가면 둘째 줄이 "-" 뒤에 맞춰 들여써집니다.
const GUIDE_BULLET_MIN = 3;
function GuideLines({ text, always = false }) {
  const isLead = (l) => l.startsWith('> '); // 맨 위 결론 한 줄("> "로 시작): "-" 없이 굵게
  const bodyCount = text
    .split('\n')
    .filter((l) => l.trim() && !isLead(l) && !/^\*\*[^*]+\*\*$/.test(l.trim())).length;
  // 결론 줄이 있는 안내는 본문이 짧아도 같은 모양(결론 줄 + "-" 목록)으로 보여 줍니다.
  if (!always && !text.startsWith('> ') && bodyCount < GUIDE_BULLET_MIN) {
    return (
      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-stone-600">
        <RichText text={text} />
      </p>
    );
  }
  return (
    <div className="mt-1.5 space-y-1 text-sm leading-relaxed text-stone-600">
      {text.split('\n').map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />;
        if (isLead(line)) {
          return (
            <p key={i} className="font-medium text-stone-800">
              <RichText text={line.slice(2)} />
            </p>
          );
        }
        if (/^\*\*[^*]+\*\*$/.test(line.trim())) {
          return (
            <p key={i} className="pt-1 font-semibold text-stone-800">
              {line.trim().slice(2, -2)}
            </p>
          );
        }
        return (
          <p key={i} className="flex gap-1.5">
            <span aria-hidden="true" className="text-stone-400">-</span>
            <span className="min-w-0 flex-1">
              <RichText text={line} />
            </span>
          </p>
        );
      })}
    </div>
  );
}

export function SettingsView({ data, onImport, onClearAll }) {
  const [backupMsg, setBackupMsg] = useState(null); // { ok, text }
  const importRef = useRef(null);
  const settings = useSettings();
  const change = (patch) => updateSettings(patch); // 저장 + 바로 적용
  // 처음에는 '화면 구성 편집'만 펼쳐 둬요 (설정 탭에 들어올 때마다 처음 상태로 돌아가요)
  const [open, setOpen] = useState({ font: false, screen: true, backup: false, guide: false, info: false });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const sizeLabel = SIZE_OPTIONS.find((o) => o.id === settings.size)?.label;
  const themeLabel = THEME_OPTIONS.find((o) => o.id === settings.theme)?.label;
  const accentLabel = ACCENT_OPTIONS.find((o) => o.id === settings.accent)?.label;

  // 읽기용 문서로 내려받기: 형식은 기억해 두고, 범위는 열 때마다 "이번 달"에서 시작합니다.
  const [docFormat, setDocFormat] = useState(() => loadCalSettings().format);
  const [docRange, setDocRange] = useState('month'); // 'all' | 'year' | 'month' | 'pick'
  const [docYm, setDocYm] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const [docPicking, setDocPicking] = useState(false);
  const markedMonths = useMemo(
    () => new Set(data.transcriptions.map((t) => dayKey(t.created_at).slice(0, 7))),
    [data.transcriptions]
  );
  const pickDocFormat = (f) => {
    setDocFormat(f);
    saveCalSettings({ ...loadCalSettings(), format: f });
  };
  const pickDocRange = (r) => {
    setDocRange(r);
    setDocPicking(r === 'pick');
    if (r === 'month') {
      const n = new Date();
      setDocYm({ y: n.getFullYear(), m: n.getMonth() });
    }
  };
  const exportDocument = () => {
    const doc = buildReadingDocument({
      books: data.books,
      transcriptions: data.transcriptions,
      range: docRange === 'pick' ? 'month' : docRange,
      ym: docYm,
      format: docFormat,
    });
    if (!doc) {
      setBackupMsg({ ok: false, text: '내려받을 필사가 없어요.' });
      return;
    }
    if (!downloadTextFile(doc.filename, doc.text, doc.mime)) {
      setBackupMsg({ ok: false, text: '문서를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.' });
      return;
    }
    setBackupMsg({ ok: true, text: '읽기용 문서를 내려받았어요. 이 파일로는 기록을 되살릴 수 없어요.' });
  };

  // 파일 만들기와 내려받기 시작에 오류가 없었을 때만 "마지막 백업" 시각을 기록합니다.
  const exportBackup = () => {
    let text;
    try {
      text = buildBackup(data);
    } catch {
      text = null;
    }
    if (text === null || !downloadTextFile(`bookandpen-backup-${fileStamp()}.json`, text)) {
      setBackupMsg({ ok: false, text: '백업 파일을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.' });
      return;
    }
    if (!markBackup()) {
      setBackupMsg({
        ok: true,
        text: '백업 파일을 내려받았어요. 다만 백업한 시각은 저장하지 못했어요.',
      });
      return;
    }
    setBackupMsg({ ok: true, text: '백업 파일을 내려받았어요.' });
  };

  const clearAll = () => {
    if (
      window.confirm(
        `책 ${data.books.length}권과 필사 ${data.transcriptions.length}개를 모두 삭제할까요? 되돌릴 수 없어요. 먼저 백업 내보내기로 백업해 두세요.`
      ) &&
      window.confirm('정말 모두 삭제할까요?')
    ) {
      onClearAll();
      clearRecentSearches(); // 최근 검색어도 함께 지웁니다.
      clearGoals(); // 올해 목표도 함께 지웁니다.
      setBackupMsg({ ok: true, text: '모든 기록을 삭제했어요.' });
    }
  };

  const importBackup = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setBackupMsg({ ok: false, text: '파일이 너무 커요. 북앤펜 백업 파일(20MB 이하)을 선택해 주세요.' });
      return;
    }
    // 백업 파일(.json)이 아닌 파일은 내용을 읽기 전에 안내합니다.
    if (!/\.json$/i.test(file.name)) {
      setBackupMsg({
        ok: false,
        text: '북앤펜 백업 파일(.json)만 가져올 수 있어요. 읽기용 문서나 필사에서 내려받은 .md, .txt 파일은 읽기용이라 불러올 수 없어요.',
      });
      return;
    }
    try {
      const parsed = parseBackup(await file.text());
      const added = onImport(parsed);
      setBackupMsg({
        ok: true,
        text: `책 ${added.books}권, 필사 ${added.transcriptions}개${
          added.goals > 0 ? `, 목표 ${added.goals}개` : ''
        }를 가져왔어요. (이미 있던 기록은 그대로 두었어요)`,
      });
    } catch (err) {
      setBackupMsg({ ok: false, text: err.message });
    }
  };

  return (
    <div className="px-4 pt-6">
      <h1 className="font-body text-2xl font-bold">설정</h1>
      <p className="mt-1 text-xs text-stone-500">항목 이름을 누르면 펼치고 접을 수 있어요.</p>

      <Section
        title="글자 설정"
        summary={`${sizeLabel} · ${FONT_OPTIONS[settings.uiFont].label} · ${FONT_OPTIONS[settings.bodyFont].label}`}
        open={open.font}
        onToggle={() => toggle('font')}
      >
        <h3 className="text-sm font-semibold text-stone-700">글자 크기</h3>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {SIZE_OPTIONS.map((o) => (
            <ChoiceButton
              key={o.id}
              small
              active={settings.size === o.id}
              onClick={() => change({ size: o.id })}
            >
              {o.label}
            </ChoiceButton>
          ))}
        </div>

        <h3 className="mt-4 text-sm font-semibold text-stone-700">
          화면 글꼴 <span className="font-normal text-stone-500">(버튼·메뉴 등)</span>
        </h3>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {UI_FONT_IDS.map((id) => (
            <ChoiceButton
              key={id}
              active={settings.uiFont === id}
              onClick={() => change({ uiFont: id })}
              style={{ fontFamily: FONT_OPTIONS[id].css }}
            >
              {FONT_OPTIONS[id].label}
            </ChoiceButton>
          ))}
        </div>

        <h3 className="mt-4 text-sm font-semibold text-stone-700">
          필사 본문 글꼴 <span className="font-normal text-stone-500">(제목 포함)</span>
        </h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {BODY_FONT_IDS.map((id) => (
            <ChoiceButton
              key={id}
              active={settings.bodyFont === id}
              onClick={() => change({ bodyFont: id })}
              style={{
                fontFamily: FONT_OPTIONS[id].css,
                fontSize: `${FONT_OPTIONS[id].scale}em`,
              }}
            >
              {FONT_OPTIONS[id].label}
            </ChoiceButton>
          ))}
        </div>

        <div className="mt-4 rounded-lg bg-stone-50 p-3">
          <p className="text-xs text-stone-500">미리보기</p>
          <p className="font-body mt-1 text-base leading-relaxed">
            책을 읽는다는 것은 다른 사람의 생각 속에서 나를 발견하는 일이다.
          </p>
          <p className="mt-1 text-sm text-stone-500">
            {pageText({ page: 123 })} · 오늘 · 화면 글꼴 예시예요.
          </p>
        </div>
      </Section>

      <Section
        title="화면 구성 편집"
        summary={`${themeLabel} · ${accentLabel}`}
        open={open.screen}
        onToggle={() => toggle('screen')}
      >
        <ScreenPreview settings={settings} />

        <h3 className="mt-4 text-sm font-semibold text-stone-700">전체 색 테마</h3>
        <Hint>앱 전체의 배경과 글자 색이에요. 기기 설정은 폰의 다크 모드를 따라가요.</Hint>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {THEME_OPTIONS.map((o) => (
            <ChoiceButton
              key={o.id}
              small
              active={settings.theme === o.id}
              onClick={() => change({ theme: o.id })}
            >
              {o.label}
            </ChoiceButton>
          ))}
        </div>

        <h3 className="mt-4 text-sm font-semibold text-stone-700">포인트 색</h3>
        <Hint>하단 탭, 버튼, 선택 표시에 쓰여요. 모든 탭에 같이 적용돼요.</Hint>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {ACCENT_OPTIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => change({ accent: o.id })}
              aria-label={o.label}
              className={`flex flex-col items-center gap-1 rounded-lg border py-2 text-xs ${
                settings.accent === o.id
                  ? 'border-accent text-stone-800'
                  : 'border-stone-300 text-stone-500'
              }`}
            >
              <span
                className="h-5 w-5 rounded-full"
                style={{ background: o.swatch }}
              />
              {o.label}
            </button>
          ))}
        </div>

        <h3 className="mt-4 text-sm font-semibold text-stone-700">
          표지 색 <span className="font-normal text-stone-500">(연한 파스텔)</span>
        </h3>
        <Hint>{'책장에 보이는 책 표지의 색 계열이에요.\n책마다는 책 제목에 따라 여러 색이 섞여 보여요.'}</Hint>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {COVER_OPTIONS.map((o) => (
            <ChoiceButton
              key={o.id}
              small
              active={settings.cover === o.id}
              onClick={() => change({ cover: o.id })}
            >
              {o.short || o.label}
            </ChoiceButton>
          ))}
        </div>

        <h3 className="mt-4 text-sm font-semibold text-stone-700">표지 색 밝기</h3>
        <Hint>{'1단계는 연하고, 3단계는 조금 진해요.\n자동은 등록 순서대로 1·2·3단계를 번갈아 써요.'}</Hint>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {SHADE_OPTIONS.map((o) => (
            <ChoiceButton
              key={o.id}
              small
              active={settings.shade === o.id}
              onClick={() => change({ shade: o.id })}
            >
              {o.short || o.label}
            </ChoiceButton>
          ))}
        </div>

        <h3 className="mt-4 text-sm font-semibold text-stone-700">표지 글자</h3>
        <Hint>표지 안에 제목(과 저자)을 보여 줘요. 없음이면 표지 아래에 제목이 보여요.</Hint>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {LETTER_OPTIONS.map((o) => (
            <ChoiceButton
              key={o.id}
              small
              active={settings.letter === o.id}
              onClick={() => change({ letter: o.id })}
            >
              {o.label}
            </ChoiceButton>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <h3 className="text-sm font-semibold text-stone-700">한 줄 카드 수</h3>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {COLS_OPTIONS.map((o) => (
                <ChoiceButton
                  key={o.id}
                  small
                  active={settings.cols === o.id}
                  onClick={() => change({ cols: o.id })}
                >
                  {o.label}
                </ChoiceButton>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-stone-700">모서리</h3>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {ROUND_OPTIONS.map((o) => (
                <ChoiceButton
                  key={o.id}
                  small
                  active={settings.round === o.id}
                  onClick={() => change({ round: o.id })}
                >
                  {o.label}
                </ChoiceButton>
              ))}
            </div>
          </div>
        </div>
        <Hint>{'카드 수는 책장(표지형)에서 한 줄에 보이는 책 수, 모서리는 표지의 둥근 정도예요.\n목록형은 책장에서 ☰를 눌러 바꿔요.'}</Hint>

        <h3 className="mt-4 text-sm font-semibold text-stone-700">표시 항목</h3>
        <Hint>
          {'회색 점은 3일 안에 필사한 책, 배지는 읽기 상태(읽는 중·완독·중단)를 보여 줘요.\n세피아 테마에서는 점이 갈색 톤의 진한 회색으로 보여요.'}
        </Hint>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <ChoiceButton
            small
            active={settings.showDot}
            onClick={() => change({ showDot: !settings.showDot })}
          >
            회색 점
          </ChoiceButton>
          <ChoiceButton
            small
            active={settings.showBadge}
            onClick={() => change({ showBadge: !settings.showBadge })}
          >
            상태 배지
          </ChoiceButton>
        </div>
      </Section>

      <Section title="데이터" open={open.backup} onToggle={() => toggle('backup')}>
        <Note
          kind="warn"
          className=""
          text={'브라우저 데이터를 지우면 **기록도 사라져요.**\n가끔 **백업 파일**로 내려받아 두세요.'}
        />
        <p className="mt-2 text-xs text-stone-600">
          저장 공간 {storageUsage().pct}% 사용 · 마지막 백업{' '}
          {getLastBackup() ? dotDate(getLastBackup()) : '없음'}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={exportBackup}
            disabled={data.books.length === 0}
            className="rounded-lg bg-accent py-2.5 text-sm font-medium text-on-accent disabled:bg-stone-300"
          >
            백업 내보내기
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="rounded-lg border border-stone-300 py-2.5 text-sm font-medium"
          >
            가져오기
          </button>
        </div>
        <div className="mt-2"><Hint>{'북앤펜 백업 파일(.json)만 가져올 수 있어요.\n이미 있는 기록은 건너뛰어요.'}</Hint></div>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          onChange={importBackup}
          className="hidden"
        />
        <h3 className="mt-4 text-sm font-semibold text-stone-700">읽기용 문서로 내려받기</h3>
        <Hint>{'날짜별로 필사와 완독한 책을 모은 문서예요.\n읽고 공유하는 용도라서, 이 파일로는 기록을 되살릴 수 없어요.'}</Hint>
        <p className="mt-2 text-xs font-medium text-stone-600">형식</p>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <ChoiceButton small active={docFormat === 'md'} onClick={() => pickDocFormat('md')}>마크다운</ChoiceButton>
          <ChoiceButton small active={docFormat === 'txt'} onClick={() => pickDocFormat('txt')}>텍스트</ChoiceButton>
        </div>
        <p className="mt-2 text-xs font-medium text-stone-600">범위</p>
        <div className="mt-1 grid grid-cols-4 gap-2">
          {[['all', '전체'], ['year', '올해'], ['month', '이번 달'], ['pick', '직접 고르기']].map(([id, text]) => (
            <ChoiceButton key={id} small active={docRange === id} onClick={() => pickDocRange(id)}>
              {text}
            </ChoiceButton>
          ))}
        </div>
        {docRange === 'pick' && (
          <>
            <button
              onClick={() => setDocPicking((v) => !v)}
              aria-expanded={docPicking}
              className="mt-2 w-full rounded-lg border border-stone-300 py-2 text-sm"
            >
              {docYm.y}년 {docYm.m + 1}월 <span className="text-xs text-stone-400">{docPicking ? '▴' : '▾'}</span>
            </button>
            {docPicking && (
              <MonthPicker
                key={`${docYm.y}-${docYm.m}`}
                year={docYm.y}
                month={docYm.m}
                marked={markedMonths}
                onPick={(y, m) => {
                  setDocYm({ y, m });
                  setDocPicking(false);
                }}
                onClose={() => setDocPicking(false)}
                noFuture
              />
            )}
          </>
        )}
        <button
          onClick={exportDocument}
          disabled={data.books.length === 0 && data.transcriptions.length === 0}
          className="mt-3 w-full rounded-lg border border-stone-300 py-2.5 text-sm font-medium disabled:opacity-40"
        >
          문서로 내려받기
        </button>
        <button
          onClick={clearAll}
          disabled={data.books.length === 0 && data.transcriptions.length === 0}
          className="mt-3 w-full rounded-lg border border-red-300 py-2.5 text-sm font-medium text-red-600 disabled:opacity-40"
        >
          모든 기록 삭제
        </button>
        {backupMsg && (
          <p
            className={`mt-2 text-xs ${
              backupMsg.ok ? 'text-emerald-700' : 'text-red-600'
            }`}
          >
            {backupMsg.text}
          </p>
        )}
      </Section>

      <Section title="정보" open={open.info} onToggle={() => toggle('info')}>
        <details className="py-2">
          <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
            개인정보 안내
          </summary>
          <GuideLines text={'> 기록은 **이 기기에만** 저장되고, **서버로 보내지 않아요.**\n\n모든 기록은 **이 기기의 브라우저에만** 저장되고, 사진도 이 기기 안에서만 처리돼요.\n다만 앱을 열 때 글꼴(Google Fonts)을, 글자를 인식할 때 인식 엔진과 언어 데이터(jsdelivr)를 인터넷에서 내려받아요. 이때 기록이나 사진은 보내지 않지만, 해당 서비스에는 접속 기록(IP 주소 등)이 남을 수 있어요.'} />
          <Note kind="tip" text="최근 검색어도 이 기기에만 저장되고, 백업에는 들어가지 않아요." />
        </details>
        <details className="border-t border-stone-200 py-2">
          <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
            저작권 안내
          </summary>
          <GuideLines text={'책에서 옮겨 적은 글의 저작권은 해당 책의 **저자와 출판사**에 있어요.\n필사 기록은 **개인 감상용**으로 써 주세요.'} always />
          <Note kind="warn" text="블로그·SNS 등에 공개하거나 공유할 때는 출처를 밝히고 분량에 유의해 주세요." />
        </details>
        <details className="border-t border-stone-200 py-2">
          <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
            오픈소스 라이선스
          </summary>
          <GuideLines text={'React · MIT 라이선스\nVite · MIT 라이선스\nTailwind CSS · MIT 라이선스\nTesseract.js · Apache License 2.0'} always />
        </details>
      </Section>

      <Section title="사용 방법" open={open.guide} onToggle={() => toggle('guide')}>
        <div className="divide-y divide-stone-200">
          {GUIDE.map((g) => (
            <details key={g.q} className="py-2.5">
              <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
                {g.q}
              </summary>
              {/* 설명 안의 줄바꿈(\n)을 그대로 보여 줍니다. */}
              <GuideLines text={g.a} always />
              {g.tip && <Note kind="tip" text={g.tip} />}
              {g.warn && <Note kind="warn" text={g.warn} />}
            </details>
          ))}
        </div>
      </Section>
    </div>
  );
}
