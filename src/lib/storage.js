// 브라우저 LocalStorage 기반 저장소 (서버 없음, 내 기기에만 저장)
import { dotDate } from './date.js';

const KEY = 'reading-notes:v1';
export const DATA_KEY = KEY; // 다른 탭의 변경을 알아차릴 때 어떤 키인지 비교하는 데 씁니다.

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// 저장된 값이 깨져 읽지 못하면 원본을 이 키에 따로 보관합니다(빈 데이터로 덮어써도 복구할 수 있게).
const CORRUPT_KEY = 'reading-notes:v1:corrupt';

export function hasCorruptCopy() {
  try {
    return localStorage.getItem(CORRUPT_KEY) !== null;
  } catch {
    return false;
  }
}

export function loadData() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    if (!raw) return { books: [], transcriptions: [] };
    const parsed = JSON.parse(raw);
    return {
      books: Array.isArray(parsed.books) ? parsed.books : [],
      transcriptions: Array.isArray(parsed.transcriptions)
        ? parsed.transcriptions
        : [],
    };
  } catch {
    // 이미 보관한 원본이 있으면 그것을 지키고, 없을 때만 새로 보관합니다.
    try {
      if (raw && localStorage.getItem(CORRUPT_KEY) === null) localStorage.setItem(CORRUPT_KEY, raw);
    } catch {
      /* 보관 실패는 무시 */
    }
    return { books: [], transcriptions: [] };
  }
}

// ---- 백업(JSON 내보내기/가져오기) ----
export function buildBackup(data) {
  return JSON.stringify(
    {
      app: 'bookandpen',
      version: 1,
      exported_at: new Date().toISOString(),
      books: data.books,
      transcriptions: data.transcriptions,
      goals: loadGoals(), // 올해 완독 목표 (연도: 권수)
    },
    null,
    2
  );
}

