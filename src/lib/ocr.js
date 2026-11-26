import { createWorker } from 'tesseract.js';

// 브라우저 내 OCR (Tesseract.js, 한국어+영어)
// 최초 1회 언어 데이터를 내려받고 이후에는 브라우저 캐시를 사용합니다.
let workerPromise = null;
let currentProgress = null;
let activeCancel = null; // 지금 진행 중인 인식을 멈추는 함수(없으면 null)

function getWorker() {
  if (!workerPromise) {
    const p = createWorker('kor+eng', 1, {
      logger: (m) => {
        if (currentProgress) currentProgress(m);
      },
    }).catch((err) => {
      // 실패하면 다음 시도에서 다시 만듭니다. 그 사이 새로 만든 워커를 지우지 않도록 내 것일 때만 비웁니다.
      if (workerPromise === p) workerPromise = null;
      throw err;
    });
    workerPromise = p;
  }
  return workerPromise;
}

// 진행 중인 인식을 멈춥니다. 엔진(워커)을 끄므로 바로 멈추고, 다음 인식 때 엔진을 새로 켭니다(언어 데이터는 캐시를 씁니다).
// 진행 중인 인식이 없으면 아무 일도 하지 않습니다. 멈춘 인식은 code가 'CANCELLED'인 오류로 끝납니다.
export function cancelRecognition() {
  if (activeCancel) activeCancel();
}

// 흑백으로 바꾸고 밝기 범위를 늘립니다. 종이 뒷면의 비친 글자나 옅은 그림자처럼 본문보다 옅은 부분이 배경에 가까워집니다.
// 가장 어두운 1%를 검정, 밝은 쪽 75% 지점을 흰색으로 삼으며, 원래 대비가 너무 낮은 사진은 건드리지 않습니다.
const BLACK_PCT = 0.01;
const WHITE_PCT = 0.75;
const MIN_RANGE = 40;

function enhanceContrast(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const total = w * h;

  const gray = new Uint8ClampedArray(total);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    const g = (px[p] * 299 + px[p + 1] * 587 + px[p + 2] * 114) / 1000;
    gray[i] = g;
    hist[gray[i]]++;
  }

  const at = (ratio) => {
    const target = total * ratio;
    let sum = 0;
    for (let v = 0; v < 256; v++) {
      sum += hist[v];
      if (sum >= target) return v;
    }
    return 255;
  };
  const black = at(BLACK_PCT);
  const white = at(WHITE_PCT);
  if (white - black < MIN_RANGE) return;

  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    lut[v] = ((v - black) / (white - black)) * 255;
  }
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    const g = lut[gray[i]];
    px[p] = g;
    px[p + 1] = g;
    px[p + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
}

// 큰 사진은 긴 변 2800px까지만 줄입니다. 글자가 작은 페이지의 인식률을 위해 해상도를 유지하며, 작은 사진은 키우지 않습니다.
// crop({ x, y, w, h }, 사진 크기에 대한 비율)이 있으면 그 부분만 잘라 쓰며, 줄이는 비율은 자르기 전 사진 전체를 기준으로 정합니다.
// (같은 사진에서 글자 크기가 달라지지 않게 하려는 것으로, 글자가 지나치게 커져도 인식이 나빠지는 것을 확인했습니다.)
async function prepareImage(file, crop = null, maxSide = 2800) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await createImageBitmap(file);
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const sx = crop ? Math.round(crop.x * bitmap.width) : 0;
  const sy = crop ? Math.round(crop.y * bitmap.height) : 0;
  const sw = crop ? Math.max(1, Math.round(crop.w * bitmap.width)) : bitmap.width;
  const sh = crop ? Math.max(1, Math.round(crop.h * bitmap.height)) : bitmap.height;
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
  bitmap.close?.();
  enhanceContrast(ctx, w, h);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('이미지 변환 실패'))),
      'image/png'
    );
  });
}

