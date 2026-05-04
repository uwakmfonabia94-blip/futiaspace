// js/pages/notifications.js
import { supabase } from '../supabase.js';
import { getCurrentUser } from '../ui/shell.js';
import { escapeHtml, timeAgo, getAvatarHtml } from '../lib/utils.js';
import { showToast } from '../ui/toast.js';
import { navigate } from '../router.js';

let realtimeChannel = null;

export async function renderNotifications() {
  const main = document.getElementById('mainContent');
  if (!main) return;
  const user = getCurrentUser();
  if (!user) return;
  const userId = user.id;

  main.innerHTML = `
    <div class="notifications-page">
      <h2>Notifications</h2>
      <div id="notificationsList">
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

  const { data: notifications, error } = await supabase
    .from('notifications')
    .select('id, type, from_user_id, friend_request_id, message_id, read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    container.innerHTML = `<p class="empty-text">Failed to load.</p>`;
    return;
  }
  if (!notifications || notifications.length === 0) {
    container.innerHTML = `<p class="empty-text">No notifications yet.</p>`;
    return;
  }

  const senderIds = [...new Set(notifications.map(n => n.from_user_id))];
  const { data: senders } = await supabase.from('profiles').select('id, full_name, avatar_url').in('id', senderIds);
  const senderMap = Object.fromEntries((senders || []).map(s => [s.id, s]));

  container.innerHTML = notifications.map(notif => {
    const fromUser = senderMap[notif.from_user_id] || { full_name: 'Unknown', avatar_url: null, id: notif.from_user_id };
    let msg = '', actionButtons = '', tapTarget = '';

    switch (notif.type) {
      case 'friend_request':
        msg = `<strong>${escapeHtml(fromUser.full_name)}</strong> sent you a friend request.`;
        tapTarget = `/profile/${fromUser.id}`;
        if (notif.friend_request_id && !notif.read) {
          actionButtons = `<div class="notif-actions" data-notif-id="${notif.id}" data-friendship-id="${notif.friend_request_id}"><button class="btn-accept-friend" data-friendship-id="${notif.friend_request_id}" data-notif-id="${notif.id}">Accept</button><button class="btn-decline-friend" data-friendship-id="${notif.friend_request_id}" data-notif-id="${notif.id}">Decline</button></div>`;
        }
        break;
      case 'friend_accepted':
        msg = `<strong>${escapeHtml(fromUser.full_name)}</strong> accepted your friend request.`;
        tapTarget = `/profile/${fromUser.id}`;
        break;
      case 'message_request':
        msg = `<strong>${escapeHtml(fromUser.full_name)}</strong> sent you a message.`;
        tapTarget = `/chat/${fromUser.id}`;
        if (notif.message_id) {
          actionButtons = `<div class="notif-actions" data-notif-id="${notif.id}" data-message-id="${notif.message_id}"><button class="btn-accept-message" data-message-id="${notif.message_id}" data-notif-id="${notif.id}">Accept</button><button class="btn-decline-message" data-message-id="${notif.message_id}" data-notif-id="${notif.id}">Decline</button></div>`;
        }
        break;
      case 'like':
        msg = `<strong>${escapeHtml(fromUser.full_name)}</strong> liked your post.`;
        tapTarget = `/profile/${fromUser.id}`;
        break;
      case 'comment':
        msg = `<strong>${escapeHtml(fromUser.full_name)}</strong> commented on your post.`;
        tapTarget = `/profile/${fromUser.id}`;
        break;
      default: msg = '';
    }

    return `<div class="notification-item ${notif.read ? 'read' : 'unread'}" data-notif-id="${notif.id}" data-target="${tapTarget}">
      <div class="notif-avatar">${getAvatarHtml(fromUser)}</div>
      <div class="notif-content">
        <p>${msg}</p>
        <span class="notif-time">${timeAgo(notif.created_at)}</span>
        ${actionButtons}
      </div>
    </div>`;
  }).join('');

  lucide.createIcons({ target: container });
  attachNotificationEvents(userId);
}

function attachNotificationEvents(userId) {
  // Mark read when clicked (but not on button clicks)
  document.querySelectorAll('.notification-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      if (e.target.closest('.notif-actions') || e.target.closest('button')) return;
      const notifId = item.dataset.notifId;
      const target = item.dataset.target;
      if (item.classList.contains('unread')) {
        await supabase.from('notifications').update({ read: true }).eq('id', notifId);
        item.classList.remove('unread');
        item.classList.add('read');
        updateBadge(userId);
      }
      if (target) navigate(target);
    });
  });

  // Accept friend request - mark notification as read and reload list
  document.querySelectorAll('.btn-accept-friend').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const friendshipId = btn.dataset.friendshipId;
      const notifId = btn.dataset.notifId;
      
      // Update friendship status
      const { error: friendError } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', friendshipId);
      
      if (friendError) {
        showToast('Error: ' + friendError.message, 'error');
        return;
      }
      
      // Mark the notification as read (so it won't show buttons again)
      await supabase.from('notifications').update({ read: true }).eq('id', notifId);
      
      showToast('Friend added!', 'success');
      // Reload notifications to remove the buttons
      await loadNotifications(userId);
      updateBadge(userId);
    });
  });

  // Decline friend request
  document.querySelectorAll('.btn-decline-friend').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const friendshipId = btn.dataset.friendshipId;
      const notifId = btn.dataset.notifId;
      
      await supabase.from('friendships').update({ status: 'declined' }).eq('id', friendshipId);
      await supabase.from('notifications').update({ read: true }).eq('id', notifId);
      
      showToast('Request declined', 'info');
      await loadNotifications(userId);
      updateBadge(userId);
    });
  });

  // Accept message request
  document.querySelectorAll('.btn-accept-message').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const msgId = btn.dataset.messageId;
      const notifId = btn.dataset.notifId;
      
      const { data: msg } = await supabase.from('messages').select('sender_id, receiver_id').eq('id', msgId).single();
      if (msg) {
        await supabase.from('messages').update({ status: 'accepted' }).eq('id', msgId);
        const { data: existing } = await supabase.from('friendships').select('id').or(`and(sender_id.eq.${msg.sender_id},receiver_id.eq.${msg.receiver_id}),and(sender_id.eq.${msg.receiver_id},receiver_id.eq.${msg.sender_id})`);
        if (!existing?.length) {
          await supabase.from('friendships').insert({ sender_id: msg.sender_id, receiver_id: msg.receiver_id, status: 'accepted' });
        }
        await supabase.from('notifications').update({ read: true }).eq('id', notifId);
        showToast('Message request accepted. You are now friends.', 'success');
        await loadNotifications(userId);
        updateBadge(userId);
      }
    });
  });

  document.querySelectorAll('.btn-decline-message').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const msgId = btn.dataset.messageId;
      const notifId = btn.dataset.notifId;
      await supabase.from('messages').update({ status: 'declined' }).eq('id', msgId);
      await supabase.from('notifications').update({ read: true }).eq('id', notifId);
      showToast('Message request declined.', 'info');
      await loadNotifications(userId);
      updateBadge(userId);
    });
  });
}

function subscribeNotifications(userId) {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase.channel(`notifications-${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, async () => {
      await loadNotifications(userId);
      updateBadge(userId);
    })
    .subscribe();
}

export async function updateBadge(userId) {
  if (!userId) return;
  const { count, error } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('read', false);
  if (error) return;
  const badge = document.getElementById('notificationBadge');
  if (badge) {
    badge.textContent = count > 0 ? count : '';
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}

window.addEventListener('hashchange', () => {
  if (!window.location.hash.startsWith('#/notifications') && realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
});