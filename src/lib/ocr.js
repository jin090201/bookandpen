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

// 큰 사진은 줄여서 인식 속도를 높임 (긴 변 기준 maxSide px)
async function prepareImage(file, maxSide = 1800) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await createImageBitmap(file);
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('이미지 변환 실패'))),
      'image/png'
    );
  });
}

/**
 * @param {File} file 촬영/업로드한 이미지
 * @param {(p:{status:string, progress:number})=>void} onProgress
 * @returns {Promise<string>} 인식된 원문 텍스트
 */
export async function recognizeImage(file, onProgress) {
  currentProgress = onProgress;
  try {
    const blob = await prepareImage(file);
    const worker = await getWorker();
    const { data } = await worker.recognize(blob);
    return data.text || '';
  } finally {
    currentProgress = null;
  }
}
