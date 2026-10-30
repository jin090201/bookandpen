const c = (name) => `rgb(var(${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        body: ['var(--font-body)'],
      },
      // 색을 CSS 변수로 연결 → 설정의 색 테마(라이트·다크·세피아)에 따라 한꺼번에 바뀌어요
      colors: {
        white: c('--c-white'),
        accent: c('--accent'),
        dot: c('--dot'),
        'on-accent': c('--on-accent'),
        stone: {
          50: c('--c-stone-50'),
          100: c('--c-stone-100'),
          200: c('--c-stone-200'),
          300: c('--c-stone-300'),
          400: c('--c-stone-400'),
          500: c('--c-stone-500'),
          600: c('--c-stone-600'),
          700: c('--c-stone-700'),
          800: c('--c-stone-800'),
          900: c('--c-stone-900'),
        },
      },
    },
  },
  plugins: [],
};