// 백업 파일 내용을 검증해 { books, transcriptions }로 반환 (형식이 다르면 예외)
export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('북앤펜 백업 파일(.json)만 가져올 수 있어요. 파일이 깨졌거나 다른 형식이에요.');
  }
  if (
    !parsed ||
    // 예전 이름(haneulhaneul, booksaegim, booknarae, penlove)으로 내보낸 백업도 그대로 불러올 수 있게 둠
    !['bookandpen', 'penlove', 'booknarae', 'booksaegim', 'haneulhaneul'].includes(
      parsed.app
    ) ||
    !Array.isArray(parsed.books) ||
    !Array.isArray(parsed.transcriptions)
  ) {
    throw new Error('북앤펜 백업 파일(.json)만 가져올 수 있어요. 다른 앱의 파일은 불러올 수 없어요.');
  }
  // 값이 빠졌거나 형식이 틀려도 앱이 깨지지 않도록, 없앨 수 없는 값은 고쳐서 받아들입니다.
  // 날짜가 없거나 읽을 수 없으면 백업을 내보낸 시각(그것도 없으면 지금)으로 채웁니다.
  // 없는 날짜(2026-02-30 등)는 Date가 다음 달로 넘겨 읽으므로, 앞쪽 연-월-일이 실제로 있는 날인지 따로 확인합니다.
  const isIso = (v) => {
    if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) return false;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (!m) return true;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
  };
  // 받은 시각은 앱이 만드는 형식(UTC, 예: 2026-11-25T03:00:00.000Z)으로 맞춥니다.
  // 형식이 섞이면(+09:00처럼 시간대가 붙은 값, 밀리초가 없는 값) 글자 비교로 하는 정렬이 실제 시각 순서와 어긋나기 때문입니다.
  const normIso = (v) => new Date(v).toISOString();
  const fallbackIso = isIso(parsed.exported_at) ? normIso(parsed.exported_at) : new Date().toISOString();
  const cut = (v, max) => (typeof v === 'string' ? [...v].slice(0, max).join('') : '');
  const STATUSES = ['WISH', 'READING', 'COMPLETED', 'STOPPED'];

  // 파일 안에 같은 id가 여러 번 있으면 맨 앞의 것만 받습니다(목록의 key가 겹치지 않게).
  const seenBooks = new Set();
  const seenTs = new Set();
  const books = parsed.books
    .filter((b) => b && typeof b.book_id === 'string' && typeof b.title === 'string')
    .filter((b) => !seenBooks.has(b.book_id) && !!seenBooks.add(b.book_id))
    .map((b) => {
      const fixed = {
        ...b,
        title: cut(b.title, LIMITS.title),
        author: cut(b.author, LIMITS.author),
        status: STATUSES.includes(b.status) ? b.status : 'READING',
        created_at: isIso(b.created_at) ? normIso(b.created_at) : fallbackIso,
      };
      if (b.publisher !== undefined) fixed.publisher = cut(b.publisher, LIMITS.publisher); // 출판사는 없어도 됩니다 (예전 백업)
      // 전체 페이지 수도 없어도 됩니다. 1~9999의 정수가 아니면 없는 것으로 받습니다.
      if (b.total_pages !== undefined) {
        const tp = cleanTotalPages(b.total_pages);
        if (tp) fixed.total_pages = tp;
        else delete fixed.total_pages;
      }
      if (b.completed_at !== undefined) {
        if (isIso(b.completed_at)) fixed.completed_at = normIso(b.completed_at);
        else delete fixed.completed_at;
      }
      return fixed;
    });
  const transcriptions = parsed.transcriptions
    .filter(
      (t) =>
        t &&
        typeof t.transcription_id === 'string' &&
        typeof t.book_id === 'string' &&
        typeof t.content === 'string' &&
        t.content.trim() !== '' // 본문이 비었거나 공백뿐이면 빈 카드가 생기므로 받지 않습니다
    )
    .filter((t) => !seenTs.has(t.transcription_id) && !!seenTs.add(t.transcription_id))
    .map((t) => {
      const pageNum = Number(t.page);
      const fixed = {
        ...t,
        page: Number.isInteger(pageNum) && pageNum > 0 ? pageNum : null,
        memo: cut(t.memo, LIMITS.memo),
        favorite: t.favorite === true,
        created_at: isIso(t.created_at) ? normIso(t.created_at) : fallbackIso,
      };
      // 종류는 알려진 값(책 문장·내 글)만 남기고 겹치는 값은 하나로 합칩니다. 배열이 아니면 없는 것으로 봅니다.
      if (Array.isArray(t.kinds)) {
        const known = Object.keys(KIND_LABEL);
        fixed.kinds = [...new Set(t.kinds.filter((k) => known.includes(k)))];
      } else if (t.kinds !== undefined) delete fixed.kinds;
      return fixed;
    });
  // 목표는 예전 백업에는 없으므로 없어도 됩니다. 백업을 만든 시각(exportedAt)은 없을 수 있어 null로 둡니다.
  return {
    books,
    transcriptions,
    goals: cleanGoals(parsed.goals),
    exportedAt: isIso(parsed.exported_at) ? normIso(parsed.exported_at) : null,
  };
}

// 가져오기 계획: 가져오면 무엇이 새로 들어오고 무엇을 건너뛰는지 셉니다(기록은 바꾸지 않습니다).
// 미리보기와 실제 가져오기가 같은 규칙을 쓰도록 한 곳에서 정합니다.
// 같은 id는 건너뛰고, 책이 없는 필사도 건너뜁니다. 이미 목표가 있는 해의 목표도 건너뜁니다.
export function planImport(data, { books, transcriptions, goals }) {
  const bookIds = new Set(data.books.map((b) => b.book_id));
  const tIds = new Set(data.transcriptions.map((t) => t.transcription_id));
  const newBooks = books.filter((b) => !bookIds.has(b.book_id));
  const allBookIds = new Set([...bookIds, ...newBooks.map((b) => b.book_id)]);
  const newTs = transcriptions.filter((t) => !tIds.has(t.transcription_id) && allBookIds.has(t.book_id));
  const have = loadGoals();
  const newGoals = Object.keys(cleanGoals(goals)).filter((y) => have[y] === undefined).length;
  return {
    newBooks,
    newTs,
    newGoals,
    skippedBooks: books.length - newBooks.length,
    skippedTs: transcriptions.length - newTs.length,
  };
}

