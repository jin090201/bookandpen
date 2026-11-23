// 안내 글을 읽기 쉽게 보여 주는 공통 조각입니다. (사용 방법, 설정 > 정보, 필사 추가 화면에서 씁니다.)

// 글 안의 **굵게**를 굵은 글씨로 바꿔 보여 줍니다.
export function RichText({ text }) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') ? (
      <strong key={i} className="font-semibold text-stone-800">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    )
  );
}

// 같은 문구를 두 곳(사용 방법 9번, 필사 추가 화면)에서 쓰므로 한 곳에서 정합니다.
export const DOUBT_WARNING =
  '글자 하나가 비슷한 글자로 바뀐 경우(예: 도구→노구)는 표시되지 않으니 한 번 더 읽어 주세요.';

// 팁·주의 상자. kind가 'warn'이면 노란 왼쪽 선의 "⚠ 주의", 아니면 "💡 팁"입니다.
// 팁의 배경은 테마 색(stone-50)이고, 주의는 그 위에 노란 기운을 10%만 섞어 팁과 구분합니다.
// (글자색은 테마 색 그대로라 라이트·세피아·다크 모두에서 읽힙니다. 진한 노란 배경은 다크에서 글자가 안 보여 쓰지 않습니다.)
export default function Note({ kind = 'tip', text, className = 'mt-2.5' }) {
  const warn = kind === 'warn';
  return (
    <div
      className={`${className} whitespace-pre-line rounded-r-lg border-l-4 px-3 py-2 text-sm leading-relaxed ${
        warn
          ? 'border-amber-400 bg-amber-400/10 text-stone-700'
          : 'border-stone-300 bg-stone-50 text-stone-600'
      }`}
    >
      <p className={`mb-0.5 text-xs font-semibold ${warn ? 'text-stone-600' : 'text-stone-500'}`}>
        {warn ? '⚠ 주의' : '💡 팁'}
      </p>
      <RichText text={text} />
    </div>
  );
}
