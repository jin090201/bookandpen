import { pageText } from '../lib/storage.js';

// 책별 진행률 막대. progress는 storage.js의 bookProgress 결과입니다.
// slim이면 책장 목록형에 쓰는 얇은 막대(글자 없이 막대만)이고,
// 아니면 책 상세에서 흰 카드(테두리·둥근 모서리)로 묶어 책 정보와 구분해 보여 줍니다.
export default function ProgressBar({ progress, slim = false }) {
  const { total, read, pct, over, done, stopped } = progress;
  const card = 'mt-3 rounded-xl border border-stone-200 bg-white px-4 py-3';
  // 페이지를 적은 필사가 없으면(완독이 아닐 때) 막대를 그리지 않고 안내만 합니다.
  if (read === 0 && !done) {
    if (slim) return null;
    return (
      <div className={card}>
        <p className="text-xs font-medium text-stone-600">읽은 정도</p>
        <p className="mt-1 text-xs text-stone-500">
          전체 {pageText({ page: total })} · 페이지를 적은 필사가 없어요.
        </p>
      </div>
    );
  }
  const bar = (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="읽은 정도"
      className={`overflow-hidden rounded-full bg-stone-200 ${slim ? 'h-1' : 'h-2'}`}
    >
      <div
        className={`h-full rounded-full ${stopped ? 'bg-stone-400' : 'bg-accent'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
  if (slim) return <div className="mt-1.5">{bar}</div>;
  return (
    <div className={card}>
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium text-stone-600">읽은 정도</p>
        <p className="text-xs font-medium text-stone-600">{done ? '완독' : `${pct}%`}</p>
      </div>
      <div className="mt-2">{bar}</div>
      <p className="mt-1.5 text-xs text-stone-500">
        {done
          ? `전체 ${pageText({ page: total })}`
          : `${read} / ${pageText({ page: total })}${stopped ? ' · 중단' : ''}`}
      </p>
      {over && !done && (
        <p className="text-xs text-stone-500">
          전체 페이지 수보다 큰 페이지({pageText({ page: read })})를 적은 필사가 있어요. 전체 페이지 수를 확인해 주세요.
        </p>
      )}
    </div>
  );
}
