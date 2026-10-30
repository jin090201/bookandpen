// 동그란 선택 칩: 종류 필터 등에서 함께 씁니다.
export default function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs ${
        active ? 'border-accent bg-accent text-on-accent' : 'border-stone-300 bg-white text-stone-600'
      }`}
    >
      {children}
    </button>
  );
}
