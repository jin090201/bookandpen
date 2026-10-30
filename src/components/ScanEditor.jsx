import { useEffect, useRef, useState } from 'react';
import { recognizeImage } from '../lib/ocr.js';
import { postprocess } from '../lib/postprocess.js';
import { uid, KIND_LABEL, kindsOf, LIMITS, countChars } from '../lib/storage.js';

export default function ScanEditor({ book, editing, onCancel, onHome, onSave }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');

  const [rawText, setRawText] = useState('');
  const [content, setContent] = useState(editing?.content ?? '');
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

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 허용
    if (!file) return;
    if (file.size > LIMITS.photoMB * 1024 * 1024) {
      setError(`사진이 너무 커요. ${LIMITS.photoMB}MB 이하 사진을 골라 주세요.`);
      return;
    }

    setError('');
    setPreviewUrl(URL.createObjectURL(file));
    setBusy(true);
    setProgress(0);
    setStatusText('준비 중…');

    try {
      const text = await recognizeImage(file, (m) => {
        if (m.status === 'recognizing text') {
          setStatusText('글자 인식 중…');
          setProgress(Math.round((m.progress || 0) * 100));
        } else if (m.status?.includes('loading')) {
          setStatusText('인식 엔진·언어 데이터 불러오는 중… (처음 한 번만 오래 걸려요)');
          setProgress(Math.round((m.progress || 0) * 100));
        }
      });
      setRawText(text);
      const cleaned = postprocess(text);
      if (!cleaned) {
        setError('글자를 찾지 못했어요. 더 밝고 선명하게 다시 찍어 보세요.');
      }
      // 기존에 적던 내용이 있으면 이어 붙임
      setContent((prev) => (prev.trim() ? prev.trim() + '\n\n' + cleaned : cleaned));
    } catch (err) {
      console.error(err);
      setError(
        '인식에 실패했어요. 인터넷 연결(최초 언어 데이터 다운로드)을 확인하고 다시 시도해 주세요.'
      );
    } finally {
      setBusy(false);
      setStatusText('');
    }
  };

  const reprocess = () => setContent(postprocess(rawText));

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
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-stone-700">
            필사 내용 (직접 수정할 수 있어요)
          </label>
          {rawText && (
            <button
              onClick={reprocess}
              className="text-xs text-stone-500 underline"
            >
              줄바꿈 다시 정리
            </button>
          )}
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={9}
          placeholder="사진을 인식하면 여기에 글이 나타나요. 직접 입력해도 돼요."
          className="mt-1 w-full rounded-xl border border-stone-300 bg-white p-3 font-body text-base leading-relaxed outline-none focus:border-stone-500"
        />
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
