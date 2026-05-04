// js/app.js
import { supabase } from './supabase.js';
import { route, navigate, resolve } from './router.js';
import { renderShell, updateShellUser, getCurrentUser } from './ui/shell.js';
import { startActiveTracking, stopActiveTracking } from './lib/activity.js';
import { renderLanding } from './pages/landing.js';
import { renderLogin } from './pages/login.js';
import { renderSignup } from './pages/signup.js';
import { renderDirectory } from './pages/directory.js';
import { renderProfile } from './pages/profile.js';
import { renderNotifications, updateBadge } from './pages/notifications.js';
import { renderSettings } from './pages/settings.js';
import { renderPrivacy, renderAbout, renderGuidelines } from './pages/static.js';
import { renderMarketplace } from './pages/marketplace.js';
import { renderSearch } from './pages/search.js';
import { renderChatList, updateChatBadge } from './pages/chatList.js';
import { renderChatDetail } from './pages/chatDetail.js';
import { renderForgotPassword } from './pages/forgotPassword.js';
import { renderUpdatePassword } from './pages/updatePassword.js';
import './ui/imageViewer.js';
import { showToast } from './ui/toast.js';

// Auth helpers
async function requireUser(fallback = '/landing') {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { navigate(fallback); return false; }
  return true;
}
async function requireGuest(fallback = '/directory') {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) { navigate(fallback); return false; }
  return true;
}

// --- Routes ---
route('/landing', async () => { if (!(await requireGuest('/directory'))) return; renderLanding(); });
route('/login', async () => { if (!(await requireGuest('/directory'))) return; renderLogin(); });
route('/signup', async () => { if (!(await requireGuest('/directory'))) return; renderSignup(); });
route('/forgot-password', renderForgotPassword);
route('/update-password', renderUpdatePassword);

route('/directory', async () => { if (!(await requireUser())) return; renderDirectory(); });
route('/marketplace', async () => { if (!(await requireUser())) return; renderMarketplace(); });
route('/chats', async () => { if (!(await requireUser())) return; renderChatList(); });
route('/chat/:id', async (params) => { if (!(await requireUser())) return; renderChatDetail(params.id); });
route('/notifications', async () => { if (!(await requireUser())) return; renderNotifications(); });
route('/search', async () => { if (!(await requireUser())) return; renderSearch(); });
route('/profile', async () => { if (!(await requireUser())) return; const session = await supabase.auth.getSession(); if (session.data.session) navigate(`/profile/${session.data.session.user.id}`); });
route('/profile/:id', async (params) => { if (!(await requireUser())) return; renderProfile(params.id); });
route('/settings', async () => { if (!(await requireUser())) return; renderSettings(); });
route('/privacy', renderPrivacy);
route('/about', renderAbout);
route('/guidelines', renderGuidelines);

// Auth state listener
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN') {
    updateShellUser(session.user);
    startActiveTracking();
    if (['#/login', '#/signup', '#/landing'].includes(window.location.hash)) navigate('/directory');
    // Update badges after sign in
    if (session.user) {
      updateBadge(session.user.id);
      updateChatBadge(session.user.id);
    }
  }
  if (event === 'SIGNED_OUT') {
    stopActiveTracking();
    navigate('/landing');
    updateShellUser(null);
  }
  if (event === 'TOKEN_REFRESHED') {
    console.log('Token refreshed');
  }
});

// Global handler for token errors (invalid refresh token)
window.addEventListener('unhandledrejection', (event) => {
  const errorMsg = event.reason?.message || event.reason?.error_description || '';
  if (errorMsg.includes('Invalid Refresh Token') || errorMsg.includes('refresh_token_not_found')) {
    console.warn('Invalid refresh token, signing out');
    supabase.auth.signOut().then(() => {
      localStorage.clear();
      navigate('/landing');
      showToast('Session expired. Please log in again.', 'error');
    });
  }
});

// --- PWA Install Prompt (on user interaction, not just timeout) ---
let deferredPrompt = null;
let installPromptShown = false;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Optionally show a custom install banner (but we already have a button in drawer)
  if (!installPromptShown && !localStorage.getItem('futiaspace-install-dismissed')) {
    // Show a small banner at the bottom
    const banner = document.createElement('div');
    banner.id = 'installBanner';
    banner.className = 'install-banner';
    banner.innerHTML = `
      <span>📲 Install FutiaSpace for quick access</span>
      <div class="install-actions">
        <button id="installNowBtn" class="btn btn-sm btn-primary">Install</button>
        <button id="installLaterBtn" class="btn btn-sm btn-secondary">Remind later</button>
      </div>
    `;
    document.body.appendChild(banner);
    document.getElementById('installNowBtn').addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') showToast('Installing FutiaSpace...', 'success');
        deferredPrompt = null;
      }
      banner.remove();
      localStorage.setItem('futiaspace-install-dismissed', '1');
    });
    document.getElementById('installLaterBtn').addEventListener('click', () => {
      banner.remove();
      localStorage.setItem('futiaspace-install-dismissed', '1');
    });
    installPromptShown = true;
  }
});

// Also expose the deferred prompt to the drawer's "Install App" button in shell.js
window.__deferredPrompt = deferredPrompt;
// Update the reference when the prompt changes
setInterval(() => { window.__deferredPrompt = deferredPrompt; }, 1000);

// Offline / Online toasts
window.addEventListener('offline', () => showToast('You are offline', 'error'));
window.addEventListener('online', () => showToast('Back online', 'success'));

// Optional: First click anywhere also triggers install banner? Already handled by beforeinstallprompt.
// But we can also remind users after 15 seconds if not installed.
setTimeout(() => {
  if (!localStorage.getItem('futiaspace-install-dismissed') && !window.matchMedia('(display-mode: standalone)').matches) {
    if (!deferredPrompt) return;
    const banner = document.getElementById('installBanner');
    if (!banner) {
      const bannerDiv = document.createElement('div');
      bannerDiv.id = 'installBanner';
      bannerDiv.className = 'install-banner';
      bannerDiv.innerHTML = `
        <span>📲 Install FutiaSpace for quick access</span>
        <div class="install-actions">
          <button id="installNowBtnTimeout" class="btn btn-sm btn-primary">Install</button>
          <button id="installLaterBtnTimeout" class="btn btn-sm btn-secondary">Remind later</button>
        </div>
      `;
      document.body.appendChild(bannerDiv);
      document.getElementById('installNowBtnTimeout').addEventListener('click', async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === 'accepted') showToast('Installing FutiaSpace...', 'success');
          deferredPrompt = null;
        }
        bannerDiv.remove();
        localStorage.setItem('futiaspace-install-dismissed', '1');
      });
      document.getElementById('installLaterBtnTimeout').addEventListener('click', () => {
        bannerDiv.remove();
        localStorage.setItem('futiaspace-install-dismissed', '1');
      });
    }
  }
}, 15000);

async function init() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError && sessionError.message?.includes('Invalid Refresh Token')) {
    await supabase.auth.signOut();
    localStorage.clear();
    navigate('/landing');
    return;
  }
  renderShell();
  if (session) {
    updateShellUser(session.user);
    startActiveTracking();
    updateBadge(session.user.id);
    updateChatBadge(session.user.id);
    if (['#/login', '#/signup', '#/landing'].includes(window.location.hash)) navigate('/directory');
  } else {
    if (!['#/login', '#/signup', '#/landing', '#/forgot-password', '#/update-password'].includes(window.location.hash)) {
      navigate('/landing');
    }
  }
  resolve();
}

window.addEventListener('beforeunload', () => supabase.removeAllChannels());
init();