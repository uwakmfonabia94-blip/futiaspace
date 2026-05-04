// js/pages/profile.js
import { supabase } from '../supabase.js';
import { getCurrentUser } from '../ui/shell.js';
import { escapeHtml, timeAgo, getAvatarHtml, getVerifiedBadge } from '../lib/utils.js';
import { showToast } from '../ui/toast.js';
import { showConfirm } from '../ui/modal.js';
import { triggerPush } from '../lib/onesignal.js';

let currentViewerId = null;

export async function renderProfile(userId) {
  const main = document.getElementById('mainContent');
  if (!main) return;
  const viewer = getCurrentUser();
  currentViewerId = viewer.id;
  const isOwnProfile = userId === currentViewerId;

  const [
    { data: profile },
    { data: friendshipsResult },
    mutualCountResult,
    { data: recentPosts }
  ] = await Promise.all([
    supabase.from('profiles')
      .select('id, full_name, department, level, gender, bio, avatar_url, referral_code, created_at, last_active, poke_count, is_verified')
      .eq('id', userId)
      .single(),
    supabase.from('friendships')
      .select('sender_id, receiver_id')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .eq('status', 'accepted')
      .limit(30),
    supabase.rpc('get_mutual_friend_count', { user_a: currentViewerId, user_b: userId }),
    supabase.from('posts')
      .select('id, content, feeling_type, created_at, share_count, edited_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5)
  ]);

  if (!profile) {
    main.innerHTML = `<div class="empty-state">User not found.</div>`;
    return;
  }

  const mutualCount = mutualCountResult?.data || 0;
  const friendIds = [...new Set((friendshipsResult || []).map(r =>
    r.sender_id === userId ? r.receiver_id : r.sender_id
  ))].slice(0, 30);
  let friendsProfiles = [];
  if (friendIds.length) {
    const { data: friendsData } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, is_verified')
      .in('id', friendIds);
    friendsProfiles = friendsData || [];
  }

  let friendship = null;
  if (!isOwnProfile) {
    const { data } = await supabase
      .from('friendships')
      .select('id, sender_id, receiver_id, status')
      .or(`and(sender_id.eq.${currentViewerId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${currentViewerId})`)
      .maybeSingle();
    friendship = data;
  }

  const isFriend = friendship?.status === 'accepted';
  const isPendingSent = friendship?.status === 'pending' && friendship.sender_id === currentViewerId;
  const isPendingReceived = friendship?.status === 'pending' && friendship.receiver_id === currentViewerId;

  const activeStatusHTML = getActiveStatusHTML(profile.last_active);
  const joined = formatJoined(profile.created_at);
  const completionPercent = isOwnProfile ? calcCompletion(profile) : null;
  const verifiedBadge = getVerifiedBadge(profile.is_verified, profile.id);

  const buttonsHTML = isOwnProfile ? `
    <button class="btn btn-secondary" onclick="window.location.hash='#/settings'">Edit Profile</button>
  ` : `
    ${!friendship ? `<button class="btn btn-primary btn-add-friend">Add Friend</button>` : ''}
    ${isPendingSent ? `<button class="btn btn-secondary" disabled>Request Sent</button>` : ''}
    ${isPendingReceived ? `
      <div class="friend-request-actions">
        <button class="btn btn-primary btn-accept-friend" data-friendship-id="${friendship.id}">Accept</button>
        <button class="btn btn-secondary btn-decline-friend" data-friendship-id="${friendship.id}">Decline</button>
      </div>` : ''}
    ${isFriend ? `<span class="friend-badge"><i data-lucide="check-circle"></i> Friends</span>` : ''}
    <button class="btn btn-primary btn-sm" onclick="window.location.hash='#/chat/${userId}'" style="margin-top:8px;">
      <i data-lucide="message-circle"></i> Message
    </button>
  `;

  main.innerHTML = `
    <div class="profile-page">
      <div class="profile-header">
        <div class="profile-avatar-large">
          ${getAvatarHtml(profile)}
          ${activeStatusHTML ? `<span class="active-dot" title="${activeStatusHTML}"></span>` : ''}
        </div>
        <h2 class="profile-name">${escapeHtml(profile.full_name)} ${verifiedBadge}</h2>
        <p class="profile-dept-level">${escapeHtml(profile.department)} · ${profile.level}L · ${profile.gender}</p>
        ${profile.bio ? `<p class="profile-bio">${escapeHtml(profile.bio)}</p>` : ''}
        <p class="profile-joined"><i data-lucide="calendar"></i> Joined ${joined}</p>
        ${activeStatusHTML ? `<p class="profile-active">${activeStatusHTML}</p>` : ''}
        <div class="profile-stats">
          <span><strong>${profile.poke_count}</strong> interactions</span>
          ${mutualCount > 0 ? `<span><strong>${mutualCount}</strong> mutual friends</span>` : ''}
        </div>
        ${isOwnProfile && completionPercent !== null ? `
          <div class="completion-bar">
            <div class="completion-fill" style="width:${completionPercent}%"></div>
            <span>Profile ${completionPercent}% complete</span>
          </div>` : ''}
        <div class="profile-actions">
          ${buttonsHTML}
        </div>
      </div>
      <div class="profile-friends-section">
        <h3 class="section-title">Friends</h3>
        <div class="friends-grid">
          ${friendsProfiles.length === 0 ? '<p class="empty-text">No friends yet.</p>' :
            friendsProfiles.map(f => `
              <div class="friend-card clickable" onclick="window.location.hash='#/profile/${f.id}'">
                ${getAvatarHtml(f)}
                <span class="friend-name">${escapeHtml(f.full_name.split(' ')[0])} ${getVerifiedBadge(f.is_verified, f.id)}</span>
              </div>`).join('')}
        </div>
      </div>
      <div class="profile-posts-section">
        <h3 class="section-title">Recent Posts</h3>
        ${recentPosts?.length ? recentPosts.map(post => renderProfilePost(post, isOwnProfile, profile.full_name, profile.is_verified)).join('') : '<p class="empty-text">No posts yet.</p>'}
      </div>
    </div>
  `;

  lucide.createIcons({ target: main });
  if (window.twemoji) window.twemoji.parse(main);
  attachProfilePostEvents(isOwnProfile, userId);

  if (!isOwnProfile) {
    const addBtn = document.querySelector('.btn-add-friend');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const { error } = await supabase.from('friendships').insert({ sender_id: currentViewerId, receiver_id: userId, status: 'pending' });
        if (!error) {
          showToast('Friend request sent', 'success');
          renderProfile(userId);
          // Push notification
          const currentUser = getCurrentUser();
          await triggerPush(
            userId,
            `Friend request from ${currentUser.full_name}`,
            `${currentUser.full_name} wants to connect with you.`,
            { type: 'friend_request', from_user_id: currentViewerId }
          );
        } else {
          showToast('Error sending request', 'error');
        }
      });
    }
    const acceptBtn = document.querySelector('.btn-accept-friend');
    if (acceptBtn) {
      acceptBtn.addEventListener('click', async () => {
        await supabase.from('friendships').update({ status: 'accepted' }).eq('id', acceptBtn.dataset.friendshipId);
        showToast('Friend added!', 'success');
        renderProfile(userId);
      });
    }
    const declineBtn = document.querySelector('.btn-decline-friend');
    if (declineBtn) {
      declineBtn.addEventListener('click', async () => {
        await supabase.from('friendships').update({ status: 'declined' }).eq('id', declineBtn.dataset.friendshipId);
        showToast('Request declined', 'info');
        renderProfile(userId);
      });
    }
  }
}

