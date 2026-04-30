// js/pages/notifications.js
import { supabase } from '../supabase.js';
import { getCurrentUser } from '../ui/shell.js';
import { escapeHtml, timeAgo, getAvatarHtml } from '../lib/utils.js';
import { showToast } from '../ui/toast.js';

let realtimeChannel = null;

export async function renderNotifications() {
  const main = document.getElementById('mainContent');
  if (!main) return;

  const user = getCurrentUser();
  if (!user) return;
  const userId = user.id;

  main.innerHTML = `
    <div class="notifications-page">
      <h2 style="padding:16px;">Notifications</h2>
      <div id="notificationsList">
        <div class="skeleton-notif"></div>
        <div class="skeleton-notif"></div>
        <div class="skeleton-notif"></div>
      </div>
    </div>
  `;

  await loadNotifications(userId);
  subscribeNotifications(userId);
}

async function loadNotifications(userId) {
  const container = document.getElementById('notificationsList');
  if (!container) return;

  // Fetch notifications without joined profiles to avoid ambiguity
  const { data: notifications, error } = await supabase
    .from('notifications')
    .select('id, type, from_user_id, friend_request_id, read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    container.innerHTML = `<p style="text-align:center;padding:20px;">Failed to load notifications.</p>`;
    console.error(error);
    return;
  }

  if (!notifications || notifications.length === 0) {
    container.innerHTML = `<p style="text-align:center;padding:20px;color:var(--color-text-secondary);">No notifications yet.</p>`;
    return;
  }

  // Fetch unique sender profiles
  const senderIds = [...new Set(notifications.map(n => n.from_user_id))];
  const { data: senders } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', senderIds);
  const senderMap = Object.fromEntries((senders || []).map(s => [s.id, s]));

  container.innerHTML = notifications.map(notif => {
    const fromUser = senderMap[notif.from_user_id] || { full_name: 'Unknown', avatar_url: null };
    let msg = '';
    let actionButtons = '';

    switch (notif.type) {
      case 'friend_request':
        msg = `<strong>${escapeHtml(fromUser.full_name)}</strong> sent you a friend request.`;
        if (notif.friend_request_id && !notif.read) {   // only show actions if unread? or always? we'll keep if not read
          actionButtons = `
            <div class="notif-actions" data-friendship-id="${notif.friend_request_id}">
              <button class="btn-accept-friend" data-friendship-id="${notif.friend_request_id}">Accept</button>
              <button class="btn-decline-friend" data-friendship-id="${notif.friend_request_id}">Decline</button>
            </div>
          `;
        }
        break;
      case 'like':
        msg = `<strong>${escapeHtml(fromUser.full_name)}</strong> liked your post.`;
        break;
      case 'comment':
        msg = `<strong>${escapeHtml(fromUser.full_name)}</strong> commented on your post.`;
        break;
      default:
        msg = '';
    }

    return `
      <div class="notification-item ${notif.read ? 'read' : 'unread'}" data-notif-id="${notif.id}">
        <div class="notif-avatar" onclick="event.stopPropagation(); window.openImageViewer('${escapeHtml(fromUser.avatar_url || '')}')" style="cursor:${fromUser.avatar_url ? 'pointer' : 'default'};">
          ${getAvatarHtml(fromUser)}
        </div>
        <div class="notif-content">
          <p>${msg}</p>
          <span class="notif-time">${timeAgo(notif.created_at)}</span>
          ${actionButtons}
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons({ target: container });

  // Accept / Decline handlers
  container.querySelectorAll('.btn-accept-friend').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const friendshipId = btn.dataset.friendshipId;
      await respondFriendRequest(friendshipId, 'accepted', btn, userId);
    });
  });
  container.querySelectorAll('.btn-decline-friend').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const friendshipId = btn.dataset.friendshipId;
      await respondFriendRequest(friendshipId, 'declined', btn, userId);
    });
  });

  // Mark as read on click (only if unread)
  container.querySelectorAll('.notification-item.unread').forEach(item => {
    item.addEventListener('click', async function handler() {
      const notifId = item.dataset.notifId;
      await supabase.from('notifications').update({ read: true }).eq('id', notifId);
      item.classList.remove('unread');
      item.classList.add('read');
      updateBadge(userId);
      // Remove the event listener to avoid multiple triggers
      item.removeEventListener('click', handler);
    });
  });
}

async function respondFriendRequest(friendshipId, status, button, userId) {
  const { error } = await supabase.from('friendships').update({ status }).eq('id', friendshipId);
  if (error) {
    showToast('Update failed', 'error');
    return;
  }
  // Update UI inline
  const notifItem = button.closest('.notification-item');
  const actionsDiv = button.closest('.notif-actions');
  if (actionsDiv) {
    if (status === 'accepted') {
      actionsDiv.innerHTML = '<span style="color:var(--color-success); font-weight:500;">Friend request accepted</span>';
    } else {
      actionsDiv.innerHTML = '<span style="color:var(--color-text-muted); font-weight:500;">Friend request declined</span>';
    }
  }
  // Also update the notification to read if not already
  const notifId = notifItem.dataset.notifId;
  await supabase.from('notifications').update({ read: true }).eq('id', notifId);
  notifItem.classList.remove('unread');
  notifItem.classList.add('read');
  updateBadge(userId);
  showToast(status === 'accepted' ? 'Friend added!' : 'Request declined', 'success');
}

function subscribeNotifications(userId) {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);

  realtimeChannel = supabase
    .channel('notif-list')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`
    }, async () => {
      await loadNotifications(userId);
      updateBadge(userId);
    })
    .subscribe();
}

// ===== EXPORTED for shell.js =====
export async function updateBadge(userId) {
  if (!userId) return;
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) return;
  const badge = document.getElementById('notificationBadge');
  if (badge) {
    badge.textContent = count > 0 ? count : '';
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}

// Cleanup
window.addEventListener('hashchange', () => {
  if (!window.location.hash.startsWith('#/notifications')) {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
});