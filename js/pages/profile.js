// js/pages/profile.js
import { supabase } from '../supabase.js';
import { getCurrentUser } from '../ui/shell.js';
import { escapeHtml, timeAgo, getAvatarHtml } from '../lib/utils.js';

export async function renderProfile(userId) {
  const main = document.getElementById('mainContent');
  if (!main) return;

  const viewer = getCurrentUser();
  const currentUserId = viewer.id;
  const isOwnProfile = userId === currentUserId;

  // Fetch basic profile info
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, department, level, gender, bio, avatar_url, poke_count, created_at')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    main.innerHTML = `<div style="padding:20px;text-align:center;">User not found.</div>`;
    return;
  }

  // Fetch combined data via RPC
  const { data: extraData } = await supabase.rpc('get_user_profile_data', {
    viewer_id: currentUserId,
    profile_id: userId
  });

  const friendship = extraData?.friendship;
  const mutualCount = extraData?.mutual_count || 0;
  const recentPosts = extraData?.recent_posts || [];
  const friendsProfiles = extraData?.friends || [];

  const joined = formatJoinedDate(profile.created_at);

  // Build HTML
  main.innerHTML = `
    <div class="profile-page">
      <div class="profile-header">
        <div class="profile-avatar-large">
          ${getAvatarHtml(profile)}
        </div>
        <h2 class="profile-name">${escapeHtml(profile.full_name)}</h2>
        <p class="profile-dept-level">${escapeHtml(profile.department)} · ${profile.level}L</p>
        <p class="profile-gender-bio">${profile.gender}${profile.bio ? ' · ' + escapeHtml(profile.bio) : ''}</p>
        <p class="profile-joined"><i data-lucide="calendar"></i> Joined ${joined}</p>

        <div class="profile-stats">
          <span><strong>${profile.poke_count}</strong> interactions</span>
          ${mutualCount > 0 ? `<span><strong>${mutualCount}</strong> mutual friends</span>` : ''}
        </div>

        <div class="profile-actions">
          ${isOwnProfile ? `<button class="btn btn-secondary" onclick="window.location.hash='#/settings'">Edit Profile</button>` : renderFriendshipAction(friendship, profile.id)}
        </div>
      </div>

      <!-- Friends grid -->
      <div class="profile-friends-section">
        <h3 class="section-title">Friends</h3>
        <div class="friends-grid">
          ${friendsProfiles.length === 0 ? '<p class="empty-text">No friends yet.</p>' : friendsProfiles.map(f => `
            <div class="friend-card clickable" onclick="window.location.hash='#/profile/${f.id}'">
              ${getAvatarHtml(f)}
              <span class="friend-name">${escapeHtml(f.full_name.split(' ')[0])}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Recent posts -->
      <div class="profile-posts-section">
        <h3 class="section-title">Recent Posts</h3>
        ${recentPosts.length > 0 ? recentPosts.map(post => `
          <div class="profile-post-item">
            <p class="post-text">${escapeHtml(post.content)}</p>
            <span class="post-meta">${timeAgo(post.created_at)}</span>
          </div>
        `).join('') : '<p class="empty-text">No posts yet.</p>'}
      </div>
    </div>
  `;

  lucide.createIcons({ target: main });

  // Attach friend actions (only if not own profile)
  if (!isOwnProfile) {
    const addBtn = document.querySelector('.btn-add-friend');
    if (addBtn) addBtn.addEventListener('click', async () => {
      await addFriend(userId);
      renderProfile(userId);
    });

    const acceptBtn = document.querySelector('.btn-accept-friend');
    if (acceptBtn) acceptBtn.addEventListener('click', async () => {
      await respondFriendRequest(acceptBtn.dataset.friendshipId, 'accepted');
      renderProfile(userId);
    });

    const declineBtn = document.querySelector('.btn-decline-friend');
    if (declineBtn) declineBtn.addEventListener('click', async () => {
      await respondFriendRequest(declineBtn.dataset.friendshipId, 'declined');
      renderProfile(userId);
    });
  }
}

// ── Helpers ──────────────────────────────────────────
function formatJoinedDate(dateStr) {
  const date = new Date(dateStr);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();
  return `${month} ${year}`;
}

function renderFriendshipAction(friendship, otherUserId) {
  if (!friendship || !friendship.status) return `<button class="btn btn-primary btn-add-friend">Add Friend</button>`;
  if (friendship.status === 'pending') {
    if (friendship.sender_id === getCurrentUser().id) return `<button class="btn btn-secondary" disabled>Request Sent</button>`;
    return `
      <div class="friend-request-actions">
        <button class="btn btn-primary btn-accept-friend" data-friendship-id="${friendship.id}">Accept</button>
        <button class="btn btn-secondary btn-decline-friend" data-friendship-id="${friendship.id}">Decline</button>
      </div>`;
  }
  if (friendship.status === 'accepted') return `<span class="friend-badge"><i data-lucide="check-circle"></i> Friends</span>`;
  return '';
}

async function addFriend(userId) {
  await supabase.from('friendships').insert({ sender_id: getCurrentUser().id, receiver_id: userId, status: 'pending' });
}

async function respondFriendRequest(friendshipId, status) {
  await supabase.from('friendships').update({ status }).eq('id', friendshipId);
}