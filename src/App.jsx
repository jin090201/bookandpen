import { useEffect, useRef, useState } from 'react';
import {
  BACKUP_EVENT,
  backupReminders,
  closeBackupReminder,
  getLastBackup,
  DATA_KEY,
  getRemindClosedAt,
  hasCorruptCopy,
  loadData,
  cleanTotalPages,
  mergeGoals,
  planImport,
  saveData,
  storageUsage,
  uid,
} from './lib/storage.js';
import { dayKey } from './lib/date.js';
import BookList, { FavoritesView, SettingsView } from './components/BookList.jsx';
import BookDetail from './components/BookDetail.jsx';
import ScanEditor from './components/ScanEditor.jsx';
import CalendarView from './components/CalendarView.jsx';
import StatsView from './components/StatsView.jsx';

const TABS = [
  ['shelf', '📚', '책장'],
  ['favorites', '★', '즐겨찾기'],
  ['record', '📝', '기록'],
  ['settings', '⚙', '설정'],
];

export default function App() {
  const [data, setData] = useState(loadData);
  const [view, setView] = useState({ name: 'books' });
  const [saveError, setSaveError] = useState(false);
  const [recordTab, setRecordTab] = useState('calendar'); // calendar | stats
  // 책장 검색(책·필사)의 검색어·범위·종류 필터는 여기서 들고 있어 책 상세에 다녀와도 유지됩니다(앱을 닫으면 사라짐)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState('all'); // all | book | tx
  const [searchKind, setSearchKind] = useState('all'); // 필사 범위의 종류: all | quote | mine | none
  const [tab, setTab] = useState('shelf'); // shelf | favorites | record | settings

  const [usage, setUsage] = useState(storageUsage);
  const [lastBackup, setLastBackup] = useState(getLastBackup);
  const [remindClosedAt, setRemindClosedAt] = useState(getRemindClosedAt);
  // 되돌릴 수 있는 삭제 목록(오래된 것이 앞): [{ id, label, removed: { books, transcriptions }, expiresAt }]
  const [undoList, setUndoList] = useState([]);
  // 저장된 데이터를 읽지 못해 원본을 따로 보관했는지 (처음 열 때 한 번 확인)
  const [corruptNotice, setCorruptNotice] = useState(hasCorruptCopy);

  // ---- 화면 이동과 브라우저(안드로이드) 뒤로가기 연결 ----
  // 책 상세·필사 화면으로 들어갈 때 기록을 쌓고, 뒤로가기는 한 단계 앞 화면으로 돌아갑니다.
  const viewRef = useRef(view);
  viewRef.current = view;
  // 필사 화면이 "쓰던 내용이 있으니 나가기 전에 확인하라"고 알려 주는 함수입니다(없으면 그냥 나감).
  const leaveGuardRef = useRef(null);
  const depthOf = (v) => (v.name === 'scan' ? 2 : v.name === 'book' ? 1 : 0);

  useEffect(() => {
    try {
      window.history.replaceState({ view: { name: 'books' } }, '');
    } catch {
      /* 무시 */
    }
    const onPop = (e) => {
      const cur = viewRef.current;
      // 쓰던 내용을 버리고 나가는지 확인하고, 취소하면 필사 화면의 기록을 다시 쌓아 머뭅니다.
      if (cur.name === 'scan' && leaveGuardRef.current && !leaveGuardRef.current()) {
        try {
          window.history.pushState({ view: cur }, '');
        } catch {
          /* 무시 */
        }
        return;
      }
      setView(e.state?.view || { name: 'books' });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (next) => {
    try {
      window.history.pushState({ view: next }, '');
    } catch {
      /* 무시 */
    }
    setView(next);
  };
  const goBack = () => window.history.back();
  // 첫 화면(책장)까지 한 번에 돌아갑니다.
  const goHome = () => {
    setTab('shelf');
    const depth = depthOf(viewRef.current);
    if (depth > 0) window.history.go(-depth);
  };

  useEffect(() => {
    setSaveError(!saveData(data));
    setUsage(storageUsage());
  }, [data]);

  // 앱을 열어 둔 채 자정을 넘기면 "오늘"·"올해" 기준이 바뀝니다. 화면에 다시 돌아오거나 1분마다 날짜를 확인해,
  // 날짜가 바뀌었으면 기록 탭(달력·통계)을 오늘 기준으로 새로 엽니다(필사 입력 화면은 건드리지 않습니다).
  const [dayStamp, setDayStamp] = useState(() => dayKey(new Date()));
  useEffect(() => {
    const check = () => setDayStamp(dayKey(new Date())); // 같은 값이면 다시 그리지 않습니다
    const onVisible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    const timer = setInterval(check, 60000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
      clearInterval(timer);
    };
  }, []);

  // 다른 탭에서 기록이 바뀌면 이 탭도 최신 기록을 읽어 옵니다(그대로 두면 나중에 저장한 탭이 앞의 변경을 덮어씁니다).
  // 값이 같으면 브라우저가 이벤트를 보내지 않으므로, 읽어 와서 다시 저장해도 서로 계속 주고받지 않습니다.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === DATA_KEY || e.key === null) setData(loadData());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // 설정에서 백업을 내려받으면 마지막 백업 시각을 새로 읽습니다
  useEffect(() => {
    const onBackup = () => setLastBackup(getLastBackup());
    window.addEventListener(BACKUP_EVENT, onBackup);
    return () => window.removeEventListener(BACKUP_EVENT, onBackup);
  }, []);

  // 삭제한 항목은 삭제한 때부터 10초 동안 되돌릴 수 있고(항목마다 따로 셈), 최대 5개까지 쌓아 둡니다.
  const UNDO_MS = 10000;
  const UNDO_LIMIT = 5;
  useEffect(() => {
    if (undoList.length === 0) return undefined;
    const soonest = Math.min(...undoList.map((u) => u.expiresAt));
    const timer = setTimeout(() => {
      const now = Date.now();
      setUndoList((list) => list.filter((u) => u.expiresAt > now));
    }, Math.max(0, soonest - Date.now()) + 20);
    return () => clearTimeout(timer);
  }, [undoList]);

  // 삭제한 항목을 기억해 두었다가 되돌리기 (그 사이 바뀐 다른 기록은 건드리지 않아요)
  const offerUndo = (label, removed) => {
    if (removed.books.length + removed.transcriptions.length === 0) return;
    setUndoList((list) =>
      [...list, { id: uid(), label, removed, expiresAt: Date.now() + UNDO_MS }].slice(-UNDO_LIMIT)
    );
  };

  // "되돌리기"를 누르면 가장 최근에 삭제한 것부터 한 개씩 되돌립니다.
  const undoDelete = () => {
    const last = undoList[undoList.length - 1];
    if (!last) return;
    const { removed } = last;
    setData((d) => {
      const bookIds = new Set(d.books.map((b) => b.book_id));
      const tIds = new Set(d.transcriptions.map((t) => t.transcription_id));
      return {
        books: [...removed.books.filter((b) => !bookIds.has(b.book_id)), ...d.books],
        transcriptions: [
          ...removed.transcriptions.filter((t) => !tIds.has(t.transcription_id)),
          ...d.transcriptions,
        ],
      };
    });
    setUndoList((list) => list.filter((u) => u.id !== last.id));
  };

  const addBook = ({ title, author, publisher, totalPages }) => {
    const book = {
      book_id: uid(),
      title: title.trim(),
      author: author.trim(),
      publisher: (publisher || '').trim(),
      status: 'READING',
      created_at: new Date().toISOString(),
    };
    const tp = cleanTotalPages(totalPages);
    if (tp) book.total_pages = tp; // 전체 페이지 수(선택)
    setData((d) => ({ ...d, books: [book, ...d.books] }));
  };

  // 책 제목·저자·출판사 수정. 필사는 book_id로 이어져 있어서 제목을 바꿔도 그대로 연결됩니다.
  const updateBookInfo = (bookId, { title, author, publisher, totalPages }) => {
    setData((d) => ({
      ...d,
      books: d.books.map((b) => {
        if (b.book_id !== bookId) return b;
        const next = { ...b, title: title.trim(), author: author.trim(), publisher: (publisher || '').trim() };
        const tp = cleanTotalPages(totalPages);
        if (tp) next.total_pages = tp;
        else delete next.total_pages; // 비우면 전체 페이지 수를 없앱니다
        return next;
      }),
    }));
  };

  const updateBookStatus = (bookId, status) => {
    setData((d) => ({
      ...d,
      books: d.books.map((b) => {
        if (b.book_id !== bookId) return b;
        const next = { ...b, status };
        // 완독으로 바꾼 날짜를 기록 (통계용). 완독이 아니게 되면 지웁니다.
        if (status === 'COMPLETED') next.completed_at = b.completed_at || new Date().toISOString();
        else delete next.completed_at;
        return next;
      }),
    }));
  };

  const deleteBook = (bookId) => {
    offerUndo('책을 삭제했어요.', {
      books: data.books.filter((b) => b.book_id === bookId),
      transcriptions: data.transcriptions.filter((t) => t.book_id === bookId),
    });
    setData((d) => ({
      books: d.books.filter((b) => b.book_id !== bookId),
      transcriptions: d.transcriptions.filter((t) => t.book_id !== bookId),
    }));
  };

  const saveTranscription = (t) => {
    setData((d) => {
      const exists = d.transcriptions.some(
        (x) => x.transcription_id === t.transcription_id
      );
      return {
        ...d,
        transcriptions: exists
          ? d.transcriptions.map((x) =>
              x.transcription_id === t.transcription_id ? t : x
            )
          : [t, ...d.transcriptions],
      };
    });
  };

  const deleteTranscription = (id) => {
    offerUndo('필사를 삭제했어요.', {
      books: [],
      transcriptions: data.transcriptions.filter((t) => t.transcription_id === id),
    });
    setData((d) => ({
      ...d,
      transcriptions: d.transcriptions.filter((t) => t.transcription_id !== id),
    }));
  };

  const deleteBooks = (ids) => {
    offerUndo(`책 ${ids.length}권을 삭제했어요.`, {
      books: data.books.filter((b) => ids.includes(b.book_id)),
      transcriptions: data.transcriptions.filter((t) => ids.includes(t.book_id)),
    });
    setData((d) => ({
      books: d.books.filter((b) => !ids.includes(b.book_id)),
      transcriptions: d.transcriptions.filter((t) => !ids.includes(t.book_id)),
    }));
  };

  // 책은 두고 그 책의 필사만 모두 삭제
  const clearTranscriptions = (bookId) => {
    const removed = data.transcriptions.filter((t) => t.book_id === bookId);
    offerUndo(`필사 ${removed.length}개를 삭제했어요.`, { books: [], transcriptions: removed });
    setData((d) => ({
      ...d,
      transcriptions: d.transcriptions.filter((t) => t.book_id !== bookId),
    }));
  };

  // 즐겨찾기(별표) 켜고 끄기 — 기존 기록에는 값이 없으면 '해제'로 취급
  const toggleFavorite = (id) => {
    setData((d) => ({
      ...d,
      transcriptions: d.transcriptions.map((t) =>
        t.transcription_id === id ? { ...t, favorite: !t.favorite } : t
      ),
    }));
  };

  // 여러 개의 즐겨찾기를 한 번에 해제 (필사 내용은 그대로 둠)
  const unfavoriteMany = (ids) => {
    const set = new Set(ids);
    setData((d) => ({
      ...d,
      transcriptions: d.transcriptions.map((t) =>
        set.has(t.transcription_id) ? { ...t, favorite: false } : t
      ),
    }));
  };

  // 가져오기: 기존 기록은 지우지 않고, 없는 항목만 합침(같은 id는 건너뜀)
  const importBackup = (parsed) => {
    const { newBooks, newTs } = planImport(data, parsed);
    const { goals } = parsed;
    setData((d) => ({
      books: [...newBooks, ...d.books],
      transcriptions: [...newTs, ...d.transcriptions],
    }));
    return { books: newBooks.length, transcriptions: newTs.length, goals: mergeGoals(goals) };
  };

  const book =
    view.bookId && data.books.find((b) => b.book_id === view.bookId);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-stone-50 pb-24">
      {saveError && (
        <div className="bg-red-100 px-4 py-2 text-sm text-red-700">
          저장 공간이 가득 찼거나 저장이 차단되어 변경 내용이 보존되지 않을 수
          있어요.
        </div>
      )}

      {corruptNotice && (
        <div className="flex items-center gap-2 bg-red-100 px-4 py-2 text-sm text-red-700">
          <span className="flex-1">
            저장된 기록을 읽지 못해서 빈 상태로 열렸어요. 깨진 원본은 이 기기에 따로 보관해 두었어요.
          </span>
          <button onClick={() => setCorruptNotice(false)} aria-label="안내 닫기" className="px-1">
            ✕
          </button>
        </div>
      )}

      {view.name === 'books' && (() => {
        const { backup, space } = backupReminders(data, lastBackup, usage, remindClosedAt);
        const reasons = [...backup, ...space];
        if (reasons.length === 0) return null;
        return (
          <div className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900">
            <span className="flex-1">
              {reasons.join(' ')} 설정 &gt; 데이터에서 백업해 두세요.
            </span>
            <button onClick={() => setTab('settings')} className="font-semibold underline">
              설정으로
            </button>
            {backup.length > 0 && (
              <button
                onClick={() => {
                  closeBackupReminder();
                  setRemindClosedAt(new Date().toISOString());
                }}
                aria-label="7일 동안 닫기"
                className="px-1"
              >
                ✕
              </button>
            )}
          </div>
        );
      })()}

      {undoList.length > 0 && (
        <div className="fixed inset-x-0 bottom-28 z-20 mx-auto max-w-md px-4">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-stone-800 px-4 py-3 text-sm text-white shadow-lg">
            <span>
              {undoList[undoList.length - 1].label}
              {undoList.length > 1 ? ` · 삭제 ${undoList.length}건` : ''}
            </span>
            <button onClick={undoDelete} className="font-semibold text-amber-300">
              되돌리기
            </button>
          </div>
        </div>
      )}

      {view.name === 'books' && tab === 'shelf' && (
        <BookList
          books={data.books}
          transcriptions={data.transcriptions}
          onAdd={addBook}
          onOpen={(bookId) => navigate({ name: 'book', bookId })}
          onDeleteBooks={deleteBooks}
          query={searchQuery}
          setQuery={setSearchQuery}
          scope={searchScope}
          setScope={setSearchScope}
          txKind={searchKind}
          setTxKind={setSearchKind}
        />
      )}

      {view.name === 'books' && tab === 'favorites' && (
        <FavoritesView
          books={data.books}
          transcriptions={data.transcriptions}
          onOpen={(bookId) => navigate({ name: 'book', bookId })}
          onToggleFavorite={toggleFavorite}
          onUnfavorite={unfavoriteMany}
        />
      )}

      {view.name === 'books' && tab === 'record' && (
        <>
          <div className="mx-4 mt-4 grid grid-cols-2 rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
            {[['calendar', '달력'], ['stats', '통계']].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setRecordTab(k)}
                className={`rounded-md py-1.5 ${
                  recordTab === k ? 'bg-accent font-semibold text-on-accent' : 'text-stone-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* 달력과 통계를 둘 다 띄워 두고 안 보이는 쪽은 숨깁니다. 그래야 오가도 보던 달·날짜·탭이 유지됩니다. */}
          <div className={recordTab === 'calendar' ? '' : 'hidden'}>
            <CalendarView key={dayStamp} books={data.books} transcriptions={data.transcriptions} />
          </div>
          <div className={recordTab === 'stats' ? '' : 'hidden'}>
            <StatsView key={dayStamp} books={data.books} transcriptions={data.transcriptions} />
          </div>
        </>
      )}

      {view.name === 'books' && tab === 'settings' && (
        <SettingsView
          data={data}
          onImport={importBackup}
          onClearAll={() => {
            setData((d) => ({ ...d, books: [], transcriptions: [] }));
            setUndoList([]); // 모든 기록 삭제는 되돌릴 수 없으니, 앞서 삭제한 것의 되돌리기도 함께 지웁니다.
          }}
        />
      )}

      {view.name === 'book' && book && (
        <BookDetail
          book={book}
          transcriptions={data.transcriptions.filter(
            (t) => t.book_id === book.book_id
          )}
          onBack={goBack}
          onHome={goHome}
          onScan={() => navigate({ name: 'scan', bookId: book.book_id })}
          onEdit={(t) =>
            navigate({ name: 'scan', bookId: book.book_id, editing: t })
          }
          onDeleteTranscription={deleteTranscription}
          onToggleFavorite={toggleFavorite}
          onClearTranscriptions={() => clearTranscriptions(book.book_id)}
          onStatusChange={(s) => updateBookStatus(book.book_id, s)}
          onUpdateInfo={(info) => updateBookInfo(book.book_id, info)}
          onDeleteBook={() => {
            deleteBook(book.book_id);
            goBack();
          }}
        />
      )}

      {view.name === 'scan' && book && (
        <ScanEditor
          book={book}
          editing={view.editing}
          leaveGuardRef={leaveGuardRef}
          onCancel={goBack}
          onHome={goHome}
          onSave={(t) => {
            saveTranscription(t);
            // 저장한 뒤에는 쓰던 내용이 없으므로 확인 없이 책 상세로 돌아갑니다.
            leaveGuardRef.current = null;
            goBack();
          }}
        />
      )}

      {view.name === 'books' && (
        <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto grid max-w-md grid-cols-4 border-t border-stone-200 bg-white">
          {TABS.map(([key, icon, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex flex-col items-center py-2 text-xs ${
                tab === key ? 'font-semibold text-accent' : 'text-stone-400'
              }`}
            >
              <span className={`text-lg leading-none ${tab === key ? '' : 'opacity-40'}`}>
                {icon}
              </span>
              {label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
