import { createRoot } from 'react-dom/client';
import panelCss from '../styles/panel.css?inline';
import { FloatingPanel } from './FloatingPanel';
import { installCopyCapture } from '../clipboard/capture';
import { addHistory, markClipboardSeen, setCurrentSnippet } from '../storage';
import { initFocusTracker } from '../insertion';
import { installMessageBridge } from './messaging';

const HOST_ID = 'clipboard-assistant-host';

function mountPanel(): void {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;

  // Shadow DOM keeps the panel's Tailwind reset and styles away from the host page.
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = panelCss;
  shadow.appendChild(style);

  const container = document.createElement('div');
  container.className = 'ca-root';
  shadow.appendChild(container);

  document.documentElement.appendChild(host);
  createRoot(container).render(<FloatingPanel origin={window.location.origin} />);
}

initFocusTracker();
installMessageBridge();
installCopyCapture((text) => {
  void addHistory(text, 'copy');
  void setCurrentSnippet(text, 'copy');
  // The copy event means the system clipboard now holds this text.
  void markClipboardSeen(text);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountPanel, { once: true });
} else {
  mountPanel();
}