// ───────────────── 올해 완독 목표 (연도별 권수, 백업에 포함) ─────────────────
const GOAL_KEY = 'reading-notes:goal:v1';
export const GOAL_MAX = 999;

// { "2026": 12 } 형태만 받아들입니다. 연도는 4자리, 권수는 1~999의 정수여야 합니다.
function cleanGoals(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [year, count] of Object.entries(v)) {
    const n = Number(count);
    if (/^\d{4}$/.test(year) && Number.isInteger(n) && n >= 1 && n <= GOAL_MAX) out[year] = n;
  }
  return out;
}

export function loadGoals() {
  try {
    return cleanGoals(JSON.parse(localStorage.getItem(GOAL_KEY) || '{}'));
  } catch {
    return {};
  }
}

function writeGoals(goals) {
  try {
    localStorage.setItem(GOAL_KEY, JSON.stringify(goals));
  } catch {
    /* 저장 실패는 무시 */
  }
}

// 그 해의 목표를 정합니다. 0이거나 비어 있으면 목표를 없앱니다. 바뀐 목표 전체를 돌려줍니다.
export function saveGoal(year, count) {
  const goals = loadGoals();
  const n = Number(count);
  if (Number.isInteger(n) && n >= 1 && n <= GOAL_MAX) goals[String(year)] = n;
  else delete goals[String(year)];
  writeGoals(goals);
  return goals;
}

// 가져오기: 이미 목표가 있는 해는 그대로 두고, 없는 해만 합칩니다. 새로 들어온 개수를 돌려줍니다.
export function mergeGoals(incoming) {
  const goals = loadGoals();
  let added = 0;
  for (const [year, count] of Object.entries(cleanGoals(incoming))) {
    if (goals[year] === undefined) {
      goals[year] = count;
      added += 1;
    }
  }
  if (added > 0) writeGoals(goals);
  return added;
}

export function clearGoals() {
  try {
    localStorage.removeItem(GOAL_KEY);
  } catch {
    /* 저장 실패는 무시 */
  }
}

// ---- 필사 종류: 책 문장 / 내 글 (함께 선택 가능, 선택 안 하면 미분류) ----
// 예전 기록(kind: quote|thought|summary)은 문장 → 책 문장, 생각·요약 → 내 글로 읽습니다.
export const KIND_LABEL = { quote: '책 문장', mine: '내 글' };
export const kindsOf = (t) => {
  if (Array.isArray(t.kinds)) return Object.keys(KIND_LABEL).filter((k) => t.kinds.includes(k));
  if (t.kind === 'thought' || t.kind === 'summary') return ['mine'];
  return ['quote'];
};
export const kindText = (t) => {
  const ks = kindsOf(t);
  return ks.length ? ks.map((k) => KIND_LABEL[k]).join(' + ') : '미분류';
};

// 종류로 거르기: all | quote | mine | none(미분류)
export const filterByKind = (list, kind) =>
  kind === 'all'
    ? list
    : list.filter((t) => {
        const ks = kindsOf(t);
        return kind === 'none' ? ks.length === 0 : ks.includes(kind);
      });

// 책 페이지 표기: '12페이지' (없으면 빈 글자). 표기는 이 한 곳에서만 정합니다.
export const pageText = (t) => (t.page ? `${t.page}페이지` : '');

// ---- 책별 내보내기 (마크다운 / 텍스트) ----

