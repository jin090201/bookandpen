import { useEffect, useRef, useState } from 'react';
import { recognizeImage } from '../lib/ocr.js';
import { postprocess } from '../lib/postprocess.js';
import Chip from './Chip.jsx';
import CropView from './CropView.jsx';
import { uid, KIND_LABEL, kindsOf, LIMITS, countChars } from '../lib/storage.js';

const MAX_CHIPS = 10;

// 입력칸은 선택한 글자가 안 보이는 위치에 있어도 스스로 스크롤하지 않으므로, 같은 모양의 숨은 칸에서 그 글자의 세로 위치를 재어 맞춰 줍니다.
function scrollToWord(ta, idx, len) {
  const cs = getComputedStyle(ta);
  const mirror = document.createElement('div');
  const copy = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing',
    'textIndent', 'textTransform', 'wordBreak', 'overflowWrap', 'tabSize',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  ];
  copy.forEach((k) => {
    mirror.style[k] = cs[k];
  });
  Object.assign(mirror.style, {
    position: 'absolute',
    visibility: 'hidden',
    top: '0',
    left: '-9999px',
    boxSizing: 'border-box',
    width: `${ta.clientWidth}px`,
    whiteSpace: 'pre-wrap',
  });
  mirror.textContent = ta.value.slice(0, idx);
  const mark = document.createElement('span');
  mark.textContent = ta.value.slice(idx, idx + len) || '.';
  mirror.appendChild(mark);
  document.body.appendChild(mirror);
  const top = mark.offsetTop;
  const lineH = mark.offsetHeight;
  document.body.removeChild(mirror);
  // 글자가 입력칸의 위쪽 1/3 지점쯤에 오게 합니다. 끝부분이면 스크롤 한계에서 멈춥니다.
  ta.scrollTop = Math.max(0, top - Math.max(0, ta.clientHeight / 3 - lineH / 2));
}

