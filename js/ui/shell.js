// js/ui/shell.js
import { updateBadge } from '../pages/notifications.js';
import { updateChatBadge } from '../pages/chatList.js';
import { navigate } from '../router.js';
import { supabase } from '../supabase.js';
import { showToast } from './toast.js';
import { startActiveTracking, stopActiveTracking } from '../lib/activity.js';

let currentUser = null;
export function getCurrentUser() { return currentUser; }

export function renderShell() {
  const app = document.getElementById('app');
  const savedTheme = localStorage.getItem('futiaspace-theme');
  if (savedTheme === 'light') document.body.classList.add('light-mode');

  app.innerHTML = `
    <header class="app-header" id="appHeader" style="display:none">
      <div class="header-left">
        <button class="hamburger-btn" id="hamburgerBtn"><i data-lucide="menu"></i></button>
        <div class="logo-container"><img src="logo.svg" alt="FutiaSpace" /></div>
        <span class="logo-text">FutiaSpace</span>
      </div>
      <div class="header-right">
        <button class="search-icon-btn" id="searchIconBtn"><i data-lucide="search"></i></button>
        <button class="chat-icon-btn" id="chatIconBtn"><i data-lucide="message-circle"></i><span id="chatBadge" class="badge" style="display:none;"></span></button>
      </div>
    </header>
    <main class="main-content" id="mainContent"></main>
    <nav class="bottom-nav" id="bottomNav" style="display:none">
      <a href="#/directory" class="nav-item" data-route="/directory"><i data-lucide="home"></i><span>Home</span></a>
      <a href="#/marketplace" class="nav-item" data-route="/marketplace"><i data-lucide="shopping-bag"></i><span>Marketplace</span></a>
      <a href="#/notifications" class="nav-item" data-route="/notifications"><i data-lucide="bell"></i><span>Notifications</span><span id="notificationBadge" class="badge" style="display:none;"></span></a>
      <a href="#/profile" class="nav-item" data-route="/profile"><i data-lucide="user"></i><span>Profile</span></a>
    </nav>
    <div class="drawer-overlay" id="drawerOverlay"></div>
    <aside class="drawer" id="drawer">
      <div class="drawer-item" data-route="/settings"><i data-lucide="settings"></i> Settings</div>
      <div class="drawer-item" data-route="/privacy"><i data-lucide="shield"></i> Privacy Policy</div>
      <div class="drawer-item" data-route="/about"><i data-lucide="info"></i> About</div>
      <div class="drawer-item" data-route="/guidelines"><i data-lucide="book-open"></i> Community Guidelines</div>
      <div class="drawer-item" id="themeToggleBtn"><i data-lucide="sun"></i> Light Mode</div>
      <div class="drawer-item" id="installAppBtn"><i data-lucide="download"></i> Install App</div>
      <div class="drawer-item" id="logoutBtn"><i data-lucide="log-out"></i> Log Out</div>
    </aside>
  `;

  lucide.createIcons();

  // Drawer logic
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('drawerOverlay');
  hamburgerBtn.addEventListener('click', () => { drawer.classList.add('open'); overlay.classList.add('open'); });
  overlay.addEventListener('click', () => { drawer.classList.remove('open'); overlay.classList.remove('open'); });
  document.querySelectorAll('.drawer-item[data-route]').forEach(item => {
    item.addEventListener('click', () => { navigate(item.dataset.route); drawer.classList.remove('open'); overlay.classList.remove('open'); });
  });

  // Theme toggle
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const body = document.body;
    body.classList.toggle('light-mode');
    localStorage.setItem('futiaspace-theme', body.classList.contains('light-mode') ? 'light' : 'dark');
    const btn = document.getElementById('themeToggleBtn');
    const svg = btn.querySelector('svg');
    if (svg) {
      const parent = svg.parentNode;
      const newIcon = document.createElement('span');
      newIcon.innerHTML = body.classList.contains('light-mode')
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
      parent.replaceChild(newIcon.firstElementChild, svg);
    }
    showToast(body.classList.contains('light-mode') ? 'Light mode' : 'Dark mode', 'info');
    drawer.classList.remove('open'); overlay.classList.remove('open');
  });

  // Search button
  document.getElementById('searchIconBtn').addEventListener('click', () => navigate('/search'));

  // Chat button in header
  document.getElementById('chatIconBtn').addEventListener('click', () => navigate('/chats'));

  // Install app from drawer
  document.getElementById('installAppBtn').addEventListener('click', async () => {
    if (window.matchMedia('(display-mode: standalone)').matches) { showToast('App already installed!', 'info'); return; }
    if (window.__deferredPrompt) {
      await window.__deferredPrompt.prompt();
      const { outcome } = await window.__deferredPrompt.userChoice;
      if (outcome === 'accepted') showToast('Installing…', 'success');
      window.__deferredPrompt = null;
    } else showToast('Tap share → Add to Home Screen', 'info');
    drawer.classList.remove('open'); overlay.classList.remove('open');
  });

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    stopActiveTracking();
    await supabase.auth.signOut();
    drawer.classList.remove('open'); overlay.classList.remove('open');
  });

  // Active nav highlight (only for bottom nav items)
  const setActiveNav = () => {
    const hash = window.location.hash.slice(1) || '/directory';
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.route && hash.startsWith(el.dataset.route.split('?')[0]));
    });
  };
  window.addEventListener('hashchange', setActiveNav);
  setActiveNav();

  // Bottom nav hide on scroll
  let lastScrollTop = 0;
  const mainContent = document.getElementById('mainContent');
  if (mainContent) {
    mainContent.addEventListener('scroll', () => {
      const st = mainContent.scrollTop;
      const bottomNav = document.getElementById('bottomNav');
      if (!bottomNav) return;
      if (st > lastScrollTop && st > 60) {
        bottomNav.style.transform = 'translateX(-50%) translateY(100%)';
      } else {
        bottomNav.style.transform = 'translateX(-50%) translateY(0)';
      }
      lastScrollTop = st;
    });
  }
}

export function updateShellUser(user) {
  currentUser = user;
  const header = document.getElementById('appHeader');
  const bottomNav = document.getElementById('bottomNav');
  const mainContent = document.getElementById('mainContent');
  if (!header || !bottomNav || !mainContent) return;
  if (user) {
    header.style.display = 'flex';
    bottomNav.style.display = 'flex';
    mainContent.style.paddingBottom = 'calc(var(--nav-height) + 16px)';
    updateBadge(user.id);
    updateChatBadge(user.id);
    startActiveTracking();
  } else {
    header.style.display = 'none';
    bottomNav.style.display = 'none';
    mainContent.style.paddingBottom = '0';
    const notifBadge = document.getElementById('notificationBadge'); if (notifBadge) notifBadge.style.display = 'none';
    const chatBadge = document.getElementById('chatBadge'); if (chatBadge) chatBadge.style.display = 'none';
    stopActiveTracking();
  }
}