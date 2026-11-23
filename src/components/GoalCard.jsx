import { useState } from 'react';
import { GOAL_MAX, loadGoals, saveGoal } from '../lib/storage.js';
import { dayKey } from '../lib/date.js';

// 통계 위쪽의 "올해 완독 목표" 카드: 올해 읽어 끝낸 책 수와 목표 권수를 막대로 보여 줍니다.
export default function GoalCard({ books }) {
  const year = new Date().getFullYear();
  const [goal, setGoal] = useState(() => loadGoals()[String(year)] || 0);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

  const done = books.filter(
    (b) => b.status === 'COMPLETED' && b.completed_at && dayKey(b.completed_at).startsWith(String(year))
  ).length;
  const percent = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;

  const startEdit = () => {
    setText(goal > 0 ? String(goal) : '');
    setEditing(true);
  };
  const apply = (value) => {
    setGoal(saveGoal(year, value)[String(year)] || 0);
    setEditing(false);
  };
  const n = Number(text);
  const valid = Number.isInteger(n) && n >= 1 && n <= GOAL_MAX;

  return (
    <div className="mt-3 rounded-xl border border-stone-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{year}년 완독 목표</p>
        {!editing && (
          <button onClick={startEdit} className="text-xs text-stone-500 underline">
            {goal > 0 ? '고치기' : '목표 정하기'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={GOAL_MAX}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="올해 완독 목표 권수"
              placeholder="예: 12"
              className="w-24 rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
            />
            <span className="text-sm">권</span>
          </div>
          <p className="mt-1 text-xs text-stone-500">1권부터 {GOAL_MAX}권까지 정할 수 있어요.</p>
          <div className="mt-2 flex gap-2 text-sm">
            <button
              onClick={() => apply(n)}
              disabled={!valid}
              className="rounded-lg bg-accent px-3 py-1.5 text-on-accent disabled:opacity-40"
            >
              저장
            </button>
            <button onClick={() => setEditing(false)} className="rounded-lg border border-stone-300 px-3 py-1.5">
              취소
            </button>
            {goal > 0 && (
              <button onClick={() => apply(0)} className="ml-auto px-2 py-1.5 text-stone-500 underline">
                목표 없애기
              </button>
            )}
          </div>
        </div>
      ) : goal > 0 ? (
        <>
          <p className="mt-2 text-lg font-bold">
            {done} / {goal}권
            <span className="ml-2 text-xs font-normal text-stone-500">{percent}%</span>
          </p>
          <div
            className="mt-1 h-2 overflow-hidden rounded-full bg-stone-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={Math.min(done, goal)}
            aria-label="올해 완독 목표 진행"
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1 text-xs text-stone-500">
            {done >= goal ? '목표를 이뤘어요!' : `${goal - done}권 남았어요.`}
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs text-stone-500">올해 몇 권을 읽을지 정해 보세요.</p>
      )}
    </div>
  );
}
