import { useEffect, useMemo } from 'react';
import Chip from './Chip.jsx';
import Pager, { usePaging } from './Pager.jsx';
import { KIND_LABEL, filterByKind, kindText, pageText } from '../lib/storage.js';

const SEARCH_PAGE_SIZE = 5; // "필사" 범위에서 한 화면에 보여 줄 결과 개수
const PREVIEW_COUNT = 3; // "전체" 범위에서 미리 보여 줄 필사 개수
const SNIPPET_BEFORE = 30; // 찾은 글자 앞에 보여 줄 글자 수
const SNIPPET_LENGTH = 130; // 본문 한 건에서 보여 줄 최대 글자 수

// 검색어로 정규식을 만듭니다. 띄어쓰기와 대소문자는 구분하지 않습니다.
function buildPattern(query) {
  const chars = [...(query || '').replace(/\s+/g, '')];
  if (chars.length === 0) return null;
  const escaped = chars.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(escaped.join('\\s*'), 'gi');
}

const matches = (text, pattern) => {
  pattern.lastIndex = 0;
  return pattern.test(text);
};

// 필사 본문·메모에서 검색어를 포함한 필사를 최신순으로 찾습니다. 책장의 개수 표시에도 씁니다.
export function findTranscriptions(transcriptions, query) {
  const pattern = buildPattern(query);
  if (!pattern) return [];
  return transcriptions
    .filter((t) => matches(t.content || '', pattern) || matches(t.memo || '', pattern))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// 찾은 글자를 강조해서 보여 줍니다.
function Highlight({ text, pattern }) {
  const parts = [];
  let last = 0;
  pattern.lastIndex = 0;
  for (const m of text.matchAll(pattern)) {
    if (m[0].length === 0) continue;
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <mark key={m.index} className="rounded bg-amber-200 px-0.5 text-stone-900">
        {m[0]}
      </mark>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// 긴 본문은 찾은 글자 주변만 잘라 보여 줍니다.
function snippet(text, pattern) {
  if (text.length <= SNIPPET_LENGTH) return text;
  pattern.lastIndex = 0;
  const m = pattern.exec(text);
  const at = m ? m.index : 0;
  const start = Math.max(0, at - SNIPPET_BEFORE);
  const end = Math.min(text.length, start + SNIPPET_LENGTH);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

// 책장 검색의 "필사" 결과. preview이면 "전체" 범위의 미리보기(3개 + 모두 보기),
// 아니면 "필사" 범위의 전체 목록(종류 필터 + 5개씩 목록 나누기)입니다.
export default function SearchView({
  books,
  found, // findTranscriptions의 결과
  query,
  kindFilter, // all | quote | mine | none
  setKindFilter,
  onOpen,
  preview,
  onShowAll,
}) {
  const pattern = useMemo(() => buildPattern(query), [query]);
  const bookOf = (id) => books.find((b) => b.book_id === id);

  const shown = preview ? found : filterByKind(found, kindFilter);
  const { curPage, totalPages, pageItems, goPage, resetPage } = usePaging(
    shown,
    SEARCH_PAGE_SIZE
  );
  // 검색어나 종류가 바뀌면 첫 목록으로 돌아갑니다.
  useEffect(() => {
    resetPage();
  }, [query, kindFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pattern) return null;

  const items = preview ? found.slice(0, PREVIEW_COUNT) : pageItems;

  const list = (
    <ul className="mt-3 space-y-3">
      {items.map((t) => {
        const b = bookOf(t.book_id);
        const inMemo = t.memo && matches(t.memo, pattern);
        return (
          <li key={t.transcription_id} className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="whitespace-pre-wrap font-body text-base leading-relaxed">
              <Highlight text={snippet(t.content || '', pattern)} pattern={pattern} />
            </p>
            {inMemo && (
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">
                <Highlight text={snippet(t.memo, pattern)} pattern={pattern} />
              </p>
            )}
            <div className="mt-3 flex items-center gap-2 text-xs text-stone-400">
              <button
                onClick={() => b && onOpen(b.book_id)}
                className="min-w-0 truncate text-left text-stone-500 underline"
              >
                {b ? b.title : '삭제된 책'}
                {t.page ? ` · ${pageText(t)}` : ''}
              </button>
              <span className="ml-auto shrink-0">{kindText(t)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );

  if (preview) {
    return (
      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-700">필사 ({found.length})</h2>
          {found.length > PREVIEW_COUNT && (
            <button onClick={onShowAll} className="text-sm text-stone-500">
              모두 보기 ›
            </button>
          )}
        </div>
        {found.length === 0 ? (
          <p className="mt-3 text-center text-sm text-stone-400">찾는 필사가 없어요.</p>
        ) : (
          list
        )}
      </section>
    );
  }

  return (
    <section className="mt-4">
      <div className="flex flex-wrap gap-1.5">
        {[['all', '전체'], ...Object.entries(KIND_LABEL), ['none', '미분류']].map(
          ([key, label]) => (
            <Chip key={key} active={kindFilter === key} onClick={() => setKindFilter(key)}>
              {label}
            </Chip>
          )
        )}
      </div>
      <p className="mt-3 text-sm text-stone-500">{shown.length}개 찾았어요.</p>
      {shown.length === 0 ? (
        <p className="mt-8 text-center text-sm text-stone-400">
          찾는 필사가 없어요. 다른 글자로 찾아 보세요.
        </p>
      ) : (
        list
      )}
      <Pager curPage={curPage} totalPages={totalPages} goPage={goPage} />
    </section>
  );
}
