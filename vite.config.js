import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' : GitHub Pages(저장소 하위 경로)에서도 자산 경로가 깨지지 않도록 상대 경로 사용
export default defineConfig({
  base: './',
  plugins: [react()],
});
