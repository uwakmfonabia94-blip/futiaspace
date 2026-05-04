// js/pages/chatDetail.js
import { supabase } from '../supabase.js';
import { getCurrentUser } from '../ui/shell.js';
import { escapeHtml, timeAgo, getAvatarHtml } from '../lib/utils.js';
import { showToast } from '../ui/toast.js';
import { updateChatBadge } from './chatList.js';

let realtimeChannel = null;

export async function renderChatDetail(otherUserId) {
  const main = document.getElementById('mainContent');
  if (!main) return;
  const currentUser = getCurrentUser();
  const currentUserId = currentUser.id;

  const { data: partner, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, last_active')
    .eq('id', otherUserId)
    .single();

  if (error || !partner) {
    main.innerHTML = `<div class="empty-state">User not found.</div>`;
    return;
  }

  main.innerHTML = `
    <div class="chat-detail-page">
      <div class="chat-header">
        <button class="chat-back-btn" onclick="window.history.back()"><i data-lucide="arrow-left"></i></button>
        <div class="chat-header-info">
          <div class="chat-header-avatar">${getAvatarHtml(partner)}</div>
          <div>
            <strong>${escapeHtml(partner.full_name)}</strong>
            <span class="chat-last-seen">${getLastSeenText(partner.last_active)}</span>
          </div>
        </div>
      </div>
      <div id="chatMessagesContainer" class="chat-messages"></div>
      <div class="chat-input-area">
        <input type="text" id="chatInput" placeholder="Message..." class="chat-input" maxlength="500" />
        <button id="chatSendBtn" class="btn btn-sm btn-primary"><i data-lucide="send"></i></button>
      </div>
      <p class="chat-privacy-note"><i data-lucide="lock"></i> Messages are private.</p>
    </div>
  `;
  lucide.createIcons({ target: main });

  await loadMessages(otherUserId, currentUserId);
  scrollToBottom();
  subscribeToMessages(otherUserId, currentUserId);
  await markMessagesAsRead(otherUserId, currentUserId);

  const sendBtn = document.getElementById('chatSendBtn');
  const input = document.getElementById('chatInput');
  sendBtn.addEventListener('click', () => sendMessage(otherUserId, currentUserId));
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage(otherUserId, currentUserId);
  });
}

async function loadMessages(otherUserId, currentUserId) {
  const container = document.getElementById('chatMessagesContainer');
  if (!container) return;

  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, sender_id, content, status, created_at')
    .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`)
    .eq('status', 'accepted')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Load messages error:', error);
    container.innerHTML = '<p class="empty-text">Could not load messages.</p>';
    return;
  }
  if (!messages || messages.length === 0) {
    container.innerHTML = '<p class="empty-text">No messages yet. Send a message to start the conversation.</p>';
    return;
  }

  container.innerHTML = messages.map(msg => {
    const isMine = msg.sender_id === currentUserId;
    return `
      <div class="message-row ${isMine ? 'mine' : 'theirs'}">
        <div class="message-bubble">
          <p>${escapeHtml(msg.content)}</p>
          <span class="message-time">${timeAgo(msg.created_at)}</span>
        </div>
      </div>
    `;
  }).join('');
}

async function markMessagesAsRead(otherUserId, currentUserId) {
  await supabase
    .from('messages')
    .update({ read: true })
    .eq('receiver_id', currentUserId)
    .eq('sender_id', otherUserId)
    .eq('status', 'accepted');
  // Update the global chat badge after marking as read
  await updateChatBadge(currentUserId);
}

async function sendMessage(receiverId, senderId) {
  const input = document.getElementById('chatInput');
  const content = input.value.trim();
  if (!content) return;

  // Optimistic insert
  const container = document.getElementById('chatMessagesContainer');
  const messageHtml = `
    <div class="message-row mine">
      <div class="message-bubble">
        <p>${escapeHtml(content)}</p>
        <span class="message-time">Just now</span>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', messageHtml);
  scrollToBottom();

  const { error } = await supabase.from('messages').insert({
    sender_id: senderId,
    receiver_id: receiverId,
    content,
    status: 'accepted'
  });

  if (error) {
    showToast('Could not send message', 'error');
    const lastMsg = container.lastElementChild;
    if (lastMsg && lastMsg.querySelector('p').innerText === content) lastMsg.remove();
    return;
  }
  input.value = '';
}

function subscribeToMessages(otherUserId, currentUserId) {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase
    .channel(`chat-${[currentUserId, otherUserId].sort().join('-')}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `sender_id=eq.${otherUserId} and receiver_id=eq.${currentUserId}`
    }, () => {
      loadMessages(otherUserId, currentUserId);
      markMessagesAsRead(otherUserId, currentUserId);
      scrollToBottom();
    })
    .subscribe();
}

function scrollToBottom() {
  const container = document.getElementById('chatMessagesContainer');
  if (container) setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
}

function getLastSeenText(lastActive) {
  if (!lastActive) return '';
  const diffSec = (Date.now() - new Date(lastActive).getTime()) / 1000;
  if (diffSec < 300) return 'Active now';
  const hours = Math.floor(diffSec / 3600);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Active ${days}d ago`;
  return 'Last seen ' + new Date(lastActive).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

window.addEventListener('hashchange', () => {
  if (!window.location.hash.startsWith('#/chat/') && realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
});