export default function ScanEditor({ book, editing, onCancel, onHome, onSave }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');

  const [rawText, setRawText] = useState('');
  const [content, setContent] = useState(editing?.content ?? '');
  // 새 사진의 글자를 기존 내용 아래에 붙일지(append), 기존 내용을 바꿀지(replace) 정합니다. 화면을 열 때마다 이어 붙이기로 시작합니다.
  const [joinMode, setJoinMode] = useState('append');
  // 내용이 마지막 사진 한 장의 인식 결과로만 이루어진 경우에만 true입니다. "줄바꿈 다시 정리"는 이때만 쓸 수 있습니다.
  const [rawWhole, setRawWhole] = useState(false);
  const contentRef = useRef(content);
  contentRef.current = content;
  // 인식 신뢰도가 낮아 확인해 볼 단어입니다. 본문에서 사라진(고친) 단어는 화면에서 빠집니다.
  const [doubtful, setDoubtful] = useState([]);
  // 마지막 사진의 확인 단어가 너무 많아 그 사진의 목록을 만들지 않았는지 나타냅니다.
  const [brokenPhoto, setBrokenPhoto] = useState(false);
  const textareaRef = useRef(null);
  const [page, setPage] = useState(editing?.page ? String(editing.page) : '');
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [kinds, setKinds] = useState(editing ? kindsOf(editing) : ['quote']);
  const toggleKind = (key) =>
    setKinds((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const cameraRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // 사진을 고르면 바로 인식하지 않고, 인식할 부분을 고르는 자르기 화면을 먼저 보여 줍니다.
  const [pendingFile, setPendingFile] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 허용
    if (!file) return;
    if (file.size > LIMITS.photoMB * 1024 * 1024) {
      setError(`사진이 너무 커요. ${LIMITS.photoMB}MB 이하 사진을 골라 주세요.`);
      return;
    }
    setError('');
    setPendingFile(file);
  };

  // crop: 자르기 화면에서 고른 영역(사진 크기에 대한 비율), 없으면 사진 전체를 인식합니다.
  const recognize = async (crop) => {
    const file = pendingFile;
    setPendingFile(null);
    if (!file) return;

    const mode = joinMode;
    if (mode === 'replace' && contentRef.current.trim()) {
      if (!window.confirm('필사 내용이 새 사진의 글자로 바뀌어요. 계속할까요?')) return;
    }

    setError('');
    setPreviewUrl(URL.createObjectURL(file));
    setBusy(true);
    setProgress(0);
    setStatusText('준비 중…');

    try {
      const { text, doubtful: found } = await recognizeImage(file, (m) => {
        if (m.status === 'recognizing text') {
          setStatusText('글자 인식 중…');
          setProgress(Math.round((m.progress || 0) * 100));
        } else if (m.status?.includes('loading')) {
          setStatusText('인식 엔진·언어 데이터 불러오는 중… (처음 한 번만 오래 걸려요)');
          setProgress(Math.round((m.progress || 0) * 100));
        }
      }, crop);
      const cleaned = postprocess(text);
      if (!cleaned) {
        // 인식된 글자가 없으면 기존 내용을 건드리지 않습니다.
        setError('글자를 찾지 못했어요. 더 밝고 선명하게 다시 찍어 보세요.');
        return;
      }
      // 이어 붙이기를 골랐고 기존에 적던 내용이 있으면 아래에 붙이고, 그 밖에는 새 글자로 채웁니다.
      const appended = mode === 'append' && contentRef.current.trim().length > 0;
      setRawText(text);
      setRawWhole(!appended);
      // 확인할 단어가 너무 많은 사진은 그 사진의 목록만 만들지 않고, 앞서 만든 목록은 그대로 둡니다.
      const broken = found.length > MAX_CHIPS;
      setBrokenPhoto(broken);
      setDoubtful((prev) => {
        const base = appended ? prev : [];
        return broken ? base : [...new Set([...base, ...found])];
      });
      setContent((prev) => (appended && prev.trim() ? prev.trim() + '\n\n' + cleaned : cleaned));
    } catch (err) {
      console.error(err);
      setError(
        err?.code === 'IMAGE'
          ? '이 사진을 열 수 없어요. JPG나 PNG 사진으로 다시 골라 주세요.'
          : '인식에 실패했어요. 인터넷 연결(최초 언어 데이터 다운로드)을 확인하고 다시 시도해 주세요.'
      );
    } finally {
      setBusy(false);
      setStatusText('');
    }
  };

  const reprocess = () => setContent(postprocess(rawText));

  const clearContent = () => {
    if (!window.confirm('필사 내용을 모두 지울까요?')) return;
    setContent('');
    setRawText('');
    setRawWhole(false);
    setDoubtful([]);
    setBrokenPhoto(false);
  };

  // 칩을 누르면 본문에서 그 단어를 선택합니다. 같은 단어를 다시 누르면 다음 위치로 넘어갑니다.
  const selectWord = (word) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const selected = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    const from = selected === word ? ta.selectionEnd : 0;
    let idx = ta.value.indexOf(word, from);
    if (idx < 0) idx = ta.value.indexOf(word);
    if (idx < 0) return;
    ta.focus();
    ta.setSelectionRange(idx, idx + word.length);
    scrollToWord(ta, idx, word.length);
  };
  const toCheck = doubtful.filter((w) => content.includes(w));

  const contentLen = countChars(content);
  const memoLen = countChars(memo);
  const overContent = contentLen > LIMITS.content;
  const overMemo = memoLen > LIMITS.memo;
  const num = (n) => n.toLocaleString('ko-KR');

  const save = () => {
    if (!content.trim() || overContent || overMemo) return;
    const pageNum = parseInt(page, 10);
    onSave({
      transcription_id: editing?.transcription_id ?? uid(),
      book_id: book.book_id,
      content: content.trim(),
      page: Number.isFinite(pageNum) && pageNum > 0 ? pageNum : null,
      memo: memo.trim(),
      kinds,
      favorite: editing?.favorite ?? false,
      created_at: editing?.created_at ?? new Date().toISOString(),
    });
  };

  if (pendingFile) {
    return (
      <CropView
        file={pendingFile}
        onConfirm={recognize}
        onSkip={() => recognize(null)}
        onCancel={() => setPendingFile(null)}
      />
    );
  }

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center justify-between">
        <button onClick={onCancel} className="text-sm text-stone-500">
          ← 취소
        </button>
        <button onClick={onHome} className="text-sm text-stone-500">
          첫 화면
        </button>
      </div>
      <h1 className="mt-3 font-body text-2xl font-bold">
        {editing ? '필사 수정' : '필사 추가'}
      </h1>
      <p className="text-sm text-stone-500">{book.title}</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => cameraRef.current?.click()}
          disabled={busy}
          className="rounded-xl bg-accent py-3 text-sm font-medium text-on-accent disabled:bg-stone-300"
        >
          📷 카메라로 촬영
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="rounded-xl border border-stone-300 bg-white py-3 text-sm font-medium disabled:opacity-50"
        >
          🖼 사진 불러오기
        </button>
      </div>
      {content.trim() && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-stone-500">새 사진의 글자는</span>
          <Chip active={joinMode === 'append'} onClick={() => setJoinMode('append')}>
            아래에 이어 붙이기
          </Chip>
          <Chip active={joinMode === 'replace'} onClick={() => setJoinMode('replace')}>
            바꾸기
          </Chip>
        </div>
      )}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />

      <p className="mt-2 text-xs text-stone-400">
        팁: 필사할 부분만 화면에 크게 나오게, 밝은 곳에서 정면으로 찍어 주세요.
        <br />
        사진 속 글자는 모두 본문에 들어가요. 페이지 숫자나 머리글이 같이 찍히면 본문에 섞이니, 지우고 페이지 칸에 직접 입력해 주세요.
        <br />
        인식이 잘 맞지 않으면 폰의 글자 복사 기능(갤러리나 카메라의 텍스트 인식, 구글 렌즈 등)으로 글자를 복사해 아래 필사 내용에 붙여 넣어도 돼요.
      </p>

      {previewUrl && (
        <img
          src={previewUrl}
          alt="촬영한 페이지 미리보기"
          className="mt-3 max-h-56 w-full rounded-xl border border-stone-200 object-contain bg-white"
        />
      )}

      {busy && (
        <div className="mt-3">
          <p className="text-sm text-stone-600">{statusText}</p>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-200">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex items-center gap-2">
        {Object.entries(KIND_LABEL).map(([key, label]) => (
          <button
            key={key}
            onClick={() => toggleKind(key)}
            aria-pressed={kinds.includes(key)}
            className={`rounded-full border px-3 py-1 text-sm ${
              kinds.includes(key)
                ? 'border-accent bg-accent text-on-accent'
                : 'border-stone-300 bg-white text-stone-600'
            }`}
          >
            {label}
          </button>
        ))}
        <input
          value={page}
          onChange={(e) => setPage(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          placeholder="페이지"
          aria-label="페이지"
          className="ml-auto w-20 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-center outline-none focus:border-stone-500"
        />
      </div>
      <p className="mt-1 text-xs text-stone-400">
        종류는 선택 사항이고, 둘 다 켤 수도 있어요.
      </p>

      <div className="mt-3">
        {/* 글자 크기가 커서 한 줄에 다 안 들어가면 버튼들이 통째로 아래 줄로 내려가고, 버튼 글자는 중간에서 끊기지 않습니다. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <label className="text-sm font-semibold text-stone-700">
            필사 내용 (직접 수정할 수 있어요)
          </label>
          <div className="ml-auto flex items-center gap-3 whitespace-nowrap">
            {rawText && rawWhole && (
              <button
                onClick={reprocess}
                className="text-xs text-stone-500 underline"
              >
                줄바꿈 다시 정리
              </button>
            )}
            {content.length > 0 && (
              <button
                onClick={clearContent}
                className="text-xs text-red-600 underline"
              >
                전체 지우기
              </button>
            )}
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          readOnly={busy} // 인식 중에 쓴 글이 결과로 덮어써지지 않게 잠급니다.
          rows={9}
          placeholder="사진을 인식하면 여기에 글이 나타나요. 직접 입력해도 돼요."
          className="mt-1 w-full rounded-xl border border-stone-300 bg-white p-3 font-body text-base leading-relaxed outline-none focus:border-stone-500"
        />
        {brokenPhoto && (
          <p className="mt-2 text-xs text-amber-700">
            {toCheck.length > 0 ? '방금 사진은 글자가 많이 깨져서 확인 목록을 만들지 않았어요. ' : '글자가 많이 깨졌어요. '}
            인식할 부분을 더 좁히거나, 책을 평평하게 펴서 다시 찍거나, 폰의 글자 복사를 써 보세요.
          </p>
        )}
        {toCheck.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-stone-500">
              잘못 읽었을 수 있는 글자예요. 누르면 본문에서 찾아 줘요.
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {toCheck.map((w) => (
                <button
                  key={w}
                  onClick={() => selectWord(w)}
                  className="rounded-full border border-amber-400 bg-amber-50 px-2.5 py-0.5 text-sm text-amber-900"
                >
                  {w}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-stone-400">
              글자 하나가 비슷한 글자로 바뀐 경우(예: 도구→노구)는 표시되지 않으니 한 번 더 읽어 주세요.
            </p>
          </div>
        )}
        <p className={`mt-1 text-right text-xs ${overContent ? 'text-red-600' : 'text-stone-500'}`}>
          {num(contentLen)} / {num(LIMITS.content)}자
          {overContent && ` · ${num(contentLen - LIMITS.content)}자를 줄여 주세요`}
        </p>
      </div>

      <div className="mt-3">
        <label className="text-sm font-semibold text-stone-700">메모 (선택)</label>
        <input
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="이 필사에 남길 말"
          className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 outline-none focus:border-stone-500"
        />
        <p className={`mt-1 text-right text-xs ${overMemo ? 'text-red-600' : 'text-stone-500'}`}>
          {num(memoLen)} / {num(LIMITS.memo)}자
          {overMemo && ` · ${num(memoLen - LIMITS.memo)}자를 줄여 주세요`}
        </p>
      </div>

      <button
        onClick={save}
        disabled={busy || !content.trim() || overContent || overMemo}
        className="mt-5 w-full rounded-xl bg-accent py-3.5 font-semibold text-on-accent disabled:bg-stone-300"
      >
        저장하기
      </button>
    </div>
  );
}
