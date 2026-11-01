import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/popup.css';
import { PopupApp } from './App';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <PopupApp />
    </StrictMode>,
  );
}
