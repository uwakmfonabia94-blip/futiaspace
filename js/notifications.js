/**
 * FutiaSpace — js/notifications.js
 *
 * Handles the notifications page (#/notifications) and the
 * unread badge on the bottom nav bell icon.
 *
 * Features:
 *  • Fetch + render notification list (poke type, V1)
 *  • Skeleton loading → real items → empty state
 *  • Unread dot on individual items
 *  • Click item → navigate to the poker's profile + mark as read
 *  • "Mark all read" button
 *  • Real-time badge update via Supabase Realtime channel
 *  • getUnreadCount() — called by router.js on login and
 *    by poke.js after a poke is sent
 *  • updateNotifBadge(count) — updates the bottom nav badge
 */

import { supabase }              from './supabase.js';
import { navigate,
         getCurrentProfile }     from './router.js';
import {
  showToast,
  renderAvatar,
  formatTimeAgo,
  escapeHtml,
}                                from './utils.js';


// ════════════════════════════════════════════════════════════════
// REALTIME CHANNEL  — kept as module-level so we can unsubscribe
// ════════════════════════════════════════════════════════════════
let _realtimeChannel = null;


// ════════════════════════════════════════════════════════════════
// 1.  PUBLIC API
// ════════════════════════════════════════════════════════════════

/**
 * Initialise the notifications page.
 * Called by router.js every time #/notifications becomes active.
 */
export async function initNotifications() {
  _wireMarkAllRead();
  await _loadNotifications();
  _subscribeRealtime();
}

/**
 * Get the current unread notification count for the logged-in user.
 * Called by router.js on login and by poke.js after sending a poke.
 * @returns {Promise<number>}
 */
export async function getUnreadCount() {
  const me = getCurrentProfile();
  if (!me) return 0;

  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', me.id)
      .eq('read', false);

    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

/**
 * Update the unread badge in the bottom nav.
 * Called by router.js after login and by poke.js after a poke.
 * @param {number} count
 */
export function updateNotifBadge(count) {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;

  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}


// ════════════════════════════════════════════════════════════════
// 2.  LOAD + RENDER NOTIFICATIONS
// ════════════════════════════════════════════════════════════════

async function _loadNotifications() {
  const me = getCurrentProfile();
  if (!me) return;

  const listEl   = document.getElementById('notifications-list');
  const skelEl   = document.getElementById('notif-skeleton');
  const emptyEl  = document.getElementById('notif-empty-state');

  if (!listEl) return;

  // Show skeletons, hide list + empty state
  if (skelEl)   skelEl.classList.remove('hidden');
  listEl.innerHTML = '';
  if (emptyEl)  emptyEl.classList.add('hidden');

  try {
    // Fetch notifications with the sender's profile in one join
    const { data, error } = await supabase
      .from('notifications')
      .select(`
        id,
        type,
        read,
        created_at,
        from_user:profiles!notifications_from_user_id_fkey (
          id,
          full_name,
          avatar_url,
          department,
          level
        )
      `)
      .eq('user_id', me.id)
      .order('created_at', { ascending: false })
      .limit(50);

    // Hide skeletons
    if (skelEl) skelEl.classList.add('hidden');

    if (error) {
      showToast('Could not load notifications.', 'error');
      return;
    }

    const notifications = data || [];

    if (notifications.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    // Render items
    notifications.forEach(notif => {
      const item = _buildNotifItem(notif);
      listEl.appendChild(item);
    });

    _renderPageIcons('notifications-list');

    // After rendering, mark ALL fetched notifications as read in the DB
    // (they're visually shown so the user has "seen" them)
    await _markAllAsRead(me.id);
    updateNotifBadge(0);

  } catch (err) {
    if (skelEl) skelEl.classList.add('hidden');
    console.error('[notifications] load error:', err);
    showToast('Something went wrong loading notifications.', 'error');
  }
}


// ════════════════════════════════════════════════════════════════
// 3.  NOTIFICATION ITEM BUILDER
// ════════════════════════════════════════════════════════════════

/**
 * Build a single notification list item element.
 * @param  {Object} notif  Row from notifications table + joined from_user profile.
 * @returns {HTMLElement}
 */
function _buildNotifItem(notif) {
  const sender = notif.from_user;
  const item   = document.createElement('div');

  item.className  = `notif-item${notif.read ? '' : ' unread'}`;
  item.setAttribute('role', 'listitem');
  item.setAttribute('tabindex', '0');
  item.dataset.id = notif.id;

  // ── Avatar HTML ───────────────────────────────────────────────
  const initials  = _initials(sender?.full_name || '?');
  const avatarHtml = sender?.avatar_url
    ? `<img
          src="${escapeHtml(sender.avatar_url)}"
          alt="${escapeHtml(sender?.full_name || 'Student')}"
          class="notif-avatar-img"
          loading="lazy"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
        >
        <div class="notif-avatar-initials" style="display:none" aria-hidden="true">${initials}</div>`
    : `<div class="notif-avatar-initials" aria-hidden="true">${initials}</div>`;

  // ── Message text ──────────────────────────────────────────────
  const senderName = escapeHtml(sender?.full_name || 'Someone');
  const timeStr    = formatTimeAgo(notif.created_at);

  // V1 only has 'poke' type — future types extend here
  const bodyText = notif.type === 'poke'
    ? `<strong>${senderName}</strong> poked you`
    : `<strong>${senderName}</strong> sent you a notification`;

  item.innerHTML = `
    <div class="notif-avatar-wrap">
      ${avatarHtml}
      <div class="notif-type-badge" aria-hidden="true">
        <i data-lucide="zap"></i>
      </div>
    </div>
    <div class="notif-text">
      <p class="notif-body">${bodyText}</p>
      <p class="notif-time">${escapeHtml(timeStr)}</p>
    </div>
  `;

  // ── Click → navigate to poker's profile ──────────────────────
  const handleClick = () => {
    if (sender?.id) {
      // Mark this item as visually read
      item.classList.remove('unread');
      navigate(`#/profile/${sender.id}`);
    }
  };

  item.addEventListener('click', handleClick);
  item.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  });

  return item;
}


