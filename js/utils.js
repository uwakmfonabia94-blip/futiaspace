/**
 * FutiaSpace — js/utils.js
 * Shared helpers used across the entire app.
 * No page-specific logic lives here — only pure utilities.
 */

import { supabase } from './supabase.js';


// ════════════════════════════════════════════════════════════════
// 1.  CONSTANTS  — single source of truth, update once here
// ════════════════════════════════════════════════════════════════

/** Levels currently running at FUTIA (100–300 L). Add 400 here when launched. */
export const LEVELS = ['100', '200', '300'];

/** All departments grouped by school. Values must match Supabase profiles.department. */
export const DEPARTMENTS = [
  // School of Computing
  'Computer Science',
  'Software Engineering',
  'Cybersecurity',
  // School of Engineering & Engineering Technology
  'Chemical Engineering',
  'Petroleum & Gas Engineering',
  'Aerospace Engineering',
  'Civil Engineering',
  'Electrical & Electronics Engineering',
  'Mechanical Engineering',
  // School of Pure & Applied Science
  'Mathematics & Statistics',
  'Biochemistry',
  'Physics',
  // School of Environmental Sciences
  'Architecture',
  'Naval Architecture',
  'Building Technology',
  'Quantity Surveying',
  // School of Management Sciences
  'Accounting',
  'Business Management',
  'Tourism & Hospitality',
  'Transportation Management',
  // School of Agricultural Technology
  'Agriculture',
  'Food Science & Technology',
  // School of Library & Information Technology
  'Library & Information Technology',
];

/**
 * Support / report WhatsApp number in international format (no + prefix).
 * Number is intentionally NOT exposed in any UI text — only used to build the wa.me link.
 */
const SUPPORT_WA_NUMBER = '2349038745661';


// ════════════════════════════════════════════════════════════════
// 2.  TOAST NOTIFICATIONS
//     Type: 'success' | 'error' | 'warning' | 'info' | 'offline' | 'online' | 'update'
// ════════════════════════════════════════════════════════════════

const TOAST_ICONS = {
  success : 'check-circle',
  error   : 'x-circle',
  warning : 'alert-triangle',
  info    : 'info',
  offline : 'wifi-off',
  online  : 'wifi',
  update  : 'refresh-cw',
};

/**
 * Show a toast notification.
 * @param {string}  message     Text to display.
 * @param {string}  [type]      One of the TOAST_ICONS keys. Default 'info'.
 * @param {number}  [duration]  Auto-dismiss ms. 0 = stay until clicked. Default 3500.
 * @param {Function}[onClick]   Optional click handler (used by update toast).
 * @returns {HTMLElement}       The toast element, for manual removal if needed.
 */
export function showToast(message, type = 'info', duration = 3500, onClick = null) {
  const container = document.getElementById('toast-container');
  if (!container) return null;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');

  const iconName = TOAST_ICONS[type] || 'info';
  toast.innerHTML = `
    <i data-lucide="${iconName}" aria-hidden="true"></i>
    <span>${escapeHtml(message)}</span>
  `;

  if (onClick) {
    toast.style.cursor = 'pointer';
    toast.addEventListener('click', () => { onClick(); removeToast(toast); });
  }

  container.appendChild(toast);

  // Render the Lucide icon inside the toast
  if (window.lucide) window.lucide.createIcons({ icons: window.lucide.icons, rootElement: toast });

  if (duration > 0) {
    setTimeout(() => removeToast(toast), duration);
  }

  return toast;
}

function removeToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.add('toast-exit');
  toast.addEventListener('animationend', () => toast.remove(), { once: true });
  // Fallback removal if animation doesn't fire
  setTimeout(() => toast.remove(), 500);
}


// ════════════════════════════════════════════════════════════════
// 3.  CUSTOM MODAL
//     Replaces ALL window.confirm / window.alert / window.prompt.
// ════════════════════════════════════════════════════════════════

let _modalResolve = null;

/**
 * Show a custom modal dialog.
 * Returns a Promise that resolves with the action key when a button is clicked.
 *
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {'info'|'danger'|'success'|'warning'} [opts.iconType]  Icon colour theme.
 * @param {string} [opts.iconName]   Lucide icon name. Default: derived from iconType.
 * @param {Array}  opts.actions      Array of { label, key, style } objects.
 *   style: 'primary' | 'outline' | 'danger' | 'ghost'
 *
 * @example
 * const result = await showModal({
 *   title  : 'Log out?',
 *   message: 'You will need to log in again.',
 *   iconType: 'warning',
 *   actions: [
 *     { label: 'Cancel',   key: 'cancel',  style: 'outline'  },
 *     { label: 'Log Out',  key: 'confirm', style: 'danger'   },
 *   ],
 * });
 * if (result === 'confirm') { ... }
 */
