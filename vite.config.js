import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// CSP: 배포 빌드에만 meta로 넣습니다(개발 서버는 인라인 스크립트를 주입하므로 제외).
// jsdelivr는 OCR 엔진·언어 데이터, Google Fonts는 글꼴 용도입니다.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "connect-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const cspPlugin = () => ({
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: (html) =>
      html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
      ),
  },
});

// base './' : GitHub Pages(저장소 하위 경로)에서도 자산 경로가 깨지지 않도록 상대 경로 사용
export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin()],
});