function renderProfilePost(post, isOwn, authorName, isVerified) {
  const feeling = post.feeling_type ? feelings.find(f => f.id === post.feeling_type) : null;
  const feelingHtml = feeling
    ? `<div class="feeling-text"><img src="https://twemoji.maxcdn.com/v/14.0.2/72x72/${feeling.code.toString(16)}.png" class="twemoji-inline" alt="${feeling.label}" /> ${authorName} is feeling ${feeling.label}</div>`
    : '';
  const editedLabel = post.edited_at ? `<span class="edited-label" title="Edited ${timeAgo(post.edited_at)}">(edited)</span>` : '';
  const verifiedBadge = getVerifiedBadge(isVerified, '');
  return `
    <div class="profile-post-item" data-post-id="${post.id}">
      <div class="post-text">${feelingHtml}${escapeHtml(post.content)}</div>
      <div class="post-meta-actions">
        <span class="post-meta">${timeAgo(post.created_at)} ${editedLabel}</span>
        ${isOwn ? `
          <div class="post-menu-wrapper">
            <button class="post-menu-btn"><i data-lucide="more-horizontal"></i></button>
            <div class="post-dropdown" style="display:none;">
              <button class="dropdown-item edit-post-btn" data-post-id="${post.id}" data-post-content="${escapeHtml(post.content)}" data-feeling="${post.feeling_type || ''}"><i data-lucide="edit-2"></i> Edit</button>
              <button class="dropdown-item delete-post-btn" data-post-id="${post.id}"><i data-lucide="trash-2"></i> Delete</button>
            </div>
          </div>` : `
          <div class="post-menu-wrapper">
            <button class="post-menu-btn"><i data-lucide="more-horizontal"></i></button>
            <div class="post-dropdown" style="display:none;">
              <button class="dropdown-item copy-link-btn" data-post-id="${post.id}"><i data-lucide="link"></i> Copy Link</button>
              <button class="dropdown-item report-post-btn" data-post-id="${post.id}"><i data-lucide="flag"></i> Report</button>
            </div>
          </div>`}
      </div>
    </div>
  `;
}

