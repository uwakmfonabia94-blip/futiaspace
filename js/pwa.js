/**
 * FutiaSpace — js/pwa.js
 *
 * Progressive Web App layer:
 *
 *  ① Service Worker registration
 *     – Registers sw.js on first load
 *     – Detects when a new SW is waiting to activate
 *     – Shows a custom "Update available" toast (not a browser popup)
 *     – Clicking the toast posts SKIP_WAITING → new SW activates → page reloads
 *
 *  ② Install prompt  (Add to Home Screen)
 *     – Catches the beforeinstallprompt event
 *     – Shows a custom bottom banner (not the browser's default UI)
 *     – "Install" → triggers the deferred prompt
 *     – Dismiss (X) → hides the banner and stores a flag so it never
 *       appears again in this browser session (not persisted — reappears
 *       after 24 hours if the user still hasn't installed)
 *
 *  Called once from router.js on DOMContentLoaded.
 */

import { showToast } from './utils.js';


// ════════════════════════════════════════════════════════════════
// ENTRY POINT
// ════════════════════════════════════════════════════════════════

export function initPWA() {
  _registerServiceWorker();
  _initInstallPrompt();
}


// ════════════════════════════════════════════════════════════════
// 1.  SERVICE WORKER
// ════════════════════════════════════════════════════════════════

async function _registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    // ── Detect update waiting immediately (page was hard-refreshed) ─
    if (registration.waiting) {
      _showUpdateToast(registration.waiting);
    }

    // ── Detect update found after registration ───────────────────
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        // 'installed' state + a controller means there's already an
        // active SW — this is the new one waiting to take over
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          _showUpdateToast(newWorker);
        }
      });
    });

    // ── Listen for SW controller change (after SKIP_WAITING) ────────
    // When the new SW activates it fires controllerchange → we reload
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

  } catch (err) {
    // SW registration failure is non-critical — app still works
    console.warn('[pwa] SW registration failed:', err);
  }
}

/**
 * Show the "FutiaSpace just got better — tap to update" toast.
 * Clicking it tells the waiting SW to skip waiting and take over.
 * The controllerchange listener above then reloads the page.
 * @param {ServiceWorker} waitingWorker
 */
function _showUpdateToast(waitingWorker) {
  showToast(
    'FutiaSpace just got better! Tap to update 🚀',
    'update',
    0,  // duration 0 = stays until clicked
    () => {
      if (waitingWorker) {
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      }
    }
  );
}


// ════════════════════════════════════════════════════════════════
// 2.  INSTALL PROMPT  (Add to Home Screen)
// ════════════════════════════════════════════════════════════════

let _deferredInstallPrompt = null;
const INSTALL_DISMISSED_KEY = 'futia_install_dismissed';

function _initInstallPrompt() {
  // beforeinstallprompt fires when the browser decides the PWA is
  // installable. We prevent the default mini-infobar and handle it ourselves.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredInstallPrompt = e;

    // Don't show if user dismissed it this session
    if (sessionStorage.getItem(INSTALL_DISMISSED_KEY)) return;

    // Small delay — let the page settle before showing the banner
    setTimeout(_showInstallPrompt, 2500);
  });

  // Hide the prompt if the user installs via another path
  window.addEventListener('appinstalled', () => {
    _hideInstallPrompt();
    _deferredInstallPrompt = null;
  });

  _wireInstallButtons();
}

function _showInstallPrompt() {
  const prompt = document.getElementById('install-prompt');
  if (!prompt) return;
  prompt.classList.remove('hidden');
  if (window.lucide) {
    window.lucide.createIcons({ icons: window.lucide.icons, rootElement: prompt });
  }
}

function _hideInstallPrompt() {
  const prompt = document.getElementById('install-prompt');
  if (!prompt) return;
  prompt.classList.add('prompt-exit');
  prompt.addEventListener('animationend', () => {
    prompt.classList.add('hidden');
    prompt.classList.remove('prompt-exit');
  }, { once: true });
  setTimeout(() => {
    prompt.classList.add('hidden');
    prompt.classList.remove('prompt-exit');
  }, 500);
}

function _wireInstallButtons() {
  const installBtn = document.getElementById('btn-install-pwa');
  const dismissBtn = document.getElementById('btn-dismiss-install');

  installBtn?.addEventListener('click', async () => {
    if (!_deferredInstallPrompt) return;

    _hideInstallPrompt();

    try {
      await _deferredInstallPrompt.prompt();
      const { outcome } = await _deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        showToast('FutiaSpace installed! Find it on your home screen.', 'success', 4000);
      }
    } catch (err) {
      console.warn('[pwa] install prompt error:', err);
    } finally {
      _deferredInstallPrompt = null;
    }
  });

  dismissBtn?.addEventListener('click', () => {
    sessionStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    _hideInstallPrompt();
  });
}