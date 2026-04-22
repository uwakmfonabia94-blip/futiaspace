/**
 * FutiaSpace — js/onesignal.js
 *
 * OneSignal Web Push v16 integration.
 *
 * Flow:
 *  1. initOneSignal() is called by router.js after SIGNED_IN
 *  2. Initialises the OneSignal SDK with the app ID
 *  3. Checks if push is supported and permission not yet decided
 *  4. Shows a custom in-app push prompt (not the browser's native popup)
 *     unless the user already allowed, denied, or previously skipped
 *  5. On "Allow" → calls OneSignal.Notifications.requestPermission()
 *     which triggers the real browser permission dialog
 *  6. On success → links the OneSignal player ID to the current user's
 *     Supabase profile so the server can target them specifically (V2)
 *  7. "Skip" → stores a flag in localStorage so the prompt never shows again
 *
 * ─── SETUP ────────────────────────────────────────────────────
 *  1. Create a free account at https://onesignal.com
 *  2. Add a new app → Web Push → set your Vercel domain
 *  3. Copy the App ID → paste as ONESIGNAL_APP_ID below
 *  4. Download the OneSignalSDKWorker.js they provide and place it
 *     in the ROOT of your project (same level as index.html).
 *     Vercel will serve it at /OneSignalSDKWorker.js automatically.
 * ──────────────────────────────────────────────────────────────
 */

import { supabase }          from './supabase.js';
import { getCurrentProfile } from './router.js';


// ── Replace with your real OneSignal App ID ────────────────────
const ONESIGNAL_APP_ID = '3c72c354-3caf-4967-8e5c-8e67b7698603';
// ──────────────────────────────────────────────────────────────

const PROMPT_SKIPPED_KEY  = 'futia_push_skipped';
const PROMPT_SHOWN_KEY    = 'futia_push_prompted';

let _initialised = false;


// ════════════════════════════════════════════════════════════════
// 1.  INIT  — called by router.js once after SIGNED_IN
// ════════════════════════════════════════════════════════════════

/**
 * Initialise OneSignal and decide whether to show the push prompt.
 * Safe to call multiple times — only runs once per session.
 */
export async function initOneSignal() {
  if (_initialised) return;
  _initialised = true;

  // OneSignal SDK is loaded via CDN script tag in index.html (defer + async).
  // Wait for it to be available in the global scope.
  if (!window.OneSignal) {
    await _waitForOneSignal(5000);
  }

  if (!window.OneSignal) {
    // SDK failed to load (ad blocker, slow connection etc.) — silent fail
    console.warn('[onesignal] SDK not available');
    _wirePushPromptSkipOnly();
    return;
  }

  try {
    await window.OneSignal.init({
      appId             : ONESIGNAL_APP_ID,
      // Do NOT auto-prompt — we show our own custom prompt first
      autoRegister      : false,
      autoResubscribe   : true,
      notifyButton      : { enable: false },
      welcomeNotification: { disable: true },
      serviceWorkerParam : { scope: '/' },
    });

    // Check current permission state
    const permission = window.OneSignal.Notifications?.permission;
    // permission: 'default' | 'granted' | 'denied'

    if (permission === 'granted') {
      // Already subscribed — link user ID silently in background
      _linkUserToOneSignal();
      _hidePushPrompt();
      return;
    }

    if (permission === 'denied') {
      // User blocked push in browser settings — nothing we can do
      _hidePushPrompt();
      return;
    }

    // 'default' = not yet decided
    // Show our custom prompt unless they already skipped it
    const skipped = localStorage.getItem(PROMPT_SKIPPED_KEY);
    if (skipped) {
      _hidePushPrompt();
      return;
    }

    // Show prompt after a short delay so the user has settled into the app
    setTimeout(() => _showPushPrompt(), 3000);

  } catch (err) {
    console.error('[onesignal] init error:', err);
    _hidePushPrompt();
  }
}


// ════════════════════════════════════════════════════════════════
// 2.  PUSH PROMPT  — custom in-app banner (not browser native)
// ════════════════════════════════════════════════════════════════