// 읽는 순서대로: 페이지 오름차순(페이지 없으면 뒤로), 같으면 작성순
function readingOrder(list) {
  return [...list].sort((a, b) => {
    const pa = a.page ?? Infinity;
    const pb = b.page ?? Infinity;
    if (pa !== pb) return pa < pb ? -1 : 1;
    return a.created_at.localeCompare(b.created_at);
  });
}

export function buildMarkdown(book, list) {
  const lines = [`# ${book.title}`, ''];
  const who = [book.author || '저자 미입력', book.publisher].filter(Boolean).join(' · ');
  lines.push(`${who} · 필사 ${list.length}개 · ${dotDate(new Date())} 내보냄`, '');
  for (const t of readingOrder(list)) {
    const head = [kindText(t)];
    if (t.page) head.push(pageText(t));
    head.push(dotDate(t.created_at));
    lines.push(`## ${head.join(' · ')}${t.favorite ? ' ★' : ''}`, '');
    lines.push(
      ...t.content.split('\n').map((l) => (l.trim() ? `> ${l}` : '>')),
      ''
    );
    if (t.memo) lines.push(`메모: ${t.memo}`, '');
  }
  return lines.join('\n');
}

export function buildPlainText(book, list) {
  const lines = [
    `${book.title}${book.author ? ` - ${book.author}` : ''}${book.publisher ? ` (${book.publisher})` : ''}`,
    `필사 ${list.length}개`,
    '',
  ];
  for (const t of readingOrder(list)) {
    lines.push(
      `[${kindText(t)}]${t.page ? ` ${pageText(t)}` : ''}${
        t.favorite ? ' ★' : ''
      }`,
      t.content
    );
    if (t.memo) lines.push(`메모: ${t.memo}`);
    lines.push('', '----', '');
  }
  return lines.join('\n');
}

// 파일 이름에 쓸 수 없는 글자 제거
export function safeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '').trim() || '북앤펜';
}