// ════════════════════════════════════════════════════════════════
// 4.  MARK AS READ
// ════════════════════════════════════════════════════════════════

/** Wire the "Mark all read" button. */
function _wireMarkAllRead() {
  const btn = document.getElementById('btn-mark-all-read');
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';

  btn.addEventListener('click', async () => {
    const me = getCurrentProfile();
    if (!me) return;

    // Visual update first — mark all items in the DOM
    document.querySelectorAll('#notifications-list .notif-item.unread')
      .forEach(el => el.classList.remove('unread'));

    // Update badge
    updateNotifBadge(0);

    // Persist to DB
    await _markAllAsRead(me.id);
  });
}

/**
 * Mark all of a user's notifications as read in the DB.
 * @param {string} userId
 */
async function _markAllAsRead(userId) {
  try {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
  } catch (err) {
    console.error('[notifications] markAllAsRead error:', err);
  }
}


// ════════════════════════════════════════════════════════════════
// 5.  REALTIME SUBSCRIPTION
//     Listens for new notifications on the current user's channel.
//     When a new poke notification arrives, it increments the badge
//     and prepends the item to the list if the page is open.
// ════════════════════════════════════════════════════════════════

function _subscribeRealtime() {
  const me = getCurrentProfile();
  if (!me) return;

  // Only one subscription per session
  if (_realtimeChannel) return;

  _realtimeChannel = supabase
    .channel(`notifications:${me.id}`)
    .on(
      'postgres_changes',
      {
        event : 'INSERT',
        schema: 'public',
        table : 'notifications',
        filter: `user_id=eq.${me.id}`,
      },
      async (payload) => {
        await _handleNewNotification(payload.new);
      }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.warn('[notifications] realtime channel error — badge will update on next visit');
      }
    });
}

/**
 * Handle a new notification arriving via Realtime.
 * @param {Object} newRow  The inserted notifications row (without joined data).
 */
async function _handleNewNotification(newRow) {
  if (!newRow) return;

  // Always update the badge count regardless of which page is active
  const count = await getUnreadCount();
  updateNotifBadge(count);

  // If the notifications page is currently visible, prepend the new item
  const listEl = document.getElementById('notifications-list');
  const page   = document.getElementById('page-notifications');
  const isOnPage = page && !page.classList.contains('hidden') &&
                   page.classList.contains('page-active');

  if (isOnPage && listEl) {
    // Fetch the sender's profile for the new item
    const { data: sender } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, department, level')
      .eq('id', newRow.from_user_id)
      .single();

    if (!sender) return;

    const enriched = { ...newRow, from_user: sender };
    const item     = _buildNotifItem(enriched);

    // Hide empty state if it was showing
    document.getElementById('notif-empty-state')?.classList.add('hidden');

    // Prepend with a brief fade-in
    item.style.opacity   = '0';
    item.style.transform = 'translateY(-8px)';
    listEl.prepend(item);

    // Trigger animation
    requestAnimationFrame(() => {
      item.style.transition = 'opacity 250ms ease, transform 250ms ease';
      item.style.opacity    = '1';
      item.style.transform  = 'translateY(0)';
    });

    _renderPageIcons(item);

    // Mark as read immediately since the user is looking at the page
    await _markAllAsRead(getCurrentProfile()?.id);
    updateNotifBadge(0);
  }
}


// ════════════════════════════════════════════════════════════════
// 6.  HELPERS
// ════════════════════════════════════════════════════════════════

function _initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function _renderPageIcons(target) {
  if (!window.lucide) return;
  const el = typeof target === 'string'
    ? document.getElementById(target)
    : target;
  if (el) window.lucide.createIcons({ icons: window.lucide.icons, rootElement: el });
}