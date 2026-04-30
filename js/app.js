// js/app.js
import { supabase } from './supabase.js';
import { route, navigate, resolve } from './router.js';
import { renderShell, updateShellUser } from './ui/shell.js';
import { renderLanding } from './pages/landing.js';
import { renderLogin } from './pages/login.js';
import { renderSignup } from './pages/signup.js';
import { renderDirectory } from './pages/directory.js';
import { renderProfile } from './pages/profile.js';
import { renderNotifications, updateBadge } from './pages/notifications.js';
import { renderSettings } from './pages/settings.js';
import { renderPrivacy, renderAbout, renderGuidelines } from './pages/static.js';
import { renderMarketplace } from './pages/marketplace.js';   // real marketplace page
import './ui/imageViewer.js';                                 // full‑screen image viewer

// Auth guard helper
async function requireGuest(fallback = '/directory') {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) { navigate(fallback); return false; }
  return true;
}

// Routes
route('/landing', async () => { if (!(await requireGuest('/directory'))) return; renderLanding(); });
route('/login', async () => { if (!(await requireGuest('/directory'))) return; renderLogin(); });
route('/signup', async () => { if (!(await requireGuest('/directory'))) return; renderSignup(); });
route('/directory', renderDirectory);
route('/marketplace', renderMarketplace);          // ← real marketplace
route('/notifications', renderNotifications);
route('/profile', () => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) navigate(`/profile/${session.user.id}`);
  });
});
route('/profile/:id', (params) => renderProfile(params.id));
route('/settings', renderSettings);
route('/privacy', renderPrivacy);
route('/about', renderAbout);
route('/guidelines', renderGuidelines);

// Auth state listener
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    updateShellUser(session.user);
    if (['#/login', '#/signup', '#/landing'].includes(window.location.hash)) {
      navigate('/directory');
    }
  }
  if (event === 'SIGNED_OUT') {
    navigate('/landing');
    updateShellUser(null);
  }
});

// PWA install prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  window.__deferredPrompt = e;
  showInstallBanner();
});

function showInstallBanner() {
  if (document.getElementById('installBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'installBanner';
  banner.className = 'install-banner';
  banner.innerHTML = `
    <span>📲 Install FutiaSpace on your phone</span>
    <div class="install-actions">
      <button id="installDismiss" class="btn btn-sm btn-secondary">Not now</button>
      <button id="installYes" class="btn btn-sm btn-primary">Install</button>
    </div>
  `;
  document.getElementById('app').appendChild(banner);

  document.getElementById('installYes').addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
    }
    banner.remove();
  });
  document.getElementById('installDismiss').addEventListener('click', () => banner.remove());
}

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  renderShell();
  if (session) {
    updateShellUser(session.user);
    if (['#/login', '#/signup', '#/landing'].includes(window.location.hash)) {
      navigate('/directory');
    }
  } else {
    if (!['#/login', '#/signup', '#/landing'].includes(window.location.hash)) {
      navigate('/landing');
    }
  }
  resolve();
}

window.addEventListener('beforeunload', () => supabase.removeAllChannels());
init();