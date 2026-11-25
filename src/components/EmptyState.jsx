// 빈 화면 안내를 흰 카드 한 모양으로 그립니다.
// 화면에 이미 상태(부제·개수)가 보이면 title에 할 일 한 줄만 쓰고,
// 상태를 알려 줘야 하면 title에 상태, hint에 할 일을 씁니다.
export default function EmptyState({ title, hint, className = 'mt-10' }) {
  return (
    <div
      className={`${className} rounded-xl border border-stone-200 bg-white px-4 py-4 text-center`}
    >
      <p className={`text-sm ${hint ? 'font-medium text-stone-600' : 'text-stone-500'}`}>{title}</p>
      {hint && <p className="mt-1 text-sm text-stone-400">{hint}</p>}
    </div>
  );
}