function attachProfilePostEvents(isOwn, userId) {
  document.querySelectorAll('.post-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dd = btn.nextElementSibling;
      dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
    });
  });
  window.addEventListener('click', () => document.querySelectorAll('.post-dropdown').forEach(d => d.style.display = 'none'));

  if (isOwn) {
    document.querySelectorAll('.edit-post-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const postId = btn.dataset.postId;
        const oldContent = btn.dataset.postContent;
        const oldFeeling = btn.dataset.feeling;
        const newContent = prompt('Edit your post:', oldContent);
        if (newContent === null || newContent.trim() === '') return;
        const updateData = {
          content: newContent.trim(),
          edited_at: new Date().toISOString()
        };
        if (oldFeeling) updateData.feeling_type = oldFeeling;
        const { error } = await supabase.from('posts').update(updateData).eq('id', postId);
        if (error) showToast('Could not edit post', 'error');
        else {
          showToast('Post updated', 'success');
          renderProfile(userId);
        }
      });
    });
    document.querySelectorAll('.delete-post-btn').forEach(btn => btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await showConfirm('Delete Post', 'Are you sure?');
      if (confirmed) {
        await supabase.from('posts').delete().eq('id', btn.dataset.postId);
        showToast('Post deleted', 'success');
        renderProfile(userId);
      }
    }));
  } else {
    document.querySelectorAll('.copy-link-btn').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(window.location.href);
      showToast('Link copied', 'success');
    }));
    document.querySelectorAll('.report-post-btn').forEach(btn => btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await showConfirm('Report Post', 'Report this post?');
      if (confirmed) {
        await supabase.from('reports').insert({ post_id: btn.dataset.postId, reporter_id: currentViewerId, reason: 'inappropriate' });
        showToast('Report submitted', 'success');
      }
    }));
  }
}

function getActiveStatusHTML(lastActive) {
  if (!lastActive) return '';
  const diffSec = (Date.now() - new Date(lastActive).getTime()) / 1000;
  if (diffSec < 300) return 'Active now';
  const hours = Math.floor(diffSec / 3600);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Active ${days}d ago`;
  return 'Last seen ' + new Date(lastActive).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function calcCompletion(profile) {
  let filled = 0;
  if (profile.full_name) filled++;
  if (profile.bio) filled++;
  if (profile.avatar_url) filled++;
  if (profile.level) filled++;
  return Math.round((filled / 4) * 100);
}

function formatJoined(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

const feelings = [
  { id: 'happy', code: 0x1F60A }, { id: 'sad', code: 0x1F622 }, { id: 'angry', code: 0x1F620 },
  { id: 'excited', code: 0x1F929 }, { id: 'tired', code: 0x1F62B }, { id: 'blessed', code: 0x1F60C },
  { id: 'grateful', code: 0x1F64F }, { id: 'cool', code: 0x1F60E }, { id: 'funny', code: 0x1F602 },
  { id: 'love', code: 0x1F60D }, { id: 'sick', code: 0x1F912 }, { id: 'worried', code: 0x1F61F }
];