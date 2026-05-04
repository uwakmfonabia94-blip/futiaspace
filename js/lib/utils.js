// js/lib/utils.js
import { supabase } from '../supabase.js';

export function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function timeAgo(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now - date) / 1000);
  const intervals = [
    [31536000, 'year'],
    [2592000, 'month'],
    [604800, 'week'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute']
  ];
  for (let [unitSeconds, unitName] of intervals) {
    const interval = Math.floor(seconds / unitSeconds);
    if (interval >= 1) return interval === 1 ? `1 ${unitName} ago` : `${interval} ${unitName}s ago`;
  }
  return 'Just now';
}

export function getAvatarHtml(user) {
  if (!user) return '<div class="avatar-placeholder" style="background:#444;">?</div>';
  if (user.avatar_url) {
    return `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.full_name)}" class="avatar-img" onclick="event.stopPropagation(); window.openImageViewer('${escapeHtml(user.avatar_url)}')" />`;
  }
  const initials = (user.full_name || '?').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const bg = stringToColor(user.id || '');
  return `<div class="avatar-placeholder" style="background-color:${bg};">${initials}</div>`;
}

export function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return '#' + '00000'.substring(0, 6 - c.length) + c;
}

export function getVerifiedBadge(isVerified, userId) {
  if (!isVerified) return '';
  // Facebook-style blue circle with white checkmark
  return `<span class="verified-badge" title="Verified student">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="none">
      <circle cx="12" cy="12" r="12" fill="#1D9BF0" />
      <polyline points="7 12 10 15 17 8" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
    </svg>
  </span>`;
}

export async function canSendFriendRequest(currentUserId, targetUserId, supabase) {
  const { data: existing } = await supabase
    .from('friendships')
    .select('id, status')
    .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${currentUserId})`)
    .maybeSingle();
  if (existing) {
    if (existing.status === 'pending') {
      return { allowed: false, message: 'Friend request already sent' };
    }
    if (existing.status === 'accepted') {
      return { allowed: false, message: 'You are already friends' };
    }
    return { allowed: false, message: 'Request already exists' };
  }
  return { allowed: true, message: '' };
}