// 필사 화면에 보여 줄 미리보기 이미지입니다. 인식에 쓴 부분(crop)만 잘라 긴 변 1200px 이하로 줄이며, 인식용과 달리 흑백 보정은 하지 않습니다.
export async function makePreview(file, crop = null, maxSide = 1200) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await createImageBitmap(file);
  }
  const sx = crop ? Math.round(crop.x * bitmap.width) : 0;
  const sy = crop ? Math.round(crop.y * bitmap.height) : 0;
  const sw = crop ? Math.max(1, Math.round(crop.w * bitmap.width)) : bitmap.width;
  const sh = crop ? Math.max(1, Math.round(crop.h * bitmap.height)) : bitmap.height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('미리보기 변환 실패'))),
      'image/jpeg',
      0.85
    );
  });
}

// 인식 신뢰도(0~100)가 이 값 미만인 단어를 "확인해 볼 단어"로 돌려줍니다.
// 시험 결과, 영문이 기호·숫자로 깨진 오류는 대부분 70 미만이었고 맞게 읽힌 단어는 대부분 87 이상이었습니다.
// 반면 글자 하나가 비슷한 글자로 바뀐 오류(도구→노구 등)는 엔진이 높은 신뢰도로 내놓아 잡지 못합니다.
const DOUBT_BELOW = 70;

/**
 * @param {File} file 촬영/업로드한 이미지
 * @param {(p:{status:string, progress:number})=>void} onProgress
 * @param {{x:number, y:number, w:number, h:number}|null} [crop] 인식할 영역(사진 크기에 대한 비율), 없으면 사진 전체
 * @returns {Promise<{text:string, doubtful:string[]}>} 인식된 원문 텍스트와 신뢰도가 낮은 단어 목록
 */
export async function recognizeImage(file, onProgress, crop = null) {
  currentProgress = onProgress;

  // 취소 처리: 멈추면 이 약속이 'CANCELLED' 오류로 끝나서, 기다리던 단계를 모두 빠져나옵니다.
  let cancelled = false;
  let workerUsed = false; // 엔진을 쓰기 시작한 뒤에만 엔진을 끕니다(사진 준비 중에 취소하면 엔진은 그대로 둠)
  let rejectCancelled;
  const cancelledSignal = new Promise((_, reject) => {
    rejectCancelled = reject;
  });
  cancelledSignal.catch(() => {}); // 취소하지 않았을 때 처리되지 않은 오류로 남지 않게 합니다.
  const myCancel = () => {
    if (cancelled) return;
    cancelled = true;
    if (workerUsed && workerPromise) {
      const p = workerPromise;
      workerPromise = null; // 다음 인식은 새 엔진으로 시작합니다.
      p.then((w) => w.terminate()).catch(() => {}); // 아직 만드는 중이었다면 다 만든 뒤 바로 끕니다.
    }
    const err = new Error('인식 취소');
    err.code = 'CANCELLED';
    rejectCancelled(err);
  };
  activeCancel = myCancel;

  try {
    let blob;
    try {
      blob = await Promise.race([prepareImage(file, crop), cancelledSignal]);
    } catch (e) {
      if (e?.code === 'CANCELLED') throw e;
      // 사진을 열 수 없는 경우를 네트워크 오류와 구분하려고 표시를 붙입니다.
      const err = new Error('이미지 변환 실패');
      err.code = 'IMAGE';
      throw err;
    }
    workerUsed = true;
    const worker = await Promise.race([getWorker(), cancelledSignal]);
    const job = worker.recognize(blob);
    job.catch(() => {}); // 엔진을 끄면 이 작업이 오류로 끝날 수 있어, 취소 때 처리되지 않은 오류로 남지 않게 합니다.
    const { data } = await Promise.race([job, cancelledSignal]);
    const doubtful = [];
    for (const w of data.words || []) {
      const t = (w.text || '').trim();
      if (!t || w.confidence >= DOUBT_BELOW || doubtful.includes(t)) continue;
      // 글자·숫자가 없는 기호나 한 글자짜리 한글은 본문에서 찾아도 어디인지 알 수 없어 뺍니다.
      if (!/[\p{L}\p{N}]/u.test(t) || /^[가-힣]$/.test(t)) continue;
      doubtful.push(t);
    }
    return { text: data.text || '', doubtful };
  } finally {
    // 그 사이 다른 인식이 시작됐다면 그쪽의 진행 표시와 취소 함수를 지우지 않습니다.
    if (currentProgress === onProgress) currentProgress = null;
    if (activeCancel === myCancel) activeCancel = null;
  }
}