// 파일 만들기와 내려받기 시작에 오류가 없었으면 true, 있었으면 false를 돌려줍니다.
// 브라우저가 파일을 실제로 저장했는지는 웹에서 알 수 없으므로, true는 "내려받기를 시작했다"는 뜻입니다.
export function downloadTextFile(filename, text, mime = 'application/json') {
  try {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

// 저장 성공 여부를 반환 (용량 초과 등 실패 시 false)
export function saveData(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// ───────────────── 입력 한도 ─────────────────
// 필사 5,000자 / 메모 500자 / 책 제목 100자 / 저자 50자 / 사진 10MB (사진은 저장하지 않고 글자 인식에만 써요)
export const LIMITS = { content: 5000, memo: 500, title: 100, author: 50, publisher: 50, photoMB: 10, totalPages: 9999 };

// 책의 전체 페이지 수(선택): 1~9999의 정수만 받고, 그 밖의 값은 없는 것으로 봅니다.
export function cleanTotalPages(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= LIMITS.totalPages ? n : undefined;
}

// 책별 진행률. 전체 페이지 수가 없으면 null(막대를 보여 주지 않습니다).
// 읽은 쪽은 그 책 필사에 적은 가장 큰 페이지로 봅니다. 완독은 100%, 전체보다 큰 페이지가 있으면 100%로 맞추고 over로 알립니다.
// maxPage는 그 책 필사 중 가장 큰 페이지(없으면 0)입니다.
export function bookProgress(book, maxPage) {
  const total = cleanTotalPages(book.total_pages);
  if (!total) return null;
  const read = maxPage > 0 ? maxPage : 0;
  const over = read > total;
  const done = book.status === 'COMPLETED';
  const pct = done || over ? 100 : Math.round((read / total) * 100);
  return { total, read, pct, over, done, stopped: book.status === 'STOPPED' };
}

// 필사 목록에서 가장 큰 페이지(없으면 0)
export const maxPageOf = (list) => list.reduce((m, t) => (t.page > m ? t.page : m), 0);
export const countChars = (s) => [...(s || '')].length;
// 제목·저자 입력칸: 한도의 80%를 넘으면 글자 수를 보여 줍니다.
export const showLimitCount = (s, max) => countChars(s) >= max * 0.8;

// ───────────────── 저장 공간·백업 알림 ─────────────────
const STORAGE_BYTES = 5 * 1024 * 1024; // LocalStorage 약 5MB (브라우저는 글자당 2바이트로 셈)
const BACKUP_KEY = 'reading-notes:backup:v1'; // 마지막으로 백업을 내려받은 시각
const REMIND_KEY = 'reading-notes:remind:v1'; // 백업 알림 띠를 닫은 시각
export const BACKUP_EVENT = 'bookandpen:backup';
export const BACKUP_REMIND_DAYS = 30;
export const REMIND_SNOOZE_DAYS = 7;
export const SPACE_WARN_PCT = 80;

// 이 앱이 쓰고 있는 저장 공간: { bytes, pct }
export function storageUsage() {
  try {
    let chars = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      chars += k.length + (localStorage.getItem(k) || '').length;
    }
    const bytes = chars * 2;
    return { bytes, pct: Math.min(100, Math.round((bytes / STORAGE_BYTES) * 100)) };
  } catch {
    return { bytes: 0, pct: 0 };
  }
}

export function getLastBackup() {
  try {
    return localStorage.getItem(BACKUP_KEY) || null;
  } catch {
    return null;
  }
}

// 마지막 백업 시각을 기록합니다. 저장에 성공하면 true, 실패하면(저장 공간 부족 등) false를 돌려줍니다.
// 시각이 바뀐 것을 알리는 이벤트는 저장에 성공했을 때만 보냅니다.
export function markBackup() {
  try {
    localStorage.setItem(BACKUP_KEY, new Date().toISOString());
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(BACKUP_EVENT));
  return true;
}

export function getRemindClosedAt() {
  try {
    return localStorage.getItem(REMIND_KEY) || null;
  } catch {
    return null;
  }
}

export function closeBackupReminder() {
  try {
    localStorage.setItem(REMIND_KEY, new Date().toISOString());
  } catch {
    /* 저장 실패는 무시 */
  }
}

// ---- 최근 검색어 (책장 검색): 최대 5개, 최근 것이 맨 앞. 백업에는 포함하지 않습니다. ----
const SEARCH_KEY = 'reading-notes:search:v1';
const RECENT_MAX = 5;
const RECENT_LEN = 30; // 검색어 한 개의 최대 글자 수

export function loadRecentSearches() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEARCH_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((s) => typeof s === 'string' && s.trim())
      .map((s) => s.trim().slice(0, RECENT_LEN))
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function saveRecentSearches(list) {
  try {
    localStorage.setItem(SEARCH_KEY, JSON.stringify(list));
  } catch {
    /* 저장 실패는 무시 */
  }
}

// 같은 검색어는 맨 앞으로 옮기고, 5개를 넘으면 오래된 것부터 지웁니다. 새 목록을 돌려줍니다.
export function addRecentSearch(term) {
  const t = (term || '').trim().replace(/\s+/g, ' ').slice(0, RECENT_LEN);
  if (!t) return loadRecentSearches();
  const key = t.toLowerCase();
  const next = [t, ...loadRecentSearches().filter((s) => s.toLowerCase() !== key)].slice(
    0,
    RECENT_MAX
  );
  saveRecentSearches(next);
  return next;
}

export function removeRecentSearch(term) {
  const next = loadRecentSearches().filter((s) => s !== term);
  saveRecentSearches(next);
  return next;
}

export function clearRecentSearches() {
  try {
    localStorage.removeItem(SEARCH_KEY);
  } catch {
    /* 저장 실패는 무시 */
  }
}

// 백업을 권하는 문구: { backup: 닫으면 7일간 숨기는 문구, space: 항상 보이는 공간 경고 }
export function backupReminders(data, lastBackup, usage, closedAt) {
  const out = [];
  const snoozed =
    closedAt && Date.now() - new Date(closedAt).getTime() < REMIND_SNOOZE_DAYS * 86400000;
  if (data.transcriptions.length > 0 && !snoozed) {
    const oldest = data.transcriptions.reduce(
      (min, t) => (t.created_at < min ? t.created_at : min),
      data.transcriptions[0].created_at
    );
    const baseline = lastBackup || oldest;
    const days = Math.floor((Date.now() - new Date(baseline).getTime()) / 86400000);
    if (days >= BACKUP_REMIND_DAYS) {
      out.push(
        lastBackup
          ? `마지막 백업 후 ${days}일이 지났어요.`
          : '아직 백업한 적이 없어요.'
      );
    }
  }
  const space = usage.pct >= SPACE_WARN_PCT ? [`저장 공간을 ${usage.pct}% 사용 중이에요.`] : [];
  return { backup: out, space };
}

// ───────────────── 글자 크기·글꼴 설정 ─────────────────
import { useEffect, useState } from 'react';

const SETTINGS_KEY = 'reading-notes:settings:v1';
const SETTINGS_EVENT = 'bookandpen:settings';
const SANS_FALLBACK =
  "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

// pct = 화면 기본 글자 크기(html font-size). 작게 16px · 보통 18px · 크게 20px · 아주 크게 22px입니다.
export const SIZE_OPTIONS = [
  { id: 'sm', label: '작게', pct: 100 },
  { id: 'md', label: '보통', pct: 112.5 },
  { id: 'lg', label: '크게', pct: 125 },
  { id: 'xl', label: '아주 크게', pct: 137.5 },
];

// scale = 폰트마다 달라 보이는 크기를 맞추는 보정값 (손글씨는 작아 보여서 키움)
export const FONT_OPTIONS = {
  sans: { label: '고딕', name: 'Noto Sans KR', css: `'Noto Sans KR', ${SANS_FALLBACK}`, scale: 1 },
  serif: { label: '명조', name: 'Noto Serif KR', css: "'Noto Serif KR', Georgia, serif", scale: 1 },
  batang: { label: '고운바탕', name: 'Gowun Batang', css: "'Gowun Batang', 'Noto Serif KR', serif", scale: 1 },
  dodum: { label: '고운돋움', name: 'Gowun Dodum', css: `'Gowun Dodum', ${SANS_FALLBACK}`, scale: 1 },
  pen: { label: '나눔손글씨 펜', name: 'Nanum Pen Script', css: "'Nanum Pen Script', cursive", scale: 1.25 },
};
export const BODY_FONT_IDS = ['sans', 'serif', 'batang', 'dodum', 'pen'];
export const UI_FONT_IDS = ['sans', 'dodum', 'batang'];

// ───────────── 화면 구성 편집: 색 테마 · 포인트 색 · 표지 ─────────────
export const THEME_OPTIONS = [
  { id: 'light', label: '라이트' },
  { id: 'dark', label: '다크' },
  { id: 'sepia', label: '세피아' },
  { id: 'auto', label: '기기 설정' },
];

// 색 값은 'R G B' 문자열 (Tailwind의 rgb(var(--x) / 투명도) 형식)
const STONE_KEYS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const THEMES = {
  light: {
    dark: false,
    white: '255 255 255',
    stone: ['250 250 249', '245 245 244', '231 229 228', '214 211 209', '168 162 158', '120 113 108', '87 83 78', '68 64 60', '41 37 36', '28 25 23'],
  },
  dark: {
    dark: true,
    white: '38 36 34',
    stone: ['28 27 26', '42 40 38', '58 55 52', '82 78 74', '130 125 119', '158 153 147', '184 179 173', '207 202 196', '231 229 228', '240 238 234'],
  },
  sepia: {
    dark: false,
    white: '251 246 232',
    stone: ['244 236 216', '238 228 204', '226 213 184', '208 192 160', '160 142 116', '128 110 88', '104 88 68', '84 70 52', '74 59 42', '58 46 32'],
  },
};

// 포인트 색: 밝은 화면용(light)과 어두운 화면용(dark) 값, 그 위에 올릴 글자색(on)
export const ACCENT_OPTIONS = [
  { id: 'ink', label: '먹색', swatch: '#292524', light: '41 37 36', dark: '231 229 228', sepia: '74 59 42' },
  { id: 'violet', label: '보라', swatch: '#6d3fc0', light: '109 63 192', dark: '167 139 250' },
  { id: 'blue', label: '파랑', swatch: '#2563eb', light: '37 99 235', dark: '96 165 250' },
];

export const COVER_OPTIONS = [
  { id: 'blue', label: '파랑', hue: 212 },
  { id: 'purple', label: '보라', hue: 265 },
  { id: 'pink', label: '핑크', hue: 335 },
  { id: 'multi', label: '책마다 다르게', short: '책마다' },
];
const MULTI_HUES = [38, 150, 200, 350, 265, 25];
// 파스텔 밝기 3단계 (1 = 연하게, 3 = 조금 진하게)
const SHADE_LIGHTNESS = [91, 83, 75];
export const SHADE_OPTIONS = [
  { id: 'auto', label: '자동 순환', short: '자동' },
  { id: '1', label: '1단계 연하게', short: '1단계' },
  { id: '2', label: '2단계', short: '2단계' },
  { id: '3', label: '3단계 진하게', short: '3단계' },
];
// 표지에 보이는 글자: 제목 전체 / 제목 + 저자 / 없음(없음이면 표지 아래에 제목이 보여요)
export const LETTER_OPTIONS = [
  { id: 'title', label: '제목 전체' },
  { id: 'author', label: '제목 + 저자' },
  { id: 'none', label: '없음' },
];
export const COLS_OPTIONS = [
  { id: 2, label: '2열' },
  { id: 3, label: '3열' },
];
export const ROUND_OPTIONS = [
  { id: 4, label: '각지게' },
  { id: 12, label: '둥글게' },
];

export const DEFAULT_SETTINGS = {
  size: 'md',
  uiFont: 'sans',
  bodyFont: 'serif',
  theme: 'light',
  accent: 'ink',
  cover: 'multi',
  shade: 'auto',
  letter: 'title',
  cols: 3,
  round: 12,
  showDot: true,
  showBadge: true,
  view: 'cover', // 책장 보기: cover(표지형) | list(목록형)
};

const has = (list, id) => list.some((o) => o.id === id);

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    const s = { ...DEFAULT_SETTINGS, ...raw };
    const D = DEFAULT_SETTINGS;
    if (!has(SIZE_OPTIONS, s.size)) s.size = D.size;
    if (!FONT_OPTIONS[s.uiFont]) s.uiFont = D.uiFont;
    if (!FONT_OPTIONS[s.bodyFont]) s.bodyFont = D.bodyFont;
    if (!has(THEME_OPTIONS, s.theme)) s.theme = D.theme;
    if (!has(ACCENT_OPTIONS, s.accent)) s.accent = D.accent;
    if (!has(COVER_OPTIONS, s.cover)) s.cover = D.cover;
    if (!has(SHADE_OPTIONS, s.shade)) s.shade = D.shade;
    // 예전 값(1·2 = 첫 글자·앞 2글자, 0 = 없음)은 새 방식으로 바꿉니다
    if (s.letter === 0) s.letter = 'none';
    if (!has(LETTER_OPTIONS, s.letter)) s.letter = D.letter;
    if (!has(COLS_OPTIONS, s.cols)) s.cols = D.cols;
    if (!has(ROUND_OPTIONS, s.round)) s.round = D.round;
    s.showDot = s.showDot !== false;
    s.showBadge = s.showBadge !== false;
    if (s.view !== 'list') s.view = 'cover'; // 값이 없는 예전 설정은 표지형으로 읽습니다
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* 저장 실패해도 화면 적용은 계속 */
  }
}

