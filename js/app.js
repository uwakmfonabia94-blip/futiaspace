// js/app.js
import { supabase } from './supabase.js';
import { route, navigate, resolve } from './router.js';
import { renderShell, updateShellUser, getCurrentUser } from './ui/shell.js';
import { startActiveTracking, stopActiveTracking } from './lib/activity.js';
import { initOneSignal, detectIOS, triggerPush } from './lib/onesignal.js';
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

// --- Auth state listener (CRITICAL: redirects after login) ---
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN') {
    updateShellUser(session.user);
    startActiveTracking();
    
    const isIOS = await detectIOS();
    if (isIOS) {
      await supabase.from('profiles').update({ is_ios: true }).eq('id', session.user.id);
    } else {
      await initOneSignal(session.user.id);
    }
    
    // Redirect away from auth pages to directory
    const currentHash = window.location.hash;
    if (['#/login', '#/signup', '#/landing'].includes(currentHash)) {
      navigate('/directory');
    }
    
    updateBadge(session.user.id);
    updateChatBadge(session.user.id);
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

// Global handler for token errors
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

// --- PWA Install Banner (only after login & scroll) ---
let installPrompt = null;
let installBannerShown = false;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});

async function maybeShowInstallBanner() {
  if (installBannerShown) return;
  if (localStorage.getItem('futiaspace-install-dismissed')) return;
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  
  const user = getCurrentUser();
  if (!user) return;
  if (!installPrompt) return;
  
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
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') showToast('Installing FutiaSpace...', 'success');
      installPrompt = null;
    }
    banner.remove();
    localStorage.setItem('futiaspace-install-dismissed', '1');
    installBannerShown = true;
  });
  
  document.getElementById('installLaterBtn').addEventListener('click', () => {
    banner.remove();
    localStorage.setItem('futiaspace-install-dismissed', '1');
    installBannerShown = true;
  });
  
  installBannerShown = true;
}

function setupInstallBannerOnScroll() {
  const mainContent = document.getElementById('mainContent');
  if (mainContent) {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && getCurrentUser()) {
        maybeShowInstallBanner();
        observer.disconnect();
      }
    }, { threshold: 0.2 });
    observer.observe(mainContent);
  }
}

// Offline / Online toasts
window.addEventListener('offline', () => showToast('You are offline', 'error'));
window.addEventListener('online', () => showToast('Back online', 'success'));

// --- Initialization ---
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
    
    const isIOS = await detectIOS();
    if (isIOS) {
      await supabase.from('profiles').update({ is_ios: true }).eq('id', session.user.id);
    } else {
      await initOneSignal(session.user.id);
    }
    
    if (['#/login', '#/signup', '#/landing'].includes(window.location.hash)) {
      navigate('/directory');
    }
    setupInstallBannerOnScroll();
  } else {
    if (!['#/login', '#/signup', '#/landing', '#/forgot-password', '#/update-password'].includes(window.location.hash)) {
      navigate('/landing');
    }
  }
  resolve();
}

window.addEventListener('beforeunload', () => supabase.removeAllChannels());
init();