import { useState } from 'react';
import { STATUS_LABEL } from './BookList.jsx';
import Chip from './Chip.jsx';
import Pager, { usePaging } from './Pager.jsx';
import { dotDate, fileStamp } from '../lib/date.js';
import {
  KIND_LABEL,
  filterByKind,
  kindText,
  pageText,
  buildMarkdown,
  buildPlainText,
  safeFilename,
  downloadTextFile,
} from '../lib/storage.js';

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 아래 대체 방식으로 진행 */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

const PAGE_SIZE = 3; // 한 화면에 보여 줄 필사 개수

export default function BookDetail({
  book,
  transcriptions,
  onBack,
  onHome,
  onScan,
  onEdit,
  onDeleteTranscription,
  onToggleFavorite,
  onClearTranscriptions,
  onStatusChange,
  onDeleteBook,
}) {
  const [copied, setCopied] = useState(null); // { id, ok }
  const [expanded, setExpanded] = useState(() => new Set()); // 펼친 필사 id
  const [kindFilter, setKindFilter] = useState('all'); // all | quote | mine | none
  const [selecting, setSelecting] = useState(false); // 선택 모드
  const [picked, setPicked] = useState(() => new Set()); // 선택한 필사 id

  const toggleExpanded = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleCopy = async (t) => {
    const text = `${t.content}\n\n- ${book.title}${
      book.author ? `, ${book.author}` : ''
    }${t.page ? ` (${pageText(t)})` : ''}`;
    const ok = await copyText(text);
    setCopied({ id: t.transcription_id, ok });
    setTimeout(() => setCopied(null), 1500);
  };

  const sorted = [...transcriptions].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
  const shown = filterByKind(sorted, kindFilter);

  // 목록 나누기 (삭제 등으로 목록 수가 줄어도 마지막 목록으로 보정)
  const { curPage, totalPages, pageItems, goPage, resetPage } = usePaging(shown, PAGE_SIZE);

  const togglePicked = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exitSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
  };

  // 지금 보이는 필사가 모두 선택돼 있으면 해제, 아니면 모두 선택
  const allShownPicked =
    shown.length > 0 && shown.every((t) => picked.has(t.transcription_id));
  const togglePickAll = () =>
    setPicked(allShownPicked ? new Set() : new Set(shown.map((t) => t.transcription_id)));

  const pickedList = transcriptions.filter((t) => picked.has(t.transcription_id));

  // 마크다운(.md) 또는 텍스트(.txt)로 내려받기 — 선택 모드면 선택한 필사만, 아니면 전체
  const handleExport = (ext) => {
    const list = selecting ? pickedList : transcriptions;
    if (list.length === 0) return;
    const text =
      ext === 'md' ? buildMarkdown(book, list) : buildPlainText(book, list);
    downloadTextFile(
      `${safeFilename(book.title)}-필사${selecting ? '-선택' : ''}-${fileStamp()}.${ext}`,
      text,
      ext === 'md' ? 'text/markdown' : 'text/plain'
    );
    if (selecting) exitSelecting();
  };

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-stone-500">
          ← 책 목록
        </button>
        <button onClick={onHome} className="text-sm text-stone-500">
          첫 화면
        </button>
      </div>

      <div className="mt-3">
        <h1 className="font-body text-2xl font-bold">{book.title}</h1>
        <p className="text-sm text-stone-500">{book.author || '저자 미입력'}</p>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <select
          value={book.status}
          onChange={(e) => onStatusChange(e.target.value)}
          className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm"
        >
          {Object.entries(STATUS_LABEL).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        {sorted.length > 0 && (
          <button
            onClick={() => {
              if (
                window.confirm(
                  `이 책의 필사 ${sorted.length}개를 모두 삭제할까요? 책은 그대로 남고, 되돌릴 수 없어요.`
                )
              )
                onClearTranscriptions();
            }}
            className="ml-auto text-sm text-red-500"
          >
            필사 전체 삭제
          </button>
        )}
        <button
          onClick={() => {
            if (
              window.confirm(
                '이 책과 모든 필사 기록을 삭제할까요? 되돌릴 수 없어요.'
              )
            )
              onDeleteBook();
          }}
          className={`text-sm text-red-500 ${
            sorted.length > 0 ? 'ml-3' : 'ml-auto'
          }`}
        >
          책 삭제
        </button>
      </div>

      <div className="mt-6 flex items-center">
        <h2 className="text-sm font-semibold text-stone-700">
          필사 노트 ({sorted.length})
        </h2>
        {sorted.length > 0 && !selecting && (
          <div className="ml-auto flex items-center gap-2 text-xs text-stone-500">
            <button
              onClick={() => setSelecting(true)}
              className="rounded-md border border-stone-300 bg-white px-2 py-1"
            >
              선택
            </button>
            <span>내보내기</span>
            <button
              onClick={() => handleExport('md')}
              className="rounded-md border border-stone-300 bg-white px-2 py-1"
            >
              .md
            </button>
            <button
              onClick={() => handleExport('txt')}
              className="rounded-md border border-stone-300 bg-white px-2 py-1"
            >
              .txt
            </button>
          </div>
        )}
      </div>

      {selecting && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600">
          <span className="font-semibold">{pickedList.length}개 선택</span>
          <button onClick={togglePickAll} className="underline">
            {allShownPicked ? '선택 해제' : '전체 선택'}
          </button>
          <span className="ml-auto">내보내기</span>
          <button
            onClick={() => handleExport('md')}
            disabled={pickedList.length === 0}
            className="rounded-md border border-stone-300 bg-white px-2 py-1 disabled:opacity-40"
          >
            .md
          </button>
          <button
            onClick={() => handleExport('txt')}
            disabled={pickedList.length === 0}
            className="rounded-md border border-stone-300 bg-white px-2 py-1 disabled:opacity-40"
          >
            .txt
          </button>
          <button onClick={exitSelecting} className="ml-1 text-stone-500">
            취소
          </button>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="mt-2 flex gap-2">
          {[['all', '전체'], ...Object.entries(KIND_LABEL), ['none', '미분류']].map(([key, label]) => (
            <Chip
              key={key}
              active={kindFilter === key}
              onClick={() => {
                setKindFilter(key);
                resetPage();
              }}
            >
              {label}
            </Chip>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="mt-6 text-center text-sm text-stone-400">
          아직 필사한 글이 없어요. 아래 버튼으로 책 페이지를 찍어 보세요.
        </p>
      ) : shown.length === 0 ? (
        <p className="mt-6 text-center text-sm text-stone-400">
          이 종류의 필사가 아직 없어요.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {pageItems.map((t) => (
            <li
              key={t.transcription_id}
              className={`rounded-xl border bg-white p-4 ${
                selecting && picked.has(t.transcription_id)
                  ? 'border-accent'
                  : 'border-stone-200'
              }`}
            >
              {selecting && (
                <label className="mb-2 flex items-center gap-2 text-sm text-stone-600">
                  <input
                    type="checkbox"
                    checked={picked.has(t.transcription_id)}
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
              {t.memo && (
                <p className="mt-3 whitespace-pre-wrap rounded-lg bg-stone-100 p-2 text-sm text-stone-600">
                  {t.memo}
                </p>
              )}
              <div className="mt-3 flex items-center text-xs text-stone-400">
                <span>
                  <span className="mr-1 rounded bg-stone-100 px-1.5 py-0.5 text-stone-500">
                    {kindText(t)}
                  </span>
                  {t.page ? `${pageText(t)} · ` : ''}
                  {dotDate(t.created_at)}
                </span>
                <div className="ml-auto flex items-center gap-3 text-sm">
                  <button
                    onClick={() => onToggleFavorite(t.transcription_id)}
                    className="text-lg leading-none text-amber-500"
                    aria-label={t.favorite ? '즐겨찾기 해제' : '즐겨찾기'}
                  >
                    {t.favorite ? '★' : '☆'}
                  </button>
                  <button
                    onClick={() => handleCopy(t)}
                    className="text-stone-600"
                  >
                    {copied?.id === t.transcription_id
                      ? copied.ok
                        ? '복사됨'
                        : '복사 실패'
                      : '복사'}
                  </button>
                  <button
                    onClick={() => onEdit(t)}
                    className="text-stone-600"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('이 필사를 삭제할까요?'))
                        onDeleteTranscription(t.transcription_id);
                    }}
                    className="text-red-500"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pager curPage={curPage} totalPages={totalPages} goPage={goPage} />

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md bg-gradient-to-t from-stone-50 via-stone-50 to-transparent p-4 pt-8">
        <button
          onClick={onScan}
          className="w-full rounded-xl bg-accent py-3.5 font-semibold text-on-accent shadow-lg active:opacity-90"
        >
          📷 필사 추가하기
        </button>
      </div>
    </div>
  );
}
