import { createWorker } from 'tesseract.js';

// 브라우저 내 OCR (Tesseract.js, 한국어+영어)
// 최초 1회 언어 데이터를 내려받고 이후에는 브라우저 캐시를 사용합니다.
let workerPromise = null;
let currentProgress = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('kor+eng', 1, {
      logger: (m) => {
        if (currentProgress) currentProgress(m);
      },
    }).catch((err) => {
      workerPromise = null; // 실패 시 다음 시도에서 재생성
      throw err;
    });
  }
  return workerPromise;
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
  try {
    let blob;
    try {
      blob = await prepareImage(file, crop);
    } catch {
      // 사진을 열 수 없는 경우를 네트워크 오류와 구분하려고 표시를 붙입니다.
      const err = new Error('이미지 변환 실패');
      err.code = 'IMAGE';
      throw err;
    }
    const worker = await getWorker();
    const { data } = await worker.recognize(blob);
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
    currentProgress = null;
  }
}
