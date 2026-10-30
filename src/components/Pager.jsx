import { useState } from 'react';

// 목록 나누기 공통 부분: 책 상세·즐겨찾기 탭에서 함께 씁니다.

// 번호 목록 만들기: 처음·끝·현재 주변만 보이고 사이는 '…'
function pageList(total, cur) {
  const nums = [...new Set([1, total, cur - 1, cur, cur + 1])]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push('…');
    out.push(n);
  });
  return out;
}

// 목록 나누기 계산 (삭제 등으로 목록 수가 줄어도 마지막 목록으로 보정)
export function usePaging(items, size = 3) {
  const [pageNo, setPageNo] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const curPage = Math.min(pageNo, totalPages);
  const pageItems = items.slice((curPage - 1) * size, curPage * size);
  const goPage = (n) => {
    setPageNo(Math.min(Math.max(1, n), totalPages));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const resetPage = () => setPageNo(1);
  return { curPage, totalPages, pageItems, goPage, resetPage };
}

export default function Pager({ curPage, totalPages, goPage }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-center gap-1 text-sm">
      <button
        onClick={() => goPage(curPage - 1)}
        disabled={curPage === 1}
        className="rounded-md px-2 py-1 text-stone-600 disabled:opacity-30"
        aria-label="이전 목록"
      >
        ‹
      </button>
      {pageList(totalPages, curPage).map((n, i) =>
        n === '…' ? (
          <span key={`gap-${i}`} className="px-1 text-stone-400">
            …
          </span>
        ) : (
          <button
            key={n}
            onClick={() => goPage(n)}
            className={`min-w-8 rounded-md px-2 py-1 ${
              n === curPage
                ? 'bg-accent text-on-accent'
                : 'border border-stone-300 bg-white text-stone-600'
            }`}
          >
            {n}
          </button>
        )
      )}
      <button
        onClick={() => goPage(curPage + 1)}
        disabled={curPage === totalPages}
        className="rounded-md px-2 py-1 text-stone-600 disabled:opacity-30"
        aria-label="다음 목록"
      >
        ›
      </button>
    </nav>
  );
}
