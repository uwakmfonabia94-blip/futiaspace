/**
 * FutiaSpace — js/router.js
 * Single entry point for the entire app.
 * Responsibilities:
 *  • Hash-based SPA routing with auth guard
 *  • Auth state management (session, profile cache)
 *  • App shell show/hide
 *  • Bottom nav active states
 *  • Top nav (search + hamburger)
 *  • Hamburger drawer (open, close, all menu actions)
 *  • Dark/light theme toggle (persisted to localStorage)
 *  • One-time inits: PWA, OneSignal, network toasts, Lucide icons
 *  • last_seen heartbeat
 */

import { supabase }                             from './supabase.js';
import {
  showToast, showModal,
  updateLastSeen, initNetworkToasts,
  renderAvatar, getInitials,
  copyToClipboard, buildInviteLink,
  openWhatsAppReport, escapeHtml,
}                                               from './utils.js';
import { initAuth }                             from './auth.js';
import { initDirectory, destroyDirectory,
         initSearch }                           from './directory.js';
import { initProfile, initEditProfile }         from './profile.js';
import { initNotifications, getUnreadCount,
         updateNotifBadge }                     from './notifications.js';
import { initOneSignal }                        from './onesignal.js';
import { initPWA }                              from './pwa.js';


// ════════════════════════════════════════════════════════════════
// ROUTE REGISTRY
// auth: false  → accessible without a session (redirect to home if already logged in)
// auth: true   → requires a session (redirect to login if not)
// shell: true  → rendered inside #app-shell with top + bottom nav
// nav:         → bottom nav button ID to set as active (null = none)
// ════════════════════════════════════════════════════════════════
const ROUTES = {
  'landing'        : { pageId: 'page-landing',         auth: false, shell: false, nav: null },
  'login'          : { pageId: 'page-login',           auth: false, shell: false, nav: null },
  'signup'         : { pageId: 'page-signup',          auth: false, shell: false, nav: null },
  'forgot-password': { pageId: 'page-forgot-password', auth: false, shell: false, nav: null },
  'reset-password' : { pageId: 'page-reset-password',  auth: false, shell: false, nav: null },
  'home'           : { pageId: 'page-home',            auth: true,  shell: true,  nav: 'nav-home'         },
  'search'         : { pageId: 'page-search',          auth: true,  shell: true,  nav: null               },
  'notifications'  : { pageId: 'page-notifications',   auth: true,  shell: true,  nav: 'nav-notifications' },
  'profile'        : { pageId: 'page-profile',         auth: true,  shell: true,  nav: null               },
  'profile-self'   : { pageId: 'page-profile',         auth: true,  shell: true,  nav: 'nav-profile-self' },
  'edit-profile'   : { pageId: 'page-edit-profile',    auth: true,  shell: true,  nav: null               },
  'about'          : { pageId: 'page-about',           auth: true,  shell: true,  nav: null               },
  'faq'            : { pageId: 'page-faq',             auth: true,  shell: true,  nav: null               },
  'privacy'        : { pageId: 'page-privacy',         auth: true,  shell: true,  nav: null               },
  'guidelines'     : { pageId: 'page-guidelines',      auth: true,  shell: true,  nav: null               },
};

// All page IDs — used to hide all pages before showing the target
const ALL_PAGE_IDS = Object.values(ROUTES)
  .map(r => r.pageId)
  .filter((v, i, a) => a.indexOf(v) === i); // unique


// ════════════════════════════════════════════════════════════════
// GLOBAL STATE
// ════════════════════════════════════════════════════════════════
let _session         = null;  // Supabase auth session
let _currentProfile  = null;  // profiles table row for the logged-in user
let _currentRoute    = null;  // active route key
let _currentParams   = {};    // parsed route params e.g. { id: 'uuid' }
let _drawerOpen      = false;
let _isRecoveryMode  = false; // true when landing via password-reset email link

/** Read-only accessors exported for other modules */
export const getSession        = ()  => _session;
export const getCurrentProfile = ()  => _currentProfile;
export const getCurrentParams  = ()  => _currentParams;

/** Called by profile.js after a successful edit to refresh the cached profile. */
export async function refreshCurrentProfile() {
  if (!_session) return;
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', _session.user.id)
    .single();
  if (data) {
    _currentProfile = data;
    _populateDrawerUser();
  }
}


