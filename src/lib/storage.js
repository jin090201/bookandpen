// 브라우저 LocalStorage 기반 저장소 (서버 없음, 내 기기에만 저장)
import { dotDate } from './date.js';

const KEY = 'reading-notes:v1';

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function loadData() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { books: [], transcriptions: [] };
    const parsed = JSON.parse(raw);
    return {
      books: Array.isArray(parsed.books) ? parsed.books : [],
      transcriptions: Array.isArray(parsed.transcriptions)
        ? parsed.transcriptions
        : [],
    };
  } catch {
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
    throw new Error('JSON 파일이 아니에요.');
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
    throw new Error('북앤펜에서 내보낸 백업 파일이 아니에요.');
  }
  const books = parsed.books.filter(
    (b) => b && typeof b.book_id === 'string' && typeof b.title === 'string'
  );
  const transcriptions = parsed.transcriptions.filter(
    (t) =>
      t &&
      typeof t.transcription_id === 'string' &&
      typeof t.book_id === 'string' &&
      typeof t.content === 'string'
  );
  return { books, transcriptions };
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
  lines.push(
    `${book.author || '저자 미입력'} · 필사 ${list.length}개 · ${dotDate(new Date())} 내보냄`,
    ''
  );
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
    `${book.title}${book.author ? ` - ${book.author}` : ''}`,
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

export function downloadTextFile(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
// 필사 5,000자 / 메모 500자 / 사진 10MB (사진은 저장하지 않고 글자 인식에만 써요)
export const LIMITS = { content: 5000, memo: 500, photoMB: 10 };
export const countChars = (s) => [...(s || '')].length;

// ───────────────── 저장 공간·백업 알림 ─────────────────
const STORAGE_BYTES = 5 * 1024 * 1024; // LocalStorage 약 5MB (브라우저는 글자당 2바이트로 셈)
const BACKUP_KEY = 'reading-notes:backup:v1'; // 마지막으로 백업을 내려받은 시각
export const BACKUP_EVENT = 'bookandpen:backup';
export const BACKUP_REMIND_DAYS = 30;
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

export function markBackup() {
  try {
    localStorage.setItem(BACKUP_KEY, new Date().toISOString());
  } catch {
    /* 저장 실패는 무시 */
  }
  window.dispatchEvent(new Event(BACKUP_EVENT));
}

// 백업을 권하는 문구 목록 (필요 없으면 빈 배열)
export function backupReminders(data, lastBackup, usage) {
  const out = [];
  if (data.transcriptions.length > 0) {
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
  if (usage.pct >= SPACE_WARN_PCT) {
    out.push(`저장 공간을 ${usage.pct}% 사용 중이에요.`);
  }
  return out;
}

// ───────────────── 글자 크기·글꼴 설정 ─────────────────
import { useEffect, useState } from 'react';

const SETTINGS_KEY = 'reading-notes:settings:v1';
const SETTINGS_EVENT = 'bookandpen:settings';
const SANS_FALLBACK =
  "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

// pct = 화면 기본 글자 크기(html font-size). 보통 = 125% (20px)
export const SIZE_OPTIONS = [
  { id: 'sm', label: '작게', pct: 112.5 },
  { id: 'md', label: '보통', pct: 125 },
  { id: 'lg', label: '크게', pct: 137.5 },
  { id: 'xl', label: '아주 크게', pct: 150 },
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
