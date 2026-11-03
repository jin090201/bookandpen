import { useEffect, useRef, useState } from 'react';

// 인식하기 전에 사진에서 필사할 부분만 고르는 화면입니다.
// 영역은 사진 크기에 대한 비율({ x, y, w, h }, 0~1)로 다루고, 사진 전체를 고르면 null을 돌려줍니다.
const MIN_SIZE = 0.08; // 한 변의 최소 길이(사진 크기에 대한 비율)
const FULL = { x: 0, y: 0, w: 1, h: 1 };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const CORNERS = [
  { mode: 'nw', label: '왼쪽 위 모서리', style: { left: '0%', top: '0%' } },
  { mode: 'ne', label: '오른쪽 위 모서리', style: { left: '100%', top: '0%' } },
  { mode: 'sw', label: '왼쪽 아래 모서리', style: { left: '0%', top: '100%' } },
  { mode: 'se', label: '오른쪽 아래 모서리', style: { left: '100%', top: '100%' } },
];

export default function CropView({ file, onConfirm, onSkip, onCancel }) {
  const [url, setUrl] = useState(null);
  const [rect, setRect] = useState(FULL);
  const boxRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const startDrag = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      box: boxRef.current.getBoundingClientRect(),
      start: rect,
    };
  };

  const moveDrag = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / d.box.width;
    const dy = (e.clientY - d.startY) / d.box.height;
    const s = d.start;

    if (d.mode === 'move') {
      setRect({
        x: clamp(s.x + dx, 0, 1 - s.w),
        y: clamp(s.y + dy, 0, 1 - s.h),
        w: s.w,
        h: s.h,
      });
      return;
    }

    let left = s.x;
    let top = s.y;
    let right = s.x + s.w;
    let bottom = s.y + s.h;
    if (d.mode.includes('w')) left = clamp(left + dx, 0, right - MIN_SIZE);
    if (d.mode.includes('e')) right = clamp(right + dx, left + MIN_SIZE, 1);
    if (d.mode.includes('n')) top = clamp(top + dy, 0, bottom - MIN_SIZE);
    if (d.mode.includes('s')) bottom = clamp(bottom + dy, top + MIN_SIZE, 1);
    setRect({ x: left, y: top, w: right - left, h: bottom - top });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const pct = (v) => `${v * 100}%`;
  const isFull = rect.x <= 0.001 && rect.y <= 0.001 && rect.w >= 0.999 && rect.h >= 0.999;
  const dim = 'pointer-events-none absolute bg-black/45';

  return (
    <div className="px-4 pt-4">
      <button onClick={onCancel} className="text-sm text-stone-500">
        ← 취소
      </button>
      <h1 className="mt-3 font-body text-2xl font-bold">인식할 부분 고르기</h1>
      <p className="mt-1 text-sm text-stone-500">
        필사할 글 부분만 네모로 골라 주세요. 모서리를 끌면 크기가, 안쪽을 끌면 위치가 바뀌어요.
      </p>

      <div className="mt-4 flex justify-center">
        <div ref={boxRef} className="relative w-fit max-w-full select-none">
          {url && (
            <img
              src={url}
              alt="인식할 사진"
              draggable={false}
              className="block max-h-[60vh] max-w-full"
            />
          )}

          <div className={dim} style={{ left: 0, top: 0, width: '100%', height: pct(rect.y) }} />
          <div
            className={dim}
            style={{ left: 0, top: pct(rect.y + rect.h), width: '100%', height: pct(1 - rect.y - rect.h) }}
          />
          <div
            className={dim}
            style={{ left: 0, top: pct(rect.y), width: pct(rect.x), height: pct(rect.h) }}
          />
          <div
            className={dim}
            style={{
              left: pct(rect.x + rect.w),
              top: pct(rect.y),
              width: pct(1 - rect.x - rect.w),
              height: pct(rect.h),
            }}
          />

          <div
            onPointerDown={(e) => startDrag(e, 'move')}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute cursor-move touch-none border-2 border-white ring-1 ring-black/40"
            style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }}
          >
            {CORNERS.map((c) => (
              <div
                key={c.mode}
                role="button"
                aria-label={c.label}
                onPointerDown={(e) => startDrag(e, c.mode)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center"
                style={c.style}
              >
                <span className="h-4 w-4 rounded-full border-2 border-white bg-accent shadow" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 text-center">
        <button
          onClick={() => setRect(FULL)}
          disabled={isFull}
          className="text-xs text-stone-500 underline disabled:opacity-40"
        >
          사진 전체로 되돌리기
        </button>
      </div>

      <div className="mt-4 grid gap-2">
        <button
          onClick={() => onConfirm(isFull ? null : rect)}
          className="rounded-xl bg-accent py-3.5 font-semibold text-on-accent"
        >
          {isFull ? '이 사진으로 인식하기' : '이 부분으로 인식하기'}
        </button>
        <button
          onClick={onSkip}
          className="rounded-xl border border-stone-300 bg-white py-3 text-sm font-medium"
        >
          자르지 않고 인식하기
        </button>
      </div>
    </div>
  );
}