// '기기 설정'이면 폰이 다크 모드인지 보고 라이트/다크 중 하나로 정합니다
function resolveTheme(theme) {
  if (theme !== 'auto') return theme;
  const dark =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? 'dark' : 'light';
}

export function applySettings(settings) {
  const root = document.documentElement;
  const size = SIZE_OPTIONS.find((o) => o.id === settings.size) || SIZE_OPTIONS[1];
  root.style.fontSize = `${size.pct}%`;
  root.style.setProperty('--font-ui', FONT_OPTIONS[settings.uiFont].css);
  root.style.setProperty('--font-body', FONT_OPTIONS[settings.bodyFont].css);
  root.style.setProperty('--body-scale', String(FONT_OPTIONS[settings.bodyFont].scale));

  const themeId = resolveTheme(settings.theme);
  const theme = THEMES[themeId];
  root.style.setProperty('--c-white', theme.white);
  STONE_KEYS.forEach((k, i) => root.style.setProperty(`--c-stone-${k}`, theme.stone[i]));
  const accent = ACCENT_OPTIONS.find((o) => o.id === settings.accent) || ACCENT_OPTIONS[0];
  const accentRgb = theme.dark ? accent.dark : themeId === 'sepia' && accent.sepia ? accent.sepia : accent.light;
  root.style.setProperty('--accent', accentRgb);
  // 표지의 '회색 점': 진한 회색 (세피아는 갈색 톤)
  root.style.setProperty('--dot', themeId === 'sepia' ? '107 90 68' : '87 83 78');
  root.style.setProperty('--on-accent', theme.dark ? theme.stone[0] : themeId === 'sepia' ? theme.stone[0] : '255 255 255');
  root.style.colorScheme = theme.dark ? 'dark' : 'light';
  root.dataset.theme = themeId;
}

