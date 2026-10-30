import { useMemo, useRef, useState } from 'react';
import Pager, { usePaging } from './Pager.jsx';
import { dotDate, fileStamp } from '../lib/date.js';
import {
  ACCENT_OPTIONS,
  BODY_FONT_IDS,
  COLS_OPTIONS,
  COVER_OPTIONS,
  FONT_OPTIONS,
  LETTER_OPTIONS,
  ROUND_OPTIONS,
  SHADE_OPTIONS,
  SIZE_OPTIONS,
  THEME_OPTIONS,
  UI_FONT_IDS,
  buildBackup,
  coverColors,
  downloadTextFile,
  getLastBackup,
  markBackup,
  pageText,
  parseBackup,
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

function daysAgo(iso) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  return d <= 0 ? '오늘' : `${d}일 전`;
}

// ───────────────── 책장 탭 ─────────────────
export default function BookList({
  books,
  transcriptions,
  onAdd,
  onOpen,
  onDeleteBooks,
}) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
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
    onAdd({ title, author });
    setTitle('');
    setAuthor('');
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
    const list = books.filter((b) => filter === 'ALL' || b.status === filter);
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
  }, [books, filter, sort, stats]);

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
        `선택한 책 ${selected.length}권과 모든 필사 기록을 삭제할까요? 되돌릴 수 없어요.`
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
            className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-stone-500"
          />
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="저자"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-stone-500"
          />
          <button
            type="submit"
            disabled={!title.trim()}
            className="w-full rounded-lg bg-accent py-2.5 font-medium text-on-accent disabled:bg-stone-300"
          >
            등록하기
          </button>
        </form>
      )}

      <div className="mt-5 flex items-center justify-between border-b border-stone-200 pb-2">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-transparent text-sm font-semibold text-stone-800 outline-none"
        >
          <option value="ALL">전체 {countOf('ALL')}</option>
          {Object.entries(STATUS_LABEL).map(([v, label]) => (
            <option key={v} value={v}>
              {label} {countOf(v)}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="bg-transparent text-sm text-stone-600 outline-none"
        >
          {Object.entries(SORTS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {editMode && visible.length > 0 && (
        <div className="mt-2 flex items-center justify-between border-b border-stone-200 pb-2 text-sm">
          <button onClick={toggleAll} className="font-medium text-stone-700">
            {allSelected ? '전체 해제' : `전체 선택 (${visible.length})`}
          </button>
          <span className="text-stone-500">{selected.length}권 선택</span>
        </div>
      )}

      {books.length === 0 ? (
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
        <p className="mt-10 text-center text-sm text-stone-400">
          이 상태의 책이 없어요.
        </p>
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
                    editMode ? toggleSelect(b.book_id) : onOpen(b.book_id)
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
                </button>
              </li>
            );
          })}
        </ul>
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
const FAV_PAGE_SIZE = 3; // 한 화면에 보여 줄 즐겨찾기 개수

export function FavoritesView({
  books,
  transcriptions,
  onOpen,
  onToggleFavorite,
  onUnfavorite, // (ids: string[]) => 여러 개 즐겨찾기 해제
}) {
  const [selecting, setSelecting] = useState(false); // 선택 모드
  const [picked, setPicked] = useState(() => new Set()); // 선택한 필사 id

  const favs = transcriptions
    .filter((t) => t.favorite)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const bookOf = (id) => books.find((b) => b.book_id === id);

  // 목록 나누기 (해제로 목록 수가 줄어도 마지막 목록으로 보정)
  const { curPage, totalPages, pageItems, goPage } = usePaging(favs, FAV_PAGE_SIZE);

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
            className="rounded-md border border-red-200 bg-white px-2 py-1 text-red-500"
          >
            전체 해제
          </button>
        </div>
      )}

      {selecting && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600">
          <span className="font-semibold">{pickedIds.length}개 선택</span>
          <button onClick={togglePickAll} className="underline">
            {allPicked ? '선택 해제' : '전체 선택'}
          </button>
          <button
            onClick={unfavoriteSelected}
            disabled={pickedIds.length === 0}
            className="ml-auto rounded-md border border-red-200 bg-white px-2 py-1 text-red-500 disabled:opacity-40"
          >
            즐겨찾기 해제
          </button>
          <button onClick={exitSelecting} className="ml-1 text-stone-500">
            취소
          </button>
        </div>
      )}

      {favs.length === 0 ? (
        <p className="mt-10 text-center text-sm text-stone-400">
          아직 즐겨찾기한 문장이 없어요. 책의 필사 옆 ☆를 눌러 보세요.
        </p>
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
                <p className="whitespace-pre-wrap font-body text-base leading-relaxed">
                  {t.content}
                </p>
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
const GUIDE = [
  {
    q: '1. 책 등록하기',
    a: '책장 탭 오른쪽 위의 “+ 책 등록”을 누르고 제목을 입력한 뒤 “등록하기”를 누르세요. 저자는 비워도 돼요.',
  },
  {
    q: '2. 사진으로 필사하기',
    a: '등록한 책을 열고 아래의 “📷 필사 추가하기”를 누르세요. “카메라로 촬영”이나 “사진 불러오기”로 책 페이지를 넣으면 글자가 인식돼요. 틀린 글자를 고친 뒤 “저장하기”를 누르면 끝이에요.',
  },
  {
    q: '3. 마음에 든 문장 모아 보기',
    a: '필사 옆의 ☆를 누르면 ★가 되고 즐겨찾기 탭에 모여요. 즐겨찾기 탭에서는 여러 개를 골라 한꺼번에 해제할 수도 있어요.',
  },
  {
    q: '4. 책 정리하기',
    a: '책장의 “편집”을 누르면 여러 권을 골라 삭제할 수 있고, “전체 선택”으로 한 번에 고를 수도 있어요. 목록은 오른쪽 위에서 최근 필사순, 등록순, 제목순, 저자순, 필사 많은 순으로 바꿔 볼 수 있어요.',
  },
  {
    q: '5. 표시의 뜻',
    a: '표지 왼쪽 위의 회색 점은 3일 안에 필사한 책이에요. 세피아 테마에서는 갈색 톤의 진한 회색으로 보여요. 오른쪽 아래 배지는 책의 읽기 상태(읽고 싶은, 읽는 중, 완독, 중단)예요.',
  },
  {
    q: '6. 백업하기',
    a: '기록은 이 기기의 브라우저에만 저장돼요. 브라우저 데이터를 지우면 사라지니, 설정의 “데이터”에서 “내보내기”로 백업 파일을 가끔 내려받아 두세요. 다른 기기에서는 “가져오기”로 불러올 수 있어요.',
  },
  {
    q: '7. 화면 바꾸기',
    a: '글자 크기와 글꼴, 그리고 화면 구성 편집의 색 테마, 포인트 색, 표지 모양을 바꿀 수 있어요. 바꾸면 바로 적용돼요.',
  },
  {
    q: '8. 설정 항목 접고 펼치기',
    a: '설정의 각 항목은 이름을 누르면 펼쳐지고, 다시 누르면 접혀요.',
  },
];

function Hint({ children }) {
  return <p className="mt-0.5 text-xs text-stone-500">{children}</p>;
}

// 화면 구성 편집 미리보기: 옵션을 바꾸면 바로 달라져요 (현재 색 테마·포인트 색 그대로 표시)
const PREVIEW_BOOKS = [
  { title: '파이썬', author: '홍길동', status: 'READING', fresh: true },
  { title: '어린 왕자', author: '생텍쥐페리', status: 'COMPLETED', fresh: false },
  { title: '데미안', author: '헤르만 헤세', status: 'READING', fresh: false },
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
      <div className="flex justify-around border-t border-stone-200 py-1.5 text-xs">
        <span className="font-semibold text-accent">책장</span>
        <span className="text-stone-400">즐겨찾기</span>
        <span className="text-stone-400">설정</span>
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
          className={`text-xs text-stone-500 transition-transform ${
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

  const exportBackup = () => {
    downloadTextFile(`bookandpen-backup-${fileStamp()}.json`, buildBackup(data));
    markBackup();
    setBackupMsg({ ok: true, text: '백업 파일을 내려받았어요.' });
  };

  const clearAll = () => {
    if (
      window.confirm(
        `책 ${data.books.length}권과 필사 ${data.transcriptions.length}개를 모두 삭제할까요? 되돌릴 수 없어요. 먼저 내보내기로 백업해 두세요.`
      ) &&
      window.confirm('정말 모두 삭제할까요?')
    ) {
      onClearAll();
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
    try {
      const parsed = parseBackup(await file.text());
      const added = onImport(parsed);
      setBackupMsg({
        ok: true,
        text: `책 ${added.books}권, 필사 ${added.transcriptions}개를 가져왔어요. (이미 있던 기록은 그대로 두었어요)`,
      });
    } catch (err) {
      setBackupMsg({ ok: false, text: err.message });
    }
  };

  return (
    <div className="px-4 pt-6">
      <h1 className="font-body text-2xl font-bold">설정</h1>
      <p className="mt-1 text-xs text-stone-500">항목 이름을 누르면 펼치고 접을 수 있어요</p>

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
        <Hint>하단 탭, 버튼, 선택 표시에 쓰여요. 책장·즐겨찾기·설정에 모두 같이 적용돼요.</Hint>
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
        <Hint>책장에 보이는 책 표지의 색 계열이에요.</Hint>
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
        <Hint>1단계는 연하고, 3단계는 조금 진해요. 자동은 등록 순서대로 1·2·3단계를 번갈아 써요.</Hint>
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
        <Hint>카드 수는 책장에서 한 줄에 보이는 책 수, 모서리는 표지의 둥근 정도예요.</Hint>

        <h3 className="mt-4 text-sm font-semibold text-stone-700">표시 항목</h3>
        <Hint>
          회색 점은 3일 안에 필사한 책, 배지는 읽기 상태(읽는 중·완독·중단)를 보여 줘요.
          세피아 테마에서는 점이 갈색 톤의 진한 회색으로 보여요.
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
        <p className="text-xs text-stone-500">
          브라우저 데이터를 지우면 기록도 사라져요. 가끔 파일로 내려받아 두세요.
        </p>
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
            내보내기
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="rounded-lg border border-stone-300 py-2.5 text-sm font-medium"
          >
            가져오기
          </button>
        </div>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          onChange={importBackup}
          className="hidden"
        />
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
          <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
            모든 기록은 이 기기의 브라우저에만 저장돼요. 서버로 보내는 정보가 없고, 사진은 이 기기 안에서만 처리돼요. 처음 글자를 인식할 때 언어 데이터를 내려받는 것 외에는 인터넷을 쓰지 않아요.
          </p>
        </details>
        <details className="border-t border-stone-200 py-2">
          <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
            저작권 안내
          </summary>
          <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
            책에서 옮겨 적은 글의 저작권은 해당 책의 저자와 출판사에 있어요. 필사 기록은 개인 감상용으로 쓰고, 블로그·SNS 등에 공개하거나 공유할 때는 출처를 밝히고 분량에 유의해 주세요.
          </p>
        </details>
        <details className="border-t border-stone-200 py-2">
          <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
            오픈소스 라이선스
          </summary>
          <ul className="mt-1.5 space-y-1 text-sm text-stone-600">
            <li>React · MIT 라이선스</li>
            <li>Vite · MIT 라이선스</li>
            <li>Tailwind CSS · MIT 라이선스</li>
            <li>Tesseract.js · Apache License 2.0</li>
          </ul>
        </details>
      </Section>

      <Section title="사용 방법" open={open.guide} onToggle={() => toggle('guide')}>
        <div className="divide-y divide-stone-200">
          {GUIDE.map((g) => (
            <details key={g.q} className="py-2.5">
              <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
                {g.q}
              </summary>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{g.a}</p>
            </details>
          ))}
        </div>
      </Section>
    </div>
  );
}
