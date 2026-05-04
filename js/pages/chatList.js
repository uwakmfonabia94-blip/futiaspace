// js/pages/chatList.js
import { supabase } from '../supabase.js';
import { getCurrentUser } from '../ui/shell.js';
import { escapeHtml, timeAgo, getAvatarHtml } from '../lib/utils.js';

let unreadInterval = null;

export async function renderChatList() {
  const main = document.getElementById('mainContent');
  if (!main) return;
  const user = getCurrentUser();
  const userId = user.id;

  main.innerHTML = `
    <div class="chat-list-page">
      <h2 style="padding:16px;">Chats</h2>
      <div id="chatListContainer">
        <p class="empty-text">Loading...</p>
      </div>
    </div>
  `;

  await loadChatList(userId);
  startUnreadPolling(userId);
}

async function loadChatList(userId) {
  const container = document.getElementById('chatListContainer');
  if (!container) return;

  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, sender_id, receiver_id, content, created_at, status, read, sender:profiles!sender_id(full_name, avatar_url), receiver:profiles!receiver_id(full_name, avatar_url)')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false });

  if (error || !messages || messages.length === 0) {
    container.innerHTML = '<p class="empty-text">No conversations yet.</p>';
    return;
  }

  const conversations = new Map();
  messages.forEach(msg => {
    const partnerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
    const partner = msg.sender_id === userId ? msg.receiver : msg.sender;
    if (!conversations.has(partnerId)) {
      conversations.set(partnerId, {
        partnerId,
        partner,
        lastMessage: msg.content,
        lastTime: msg.created_at,
        unreadCount: (msg.receiver_id === userId && !msg.read) ? 1 : 0
      });
    } else {
      if (msg.receiver_id === userId && !msg.read) {
        conversations.get(partnerId).unreadCount += 1;
      }
    }
  });

  const html = Array.from(conversations.values()).map(conv => `
    <div class="chat-list-item" onclick="window.location.hash='#/chat/${conv.partnerId}'">
      <div class="chat-list-avatar">${getAvatarHtml(conv.partner)}</div>
      <div class="chat-list-info">
        <strong>${escapeHtml(conv.partner.full_name)}</strong>
        <span>${escapeHtml(conv.lastMessage.substring(0, 40))}${conv.lastMessage.length > 40 ? '…' : ''}</span>
      </div>
      <div class="chat-list-meta">
        <span class="chat-list-time">${timeAgo(conv.lastTime)}</span>
        ${conv.unreadCount > 0 ? `<span class="badge unread-badge">${conv.unreadCount}</span>` : ''}
      </div>
    </div>
  `).join('');

  container.innerHTML = html;
  lucide.createIcons({ target: container });
}

export async function updateChatBadge(userId) {
  if (!userId) return;
  const { count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', userId)
    .eq('read', false)
    .eq('status', 'accepted');
  if (error) return;
  const badge = document.getElementById('chatBadge');
  if (badge) {
    badge.textContent = count > 0 ? count : '';
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}

function startUnreadPolling(userId) {
  if (unreadInterval) clearInterval(unreadInterval);
  unreadInterval = setInterval(() => updateChatBadge(userId), 5000);
}

window.addEventListener('hashchange', () => {
  if (!window.location.hash.startsWith('#/chats') && unreadInterval) {
    clearInterval(unreadInterval);
    unreadInterval = null;
  }
});