// 표지 색: 계열(파랑·보라·핑크·책마다 다르게) + 밝기 단계(자동 순환·1~3단계)
// rank = 책 등록 순서(0부터). 자동 순환일 때 1→2→3단계를 돌아가며 씁니다.
export function coverColors(settings, title, rank) {
  let hue;
  if (settings.cover === 'multi') {
    let h = 0;
    for (const ch of title) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    hue = MULTI_HUES[h % MULTI_HUES.length];
  } else {
    hue = (COVER_OPTIONS.find((o) => o.id === settings.cover) || COVER_OPTIONS[0]).hue;
  }
  const step = settings.shade === 'auto' ? rank % 3 : Number(settings.shade) - 1;
  return {
    background: `hsl(${hue} 75% ${SHADE_LIGHTNESS[step]}%)`,
    color: `hsl(${hue + 2} 55% 26%)`,
  };
}

// 설정이 바뀌면 책장 같은 다른 화면도 바로 다시 그려지도록 하는 훅
export function useSettings() {
  const [settings, setSettings] = useState(loadSettings);
  useEffect(() => {
    const sync = () => setSettings(loadSettings());
    window.addEventListener(SETTINGS_EVENT, sync);
    return () => window.removeEventListener(SETTINGS_EVENT, sync);
  }, []);
  return settings;
}

export function updateSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  saveSettings(next);
  applySettings(next);
  window.dispatchEvent(new Event(SETTINGS_EVENT));
  return next;
}

// 기기 다크 모드가 바뀌면 '기기 설정' 테마를 다시 적용
if (typeof window !== 'undefined' && window.matchMedia) {
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener?.('change', () => {
      const s = loadSettings();
      if (s.theme === 'auto') applySettings(s);
    });
}