// ════════════════════════════════════════════════════════════════
// NAVIGATE  — the one public function every module calls
// navigate('#/home')  or  navigate('/home')  or  navigate('home')
// ════════════════════════════════════════════════════════════════
export function navigate(route) {
  // Normalise: ensure it starts with #/
  if (!route.startsWith('#')) route = '#/' + route.replace(/^\//, '');
  window.location.hash = route;
}


// ════════════════════════════════════════════════════════════════
// INITIALISE — called once when DOM is ready
// ════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {

  // 1. Render Lucide icons for the initial static HTML
  if (window.lucide) window.lucide.createIcons();

  // 2. Apply saved theme before anything else paints (avoids flash)
  _applyTheme(localStorage.getItem('futia_theme') || 'dark');

  // 3. Start network toasts (offline / online)
  initNetworkToasts();

  // 4. Check if this is a password-reset link visit
  //    Supabase puts #access_token=...&type=recovery in the hash.
  //    We must detect this BEFORE setting up our hash-change listener.
  if (_isPasswordResetHash(window.location.hash)) {
    _isRecoveryMode = true;
    // Clear the hash so our router doesn't try to parse it as a route.
    // Supabase has already read the token at this point (detectSessionInUrl: true).
    history.replaceState(null, '', window.location.pathname + '#/reset-password');
  }

  // 5. Subscribe to Supabase auth state changes
 supabase.auth.onAuthStateChange(async (event, session) => {
  _session = session;

  if (event === 'PASSWORD_RECOVERY') {
    _isRecoveryMode = true;
    _showAuthPage('reset-password');
    return;
  }

  if (event === 'SIGNED_IN') {
    // ✅ Use the session already passed in — NO getSession() call here
    if (session) {
      await _loadCurrentProfile();
      _populateDrawerUser();
      updateLastSeen();
      initOneSignal();
      const count = await getUnreadCount();
      updateNotifBadge(count);
      const onAuthPage = !_currentRoute || !ROUTES[_currentRoute]?.auth;
      if (onAuthPage && !_isRecoveryMode) navigate('#/home');
    }
  }

  // ✅ Remove INITIAL_SESSION from this block entirely —
  // let _handleRouteChange handle the first load via its own getSession()

  if (event === 'SIGNED_OUT') {
    _session        = null;
    _currentProfile = null;
    navigate('#/landing');
  }

  if (event === 'USER_UPDATED') {
    showToast('Password updated successfully', 'success');
    navigate('#/home');
  }
});

  // 6. Register hash-change listener for all future navigation
  window.addEventListener('hashchange', _handleRouteChange);

  // 7. Set up all one-off event listeners
  _initTopNav();
  _initBottomNav();
  _initDrawer();
  _initStaticPageBackButtons();

  // 8. PWA (install prompt + service worker + update detection)
  initPWA();

  // 9. Init auth page listeners (login, signup forms etc.)
  initAuth();

  // 10. Route to the current hash on first load
  _handleRouteChange();
});


// ════════════════════════════════════════════════════════════════
// ROUTE HANDLER  — called on every hashchange and on first load
// ════════════════════════════════════════════════════════════════

async function _handleRouteChange() {
  const { routeKey, params } = _parseHash(window.location.hash);
  _currentParams = params;

  // ✅ ONE call only — reused for all checks below
  const { data: { session } } = await supabase.auth.getSession();
  if (session) _session = session;

  const route = ROUTES[routeKey];

  if (!route) {
    navigate(session ? '#/home' : '#/landing');
    return;
  }

  if (route.auth) {
    if (!session) { navigate('#/login'); return; }
    if (!_currentProfile) {
      await _loadCurrentProfile();
      _populateDrawerUser();
    }
  }

  if (!route.auth && routeKey !== 'reset-password') {
    if (session && routeKey !== 'landing') {
      navigate('#/home');
      return;
    }
  }

  _currentRoute = routeKey;
  _showPage(routeKey, params);
}

// ════════════════════════════════════════════════════════════════
// SHOW PAGE
// ════════════════════════════════════════════════════════════════
function _showPage(routeKey, params = {}) {
  const route = ROUTES[routeKey];
  if (!route) return;

  const appShell = document.getElementById('app-shell');

  // Hide every page
  ALL_PAGE_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('page-active');
      el.classList.add('hidden');
    }
  });

  // Hide both app shell and loose auth sections first
  if (appShell) appShell.classList.add('hidden');
  document.querySelectorAll('.auth-page').forEach(el => el.classList.add('hidden'));

  const pageEl = document.getElementById(route.pageId);
  if (!pageEl) return;

  if (route.shell) {
    // App shell page
    if (appShell) appShell.classList.remove('hidden');
    pageEl.classList.remove('hidden');
    pageEl.classList.add('page-active');
    // Scroll main content to top on page change
    const main = document.getElementById('main-content');
    if (main) main.scrollTop = 0;
    // Update bottom nav active state
    _setNavActive(route.nav);
  } else {
    // Auth page (outside the shell)
    pageEl.classList.remove('hidden');
    pageEl.classList.add('page-active');
  }

  // Re-render Lucide icons in the newly shown page
  if (window.lucide) window.lucide.createIcons({ icons: window.lucide.icons, rootElement: pageEl });

  // ── Call the page's init function ──────────────────────────
  _callPageInit(routeKey, params);

  // ── Update last_seen on every app page view ─────────────────
  if (route.auth) updateLastSeen();
}