export function showModal(opts) {
  return new Promise(resolve => {
    _modalResolve = resolve;

    const overlay  = document.getElementById('modal-overlay');
    const iconWrap = document.getElementById('modal-icon-wrap');
    const title    = document.getElementById('modal-title');
    const message  = document.getElementById('modal-message');
    const actions  = document.getElementById('modal-actions');

    if (!overlay) { resolve(null); return; }

    // Icon
    const defaultIcons = { info: 'info', danger: 'alert-circle', success: 'check-circle', warning: 'alert-triangle' };
    const iconName = opts.iconName || defaultIcons[opts.iconType] || 'info';
    iconWrap.className = `modal-icon-wrap${opts.iconType ? ' modal-' + opts.iconType : ''}`;
    iconWrap.innerHTML = `<i data-lucide="${iconName}" aria-hidden="true"></i>`;

    // Text
    title.textContent   = opts.title   || '';
    message.textContent = opts.message || '';

    // Actions (buttons)
    actions.innerHTML = '';
    const hasMultiple = (opts.actions || []).length > 1;
    if (hasMultiple) actions.classList.add('modal-actions-row');
    else             actions.classList.remove('modal-actions-row');

    (opts.actions || [{ label: 'OK', key: 'ok', style: 'primary' }]).forEach(action => {
      const btn = document.createElement('button');
      btn.type      = 'button';
      btn.className = `btn btn-${action.style || 'primary'}`;
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        hideModal();
        if (_modalResolve) { _modalResolve(action.key); _modalResolve = null; }
      });
      actions.appendChild(btn);
    });

    // Render icons inside modal
    if (window.lucide) window.lucide.createIcons({ icons: window.lucide.icons, rootElement: overlay });

    // Show
    overlay.classList.remove('hidden');
    document.body.classList.add('no-scroll');

    // Close on backdrop click
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        hideModal();
        if (_modalResolve) { _modalResolve(null); _modalResolve = null; }
      }
    };
  });
}

/** Programmatically hide the modal (e.g. after an async action completes). */
export function hideModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.add('hidden');
  document.body.classList.remove('no-scroll');
}


// ════════════════════════════════════════════════════════════════
// 4.  IMAGE COMPRESSION
//     Client-side compression before Supabase Storage upload.
//     Prevents 5MB selfies from hitting the 2MB bucket limit.
// ════════════════════════════════════════════════════════════════

/**
 * Compress an image File to a target max dimension and quality.
 * Returns a Blob (not a File) ready for Supabase Storage upload.
 *
 * @param {File}   file         The original image file from <input type="file">.
 * @param {number} [maxDim]     Max width OR height in px. Default 400.
 * @param {number} [quality]    JPEG quality 0–1. Default 0.82.
 * @returns {Promise<Blob>}
 */
