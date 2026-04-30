// js/ui/shell.js
import { updateBadge } from '../pages/notifications.js';
import { navigate } from '../router.js';
import { supabase } from '../supabase.js';
import { showToast } from '../ui/toast.js';

let currentUser = null;

export function getCurrentUser() {
  return currentUser;
}

export function renderShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <header class="app-header" id="appHeader" style="display:none">
      <div class="header-left">
        <button class="hamburger-btn" id="hamburgerBtn">
          <i data-lucide="menu"></i>
        </button>
        <div class="logo-container">
          <img src="logo.svg" alt="FutiaSpace" />
        </div>
        <span class="logo-text">FutiaSpace</span>
      </div>
      <img id="shellAvatar" class="avatar-mini" src="" alt="You" style="display:none" />
    </header>
    
    <main class="main-content" id="mainContent" style="padding-bottom:0;"></main>
    
    <nav class="bottom-nav" id="bottomNav" style="display:none">
      <a href="#/directory" class="nav-item" data-route="/directory">
        <i data-lucide="users"></i><span>Directory</span>
      </a>
      <a href="#/marketplace" class="nav-item" data-route="/marketplace">
        <i data-lucide="shopping-bag"></i><span>Marketplace</span>
      </a>
      <a href="#/notifications" class="nav-item" data-route="/notifications">
        <i data-lucide="bell"></i><span>Notifications</span>
        <span id="notificationBadge" class="badge" style="display:none;"></span>
      </a>
      <a href="#/profile" class="nav-item" data-route="/profile">
        <i data-lucide="user"></i><span>Profile</span>
      </a>
    </nav>

    <div class="drawer-overlay" id="drawerOverlay"></div>
    <aside class="drawer" id="drawer">
      <div class="drawer-item" data-route="/settings">
        <i data-lucide="settings"></i> Settings
      </div>
      <div class="drawer-item" data-route="/privacy">
        <i data-lucide="shield"></i> Privacy Policy
      </div>
      <div class="drawer-item" data-route="/about">
        <i data-lucide="info"></i> About
      </div>
      <div class="drawer-item" data-route="/guidelines">
        <i data-lucide="book-open"></i> Community Guidelines
      </div>
      <div class="drawer-item" id="installAppBtn">
        <i data-lucide="download"></i> Install App
      </div>
      <div class="drawer-item" id="logoutBtn">
        <i data-lucide="log-out"></i> Log Out
      </div>
    </aside>
  `;

  lucide.createIcons();

  // Drawer logic (unchanged)
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('drawerOverlay');
  hamburgerBtn.addEventListener('click', () => {
    drawer.classList.add('open');
    overlay.classList.add('open');
  });
  overlay.addEventListener('click', () => {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
  });

  document.querySelectorAll('.drawer-item[data-route]').forEach(item => {
    item.addEventListener('click', () => {
      navigate(item.dataset.route);
      drawer.classList.remove('open');
      overlay.classList.remove('open');
    });
  });

  // Manual Install button handler (unchanged)
  document.getElementById('installAppBtn').addEventListener('click', async () => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      showToast('App is already installed!', 'info');
      drawer.classList.remove('open');
      overlay.classList.remove('open');
      return;
    }
    if (window.__deferredPrompt) {
      await window.__deferredPrompt.prompt();
      const { outcome } = await window.__deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        showToast('Installing…', 'success');
      }
      window.__deferredPrompt = null;
    } else {
      showToast('Tap the share icon and select "Add to Home Screen"', 'info');
    }
    drawer.classList.remove('open');
    overlay.classList.remove('open');
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    drawer.classList.remove('open');
    overlay.classList.remove('open');
  });

  // Active nav (unchanged)
  const setActiveNav = () => {
    const hash = window.location.hash.slice(1) || '/directory';
    document.querySelectorAll('.nav-item').forEach(el => {
      const route = el.dataset.route;
      if (route && hash.startsWith(route.split('?')[0])) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  };
  window.addEventListener('hashchange', setActiveNav);
  setActiveNav();
}

export function updateShellUser(user) {
  currentUser = user;
  const header = document.getElementById('appHeader');
  const bottomNav = document.getElementById('bottomNav');
  const avatar = document.getElementById('shellAvatar');
  const mainContent = document.getElementById('mainContent');

  if (!header || !bottomNav || !mainContent) return;

  if (user) {
    header.style.display = 'flex';
    bottomNav.style.display = 'flex';
    mainContent.style.paddingBottom = 'calc(var(--nav-height) + 16px)';

    (async () => {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .single();

      if (!error && profile?.avatar_url) {
        avatar.src = profile.avatar_url;
        avatar.style.display = 'block';
      } else {
        avatar.style.display = 'none';
        avatar.removeAttribute('src');
      }
    })();

    updateBadge(user.id);
  } else {
    header.style.display = 'none';
    bottomNav.style.display = 'none';
    avatar.style.display = 'none';
    avatar.removeAttribute('src');
    mainContent.style.paddingBottom = '0';
    const badge = document.getElementById('notificationBadge');
    if (badge) badge.style.display = 'none';
  }
}