// ════════════════════════════════════════════════════════════════
// PAGE INIT DISPATCHER
// When a new phase is implemented, the stub gets replaced and
// this dispatcher automatically calls the real function.
// ════════════════════════════════════════════════════════════════
function _callPageInit(routeKey, params) {
  switch (routeKey) {
    case 'home':
      destroyDirectory();   // clean up previous instance if any
      initDirectory();
      break;

    case 'search':
      initSearch();
      break;

    case 'notifications':
      initNotifications();
      break;

    case 'profile':
      initProfile(params.id);
      break;

    case 'profile-self':
      if (_currentProfile) initProfile(_currentProfile.id);
      break;

    case 'edit-profile':
      initEditProfile();
      break;

    // Auth, static, and reset pages need no JS init beyond their own module
    default:
      break;
  }
}


// ════════════════════════════════════════════════════════════════
// HASH PARSER
// '#/profile/abc-123' → { routeKey: 'profile', params: { id: 'abc-123' } }
// '#/home'            → { routeKey: 'home',    params: {} }
// ════════════════════════════════════════════════════════════════
function _parseHash(hash) {
  // Strip leading #/ or #
  const raw    = hash.replace(/^#\/?/, '').trim() || 'landing';
  const parts  = raw.split('/');
  const base   = parts[0] || 'landing';
  const params = {};

  // Profile route: #/profile/USER_ID
  if (base === 'profile' && parts[1]) {
    params.id = parts[1];
    return { routeKey: 'profile', params };
  }

  return { routeKey: base, params };
}


// ════════════════════════════════════════════════════════════════
// AUTH PAGE DIRECT SHOW (used by recovery handler before full routing)
// ════════════════════════════════════════════════════════════════
function _showAuthPage(routeKey) {
  history.replaceState(null, '', `#/${routeKey}`);
  _handleRouteChange();
}


// ════════════════════════════════════════════════════════════════
// LOAD CURRENT PROFILE  — fetches from DB and caches in _currentProfile
// ════════════════════════════════════════════════════════════════
async function _loadCurrentProfile() {
  if (!_session) return;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', _session.user.id)
      .single();
    if (!error && data) _currentProfile = data;
  } catch {
    // Non-critical — profile will load on next attempt
  }
}


// ════════════════════════════════════════════════════════════════
// TOP NAV
// ════════════════════════════════════════════════════════════════
function _initTopNav() {
  document.getElementById('btn-open-search')?.addEventListener('click', () => {
    navigate('#/search');
  });

  document.getElementById('btn-open-menu')?.addEventListener('click', () => {
    _openDrawer();
  });
}


// ════════════════════════════════════════════════════════════════
// BOTTOM NAV
// ════════════════════════════════════════════════════════════════
function _initBottomNav() {
  document.getElementById('nav-home')?.addEventListener('click', () => {
    navigate('#/home');
  });

  document.getElementById('nav-notifications')?.addEventListener('click', () => {
    navigate('#/notifications');
  });

  document.getElementById('nav-profile-self')?.addEventListener('click', () => {
    navigate('#/profile-self');
  });
}

function _setNavActive(navId) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.setAttribute('aria-current', 'false');
    el.classList.remove('nav-active');
  });
  if (navId) {
    const activeBtn = document.getElementById(navId);
    if (activeBtn) {
      activeBtn.setAttribute('aria-current', 'true');
      activeBtn.classList.add('nav-active');
    }
  }
}