export function compressImage(file, maxDim = 400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload  = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image for compression.'));
      img.onload  = () => {
        // Calculate scaled dimensions maintaining aspect ratio
        let { width, height } = img;
        if (width > height) {
          if (width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
        } else {
          if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
        }

        const canvas  = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        // Smooth rendering
        ctx.imageSmoothingEnabled  = true;
        ctx.imageSmoothingQuality  = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed.')),
          'image/jpeg',
          quality
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}


// ════════════════════════════════════════════════════════════════
// 5.  AVATAR / INITIALS HELPERS
// ════════════════════════════════════════════════════════════════

/**
 * Derive 1–2 uppercase initials from a full name.
 * "Uwakmfon Theophilus" → "UT"
 * "Zara"               → "Z"
 */
export function getInitials(fullName) {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Render an avatar element — shows the image if available, otherwise initials.
 * Works with any container element that has an <img> and an initials <div> inside.
 *
 * @param {HTMLImageElement} imgEl       The <img> element.
 * @param {HTMLElement}      initialsEl  The initials fallback element.
 * @param {string|null}      avatarUrl   Public URL from Supabase Storage (may be null).
 * @param {string}           fullName    Used to generate initials.
 */
export function renderAvatar(imgEl, initialsEl, avatarUrl, fullName) {
  if (avatarUrl) {
    imgEl.src = avatarUrl;
    imgEl.alt = fullName || 'Profile photo';
    imgEl.classList.remove('hidden');
    initialsEl.classList.add('hidden');
    // Fallback if URL is broken
    imgEl.onerror = () => {
      imgEl.classList.add('hidden');
      initialsEl.classList.remove('hidden');
      initialsEl.textContent = getInitials(fullName);
    };
  } else {
    imgEl.classList.add('hidden');
    initialsEl.classList.remove('hidden');
    initialsEl.textContent = getInitials(fullName);
  }
}


// ════════════════════════════════════════════════════════════════
// 6.  TIME FORMATTING
// ════════════════════════════════════════════════════════════════

/**
 * Convert a timestamp to a short relative string.
 * "just now", "2m ago", "3h ago", "2d ago", "1 Jan"
 * @param {string|Date} timestamp
 * @returns {string}
 */
export function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const date  = new Date(timestamp);
  const now   = new Date();
  const diff  = Math.floor((now - date) / 1000); // seconds

  if (diff <  30)  return 'just now';
  if (diff <  60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800)return `${Math.floor(diff / 86400)}d ago`;

  // Older than a week — show short date
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}


// ════════════════════════════════════════════════════════════════
// 7.  WHATSAPP HELPERS
// ════════════════════════════════════════════════════════════════

/**
 * Open WhatsApp to report a problem / bug.
 * The support number is encoded in the link — NOT displayed anywhere in the UI.
 */
export function openWhatsAppReport() {
  const text = encodeURIComponent(
    `Hello, I want to report a problem on FutiaSpace.\n\n[Describe your issue here]`
  );
  window.open(`https://wa.me/${SUPPORT_WA_NUMBER}?text=${text}`, '_blank', 'noopener,noreferrer');
}

/**
 * Build a "Share on WhatsApp" link for a student profile.
 * @param {string} text  Pre-encoded share text.
 */
export function buildWhatsAppShareLink(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * Build the invite-a-friend link (the app's base URL).
 * @returns {string}
 */
export function buildInviteLink() {
  return window.location.origin;
}


// ════════════════════════════════════════════════════════════════
// 8.  CLIPBOARD
// ════════════════════════════════════════════════════════════════

/**
 * Copy text to clipboard. Shows a success/error toast automatically.
 * @param {string} text       Text to copy.
 * @param {string} [label]    Human-readable label for the toast. Default "Link".
 */
export async function copyToClipboard(text, label = 'Link') {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for HTTP or older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showToast(`${label} copied to clipboard`, 'success', 2500);
  } catch {
    showToast('Could not copy — try manually', 'error');
  }
}


// ════════════════════════════════════════════════════════════════
// 9.  BUTTON LOADING STATE
// ════════════════════════════════════════════════════════════════

/**
 * Toggle loading state on a .btn-loader button.
 * Hides the label, shows the spinner, disables the button.
 * @param {HTMLElement} btn
 * @param {boolean}     loading
 */
export function setLoadingBtn(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.classList.add('loading');
    btn.disabled = true;
    const spinner = btn.querySelector('.btn-spinner');
    if (spinner) spinner.classList.remove('hidden');
  } else {
    btn.classList.remove('loading');
    btn.disabled = false;
    const spinner = btn.querySelector('.btn-spinner');
    if (spinner) spinner.classList.add('hidden');
  }
}


// ════════════════════════════════════════════════════════════════
// 10.  LAST SEEN  — updates profiles.last_seen in the background
// ════════════════════════════════════════════════════════════════

/** Debounced last_seen updater — fires at most once every 60 seconds. */
let _lastSeenTimer = null;

export async function updateLastSeen() {
  if (_lastSeenTimer) return;
  _lastSeenTimer = setTimeout(() => { _lastSeenTimer = null; }, 60_000);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('profiles')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', user.id);
  } catch {
    // Silent — last_seen is non-critical
  }
}


// ════════════════════════════════════════════════════════════════
// 11.  ONLINE / OFFLINE TOASTS
//      Called once from router.js on app init.
// ════════════════════════════════════════════════════════════════

export function initNetworkToasts() {
  // Persist the offline toast reference so we can remove it on reconnect
  let _offlineToast = null;

  window.addEventListener('offline', () => {
    _offlineToast = showToast("You're offline — some features won't work", 'offline', 0);
  });

  window.addEventListener('online', () => {
    if (_offlineToast) { removeToastEl(_offlineToast); _offlineToast = null; }
    showToast("You're back online", 'online', 2500);
  });
}

/** Internal helper to remove a specific toast element. */
function removeToastEl(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.add('toast-exit');
  toast.addEventListener('animationend', () => toast.remove(), { once: true });
  setTimeout(() => toast.remove(), 500);
}


// ════════════════════════════════════════════════════════════════
// 12.  DEBOUNCE
// ════════════════════════════════════════════════════════════════

/**
 * Classic debounce. Returns a function that delays invoking `fn`
 * until `delay` ms after the last call.
 * @param {Function} fn
 * @param {number}   delay  Milliseconds. Default 320.
 */
export function debounce(fn, delay = 320) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}


// ════════════════════════════════════════════════════════════════
// 13.  SECURITY HELPER
// ════════════════════════════════════════════════════════════════

/** Escape HTML entities to prevent XSS in dynamically-injected strings. */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitise a user-supplied string to plain text.
 * Trims whitespace, collapses multiple spaces, removes HTML tags.
 * @param {string} str
 * @param {number} [maxLen]  Optional max length.
 */
export function sanitiseText(str, maxLen) {
  if (!str) return '';
  let clean = String(str)
    .replace(/<[^>]+>/g, '')   // strip HTML tags
    .replace(/\s+/g, ' ')      // collapse whitespace
    .trim();
  if (maxLen) clean = clean.slice(0, maxLen);
  return clean;
}


// ════════════════════════════════════════════════════════════════
// 14.  LEVEL DISPLAY HELPER
// ════════════════════════════════════════════════════════════════

/** Convert stored level "100" to display string "100 Level". */
export function formatLevel(level) {
  return level ? `${level} Level` : '';
}