function _showPushPrompt() {
  const prompt = document.getElementById('push-prompt');
  if (!prompt) return;

  // Don't show if install prompt is visible (avoid overlap)
  const installPrompt = document.getElementById('install-prompt');
  if (installPrompt && !installPrompt.classList.contains('hidden')) {
    // Delay push prompt until install prompt resolves
    setTimeout(() => _showPushPrompt(), 5000);
    return;
  }

  prompt.classList.remove('hidden');
  _wirePushPromptButtons();
  if (window.lucide) {
    window.lucide.createIcons({ icons: window.lucide.icons, rootElement: prompt });
  }
}

function _hidePushPrompt() {
  const prompt = document.getElementById('push-prompt');
  if (prompt) prompt.classList.add('hidden');
}

function _wirePushPromptButtons() {
  const allowBtn = document.getElementById('btn-allow-push');
  const skipBtn  = document.getElementById('btn-skip-push');

  if (allowBtn && !allowBtn.dataset.wired) {
    allowBtn.dataset.wired = '1';
    allowBtn.addEventListener('click', _handleAllowPush);
  }

  if (skipBtn && !skipBtn.dataset.wired) {
    skipBtn.dataset.wired = '1';
    skipBtn.addEventListener('click', _handleSkipPush);
  }
}

/** Wire skip-only when SDK unavailable — still hide the prompt properly. */
function _wirePushPromptSkipOnly() {
  const prompt = document.getElementById('push-prompt');
  if (!prompt) return;

  const skipped = localStorage.getItem(PROMPT_SKIPPED_KEY);
  if (skipped) return;

  setTimeout(() => {
    prompt.classList.remove('hidden');
    const skipBtn = document.getElementById('btn-skip-push');
    const allowBtn = document.getElementById('btn-allow-push');
    if (skipBtn && !skipBtn.dataset.wired) {
      skipBtn.dataset.wired = '1';
      skipBtn.addEventListener('click', _handleSkipPush);
    }
    if (allowBtn && !allowBtn.dataset.wired) {
      allowBtn.dataset.wired = '1';
      allowBtn.addEventListener('click', () => {
        // SDK not available — just hide
        _dismissPushPromptWithAnimation();
      });
    }
  }, 3000);
}

async function _handleAllowPush() {
  _dismissPushPromptWithAnimation();
  localStorage.setItem(PROMPT_SHOWN_KEY, '1');

  try {
    if (!window.OneSignal) return;

    // This triggers the real browser permission dialog
    await window.OneSignal.Notifications.requestPermission();

    const granted = window.OneSignal.Notifications?.permission === 'granted';
    if (granted) {
      await _linkUserToOneSignal();
    }
  } catch (err) {
    // User dismissed the browser dialog — no error needed
    console.warn('[onesignal] permission request cancelled or failed:', err);
  }
}

function _handleSkipPush() {
  localStorage.setItem(PROMPT_SKIPPED_KEY, '1');
  _dismissPushPromptWithAnimation();
}

function _dismissPushPromptWithAnimation() {
  const prompt = document.getElementById('push-prompt');
  if (!prompt) return;
  prompt.classList.add('prompt-exit');
  prompt.addEventListener('animationend', () => {
    prompt.classList.add('hidden');
    prompt.classList.remove('prompt-exit');
  }, { once: true });
  // Fallback if animation doesn't fire
  setTimeout(() => {
    prompt.classList.add('hidden');
    prompt.classList.remove('prompt-exit');
  }, 500);
}


// ════════════════════════════════════════════════════════════════
// 3.  LINK USER  — store OneSignal player ID in Supabase (V2 use)
//     For V1 this enables OneSignal to identify who to target.
//     The actual server-side push trigger is a V2 feature.
// ════════════════════════════════════════════════════════════════

async function _linkUserToOneSignal() {
  const me = getCurrentProfile();
  if (!me || !window.OneSignal) return;

  try {
    // Set the external user ID so OneSignal can target this specific user
    await window.OneSignal.login(me.id);
  } catch (err) {
    // Non-critical — poke notifications still show in-app
    console.warn('[onesignal] login (external user ID) failed:', err);
  }
}


// ════════════════════════════════════════════════════════════════
// 4.  WAIT FOR SDK
// ════════════════════════════════════════════════════════════════

/**
 * Poll until window.OneSignal is available or the timeout expires.
 * @param {number} timeoutMs
 */
function _waitForOneSignal(timeoutMs = 5000) {
  return new Promise(resolve => {
    if (window.OneSignal) { resolve(); return; }
    const start    = Date.now();
    const interval = setInterval(() => {
      if (window.OneSignal || Date.now() - start > timeoutMs) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });
}