// ════════════════════════════════════════════════════════════════
// HAMBURGER DRAWER
// ════════════════════════════════════════════════════════════════
function _initDrawer() {
  // Close via backdrop
  document.getElementById('drawer-backdrop')?.addEventListener('click', _closeDrawer);
  // Close via X button
  document.getElementById('btn-close-drawer')?.addEventListener('click', _closeDrawer);

  // Theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    // Set initial state from localStorage
    const saved = localStorage.getItem('futia_theme') || 'dark';
    themeToggle.checked = (saved === 'light');
    _updateThemeToggleLabel(saved);

    themeToggle.addEventListener('change', () => {
      const newTheme = themeToggle.checked ? 'light' : 'dark';
      _applyTheme(newTheme);
      localStorage.setItem('futia_theme', newTheme);
      _updateThemeToggleLabel(newTheme);
    });
  }

  // Invite a friend
  document.getElementById('btn-invite')?.addEventListener('click', async () => {
    _closeDrawer();
    const link = buildInviteLink();
    const shareText = `Join me on FutiaSpace — the campus directory for FUTIA students!\n${link}`;

    // Try native share first, fall back to clipboard copy
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join FutiaSpace', text: shareText, url: link });
        return;
      } catch { /* user cancelled or not supported, fall through */ }
    }
    await copyToClipboard(link, 'Invite link');
  });

  // Report a problem
  document.getElementById('btn-report-bug')?.addEventListener('click', () => {
    _closeDrawer();
    openWhatsAppReport();
  });

  // Static page links inside drawer
  document.querySelectorAll('.hamburger-drawer [data-route]').forEach(btn => {
    btn.addEventListener('click', () => {
      const route = btn.dataset.route;
      if (route) {
        _closeDrawer();
        navigate(`#/${route}`);
      }
    });
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    _closeDrawer();
    const result = await showModal({
      title   : 'Log out?',
      message : 'You will be returned to the login screen.',
      iconType: 'warning',
      iconName: 'log-out',
      actions : [
        { label: 'Cancel',  key: 'cancel',  style: 'outline' },
        { label: 'Log Out', key: 'confirm', style: 'danger'  },
      ],
    });
    if (result === 'confirm') {
      await supabase.auth.signOut();
      // onAuthStateChange fires SIGNED_OUT which navigates to landing
    }
  });
}

function _openDrawer() {
  if (_drawerOpen) return;
  _drawerOpen = true;

  _populateDrawerUser();

  const backdrop = document.getElementById('drawer-backdrop');
  const drawer   = document.getElementById('hamburger-drawer');

  backdrop?.classList.remove('hidden');
  backdrop?.classList.remove('closing');
  drawer?.classList.remove('hidden');
  drawer?.classList.remove('closing');

  document.body.classList.add('no-scroll');

  // Re-render Lucide icons inside the drawer
  if (window.lucide && drawer) window.lucide.createIcons({ icons: window.lucide.icons, rootElement: drawer });
}

function _closeDrawer() {
  if (!_drawerOpen) return;

  const backdrop = document.getElementById('drawer-backdrop');
  const drawer   = document.getElementById('hamburger-drawer');

  backdrop?.classList.add('closing');
  drawer?.classList.add('closing');

  const ANIM_MS = 220;
  setTimeout(() => {
    backdrop?.classList.add('hidden');
    backdrop?.classList.remove('closing');
    drawer?.classList.add('hidden');
    drawer?.classList.remove('closing');
    document.body.classList.remove('no-scroll');
    _drawerOpen = false;
  }, ANIM_MS);
}

function _populateDrawerUser() {
  if (!_currentProfile) return;

  const nameEl     = document.getElementById('drawer-user-name');
  const deptEl     = document.getElementById('drawer-user-dept');
  const imgEl      = document.getElementById('drawer-avatar-img');
  const initialsEl = document.getElementById('drawer-avatar-initials');

  if (nameEl) nameEl.textContent = escapeHtml(_currentProfile.full_name || '—');
  if (deptEl) deptEl.textContent = escapeHtml(_currentProfile.department || '');
  if (imgEl && initialsEl) {
    renderAvatar(imgEl, initialsEl, _currentProfile.avatar_url, _currentProfile.full_name);
  }
}


// ════════════════════════════════════════════════════════════════
// STATIC PAGE BACK BUTTONS
// Handles .btn-back-static on About, FAQ, Privacy, Guidelines.
// ════════════════════════════════════════════════════════════════
function _initStaticPageBackButtons() {
  document.querySelectorAll('.btn-back-static').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        navigate('#/home');
      }
    });
  });
}


// ════════════════════════════════════════════════════════════════
// THEME
// ════════════════════════════════════════════════════════════════
function _applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  // Update the meta theme-color tag
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = '#6C63FF'; // accent stays the same in both themes
}

function _updateThemeToggleLabel(theme) {
  const label    = document.getElementById('theme-toggle-label');
  const moonIcon = document.getElementById('theme-moon-icon');
  const sunIcon  = document.getElementById('theme-sun-icon');

  if (theme === 'light') {
    if (label)    label.textContent = 'Dark Mode';
    if (moonIcon) moonIcon.classList.add('hidden');
    if (sunIcon)  sunIcon.classList.remove('hidden');
  } else {
    if (label)    label.textContent = 'Light Mode';
    if (moonIcon) moonIcon.classList.remove('hidden');
    if (sunIcon)  sunIcon.classList.add('hidden');
  }
}


// ════════════════════════════════════════════════════════════════
// PASSWORD RESET DETECTION
// ════════════════════════════════════════════════════════════════
function _isPasswordResetHash(hash) {
  return hash.includes('access_token') &&
         (hash.includes('type=recovery') || hash.includes('type%3Drecovery'));
}