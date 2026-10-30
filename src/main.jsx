import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { applySettings, loadSettings } from './lib/storage.js';

applySettings(loadSettings());

// 브라우저가 저장 공간이 부족할 때 기록을 임의로 지우지 않도록 요청 (지원하지 않으면 무시)
try {
  navigator.storage?.persist?.();
} catch {
  /* 무시 */
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
