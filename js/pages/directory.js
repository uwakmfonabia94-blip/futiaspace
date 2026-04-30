// js/pages/directory.js
import { showToast } from '../ui/toast.js';
import { supabase } from '../supabase.js';
import { getCurrentUser } from '../ui/shell.js';
import { escapeHtml, timeAgo, getAvatarHtml } from '../lib/utils.js';

let currentUserId = null;
let filters = { department: '', level: '', search: '' };
let realtimeChannel = null;

export async function renderDirectory() {
  const main = document.getElementById('mainContent');
  if (!main) return;

  const user = getCurrentUser();
  currentUserId = user.id;

  main.innerHTML = `
    <div class="directory-page">
      <div class="directory-header">
        <h2 style="padding:16px 16px 0;">Directory</h2>
        <div class="filter-bar" style="padding:0 16px 12px;">
          <input type="text" id="searchInput" placeholder="Search by name…" class="search-input" />
          <select id="filterDepartment" class="filter-select">
            <option value="">All Departments</option>
          </select>
          <select id="filterLevel" class="filter-select">
            <option value="">All Levels</option>
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="300">300</option>
          </select>
        </div>
      </div>

      <div id="suggestedSection"></div>

      <div id="profileListContainer">
        ${skeletonCards(5)}
      </div>
    </div>
  `;

  loadDepartmentFilter();

  // Both sections load at once – no second flash
  await Promise.all([loadSuggestedSection(), loadProfiles()]);

  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.addEventListener('input', debounce(applyFilters, 300));
  const deptFilter = document.getElementById('filterDepartment');
  if (deptFilter) deptFilter.addEventListener('change', applyFilters);
  const levelFilter = document.getElementById('filterLevel');
  if (levelFilter) levelFilter.addEventListener('change', applyFilters);

  // Delay real-time subscription to avoid duplicate load on first render
  setTimeout(() => subscribeToFriendshipChanges(), 1000);
}

function skeletonCards(count) {
  return Array(count).fill(`
    <div class="profile-card skeleton">
      <div class="skeleton-avatar"></div>
      <div class="skeleton-lines">
        <div class="line" style="width:55%;"></div>
        <div class="line" style="width:40%;"></div>
      </div>
    </div>
  `).join('');
}

async function loadDepartmentFilter() {
  const deptSelect = document.getElementById('filterDepartment');
  if (!deptSelect) return;
  const { data, error } = await supabase.from('departments').select('department').order('department');
  if (!error && data) {
    data.forEach(d => {
      const option = document.createElement('option');
      option.value = d.department;
      option.textContent = d.department;
      deptSelect.appendChild(option);
    });
  }
}

function applyFilters() {
  const searchInput = document.getElementById('searchInput');
  const deptFilter = document.getElementById('filterDepartment');
  const levelFilter = document.getElementById('filterLevel');
  if (searchInput) filters.search = searchInput.value.trim();
  if (deptFilter) filters.department = deptFilter.value;
  if (levelFilter) filters.level = levelFilter.value;
  loadProfiles();
}

async function loadProfiles() {
  const container = document.getElementById('profileListContainer');
  if (!container) return;
  container.innerHTML = skeletonCards(5);

  let query = supabase
    .from('profiles')
    .select('id, full_name, department, level, gender, bio, avatar_url, poke_count, created_at')
    .neq('id', currentUserId);

  if (filters.department) query = query.eq('department', filters.department);
  if (filters.level) query = query.eq('level', filters.level);
  if (filters.search) {
    query = query.textSearch('full_name', filters.search);
  }

  const { data: profiles, error } = await query
    .order('last_seen', { ascending: false })
    .limit(50);

  if (error) {
    container.innerHTML = `<p style="text-align:center;padding:20px;">Could not load profiles.</p>`;
    return;
  }

  if (!profiles || profiles.length === 0) {
    container.innerHTML = `<p style="text-align:center;padding:20px;color:var(--color-text-secondary);">No students found.</p>`;
    return;
  }

  const enriched = await Promise.all(profiles.map(async p => {
    const [friendship, mutual] = await Promise.all([
      getFriendshipStatus(currentUserId, p.id),
      getMutualCount(currentUserId, p.id)
    ]);
    return { ...p, friendship, mutualCount: mutual };
  }));

  container.innerHTML = enriched.map(profile => renderProfileCard(profile)).join('');
  lucide.createIcons({ target: container });
  attachCardEvents();
}

function renderProfileCard(profile) {
  const avatarHtml = getAvatarHtml(profile);
  const friendBtn = getFriendButtonHtml(profile.friendship, profile.id);
  return `
    <div class="profile-card" data-user-id="${profile.id}" onclick="window.location.hash='#/profile/${profile.id}'">
      <div class="card-avatar">
        ${avatarHtml}
      </div>
      <div class="card-info">
        <h3>${escapeHtml(profile.full_name)}</h3>
        <div class="card-details-row">
          <span class="card-detail"><i data-lucide="building-2" style="width:14px;height:14px;"></i> ${escapeHtml(profile.department)}</span>
          <span class="card-detail"><i data-lucide="graduation-cap" style="width:14px;height:14px;"></i> ${profile.level}L</span>
        </div>
        <div class="card-details-row">
          <span class="card-detail"><i data-lucide="user" style="width:14px;height:14px;"></i> ${profile.gender}</span>
        </div>
        <p class="card-bio">${profile.bio ? escapeHtml(profile.bio.substring(0, 80) + (profile.bio.length > 80 ? '…' : '')) : ''}</p>
        <div class="social-proof card-mutual">
          ${profile.mutualCount > 0 ? `<span><i data-lucide="users" style="width:14px;height:14px;"></i> ${profile.mutualCount} mutual</span>` : ''}
          <span>${profile.poke_count} interactions</span>
        </div>
      </div>
      <div class="card-action">${friendBtn}</div>
    </div>
  `;
}

function getFriendButtonHtml(friendship, otherUserId) {
  if (!friendship) {
    return `<button class="btn-friend add" data-user-id="${otherUserId}"><i data-lucide="user-plus"></i> Add Friend</button>`;
  }
  if (friendship.status === 'pending') {
    if (friendship.sender_id === currentUserId) {
      return `<button class="btn-friend pending" disabled><i data-lucide="user-check"></i> Request Sent`;
    } else {
      return `
        <div class="friend-request-actions" data-user-id="${otherUserId}">
          <button class="btn-accept" data-friendship-id="${friendship.id}">Accept</button>
          <button class="btn-decline" data-friendship-id="${friendship.id}">Decline</button>
        </div>
      `;
    }
  }
  if (friendship.status === 'accepted') {
    return `<span class="friend-badge"><i data-lucide="check-circle"></i> Friends</span>`;
  }
  return '';
}

function attachCardEvents() {
  document.querySelectorAll('.btn-friend.add').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const userId = btn.dataset.userId;
      await addFriend(userId, btn);
    });
  });
  document.querySelectorAll('.btn-accept').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await respondToFriendRequest(btn.dataset.friendshipId, 'accepted', btn);
    });
  });
  document.querySelectorAll('.btn-decline').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await respondToFriendRequest(btn.dataset.friendshipId, 'declined', btn);
    });
  });
}

async function addFriend(userId, button) {
  const { error } = await supabase.from('friendships').insert({
    sender_id: currentUserId,
    receiver_id: userId,
    status: 'pending'
  });
  if (error) {
    showToast('Could not send request: ' + error.message, 'error');
    return;
  }
  // Inline update
  button.disabled = true;
  button.innerHTML = `<i data-lucide="user-check"></i> Request Sent`;
  button.classList.add('pending');
  lucide.createIcons({ target: button });
  showToast('Friend request sent', 'success');
}

async function respondToFriendRequest(friendshipId, newStatus, button) {
  const { error } = await supabase.from('friendships')
    .update({ status: newStatus })
    .eq('id', friendshipId);
  if (error) {
    showToast('Update failed: ' + error.message, 'error');
    return;
  }
  // Inline update
  const actionsDiv = button.closest('.friend-request-actions');
  if (actionsDiv) {
    if (newStatus === 'accepted') {
      actionsDiv.outerHTML = `<span class="friend-badge"><i data-lucide="check-circle"></i> Friends</span>`;
    } else {
      actionsDiv.outerHTML = `<button class="btn-friend add" data-user-id="${actionsDiv.dataset.userId}"><i data-lucide="user-plus"></i> Add Friend</button>`;
    }
    lucide.createIcons({ target: actionsDiv.parentNode });
  }
}

async function getFriendshipStatus(userA, userB) {
  let { data } = await supabase
    .from('friendships')
    .select('id, sender_id, receiver_id, status')
    .eq('sender_id', userA)
    .eq('receiver_id', userB)
    .maybeSingle();
  if (data) return data;
  ({ data } = await supabase
    .from('friendships')
    .select('id, sender_id, receiver_id, status')
    .eq('sender_id', userB)
    .eq('receiver_id', userA)
    .maybeSingle());
  return data;
}

async function getMutualCount(userA, userB) {
  const { data, error } = await supabase.rpc('get_mutual_friend_count', { user_a: userA, user_b: userB });
  return error ? 0 : data;
}

function formatJoinedDate(dateStr) {
  const date = new Date(dateStr);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();
  return `${month} ${year}`;
}

// ── SUGGESTED SECTION ──
async function loadSuggestedSection() {
  const container = document.getElementById('suggestedSection');
  if (!container) return;

  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentUsers } = await supabase
    .from('profiles')
    .select('id, full_name, department, avatar_url, created_at')
    .gte('created_at', twoWeeksAgo)
    .neq('id', currentUserId)
    .order('created_at', { ascending: false })
    .limit(5);

  const { data: me } = await supabase
    .from('profiles')
    .select('department, level')
    .eq('id', currentUserId)
    .single();

  let sameDeptLevelUsers = [];
  if (me) {
    const { data: candidates } = await supabase
      .from('profiles')
      .select('id, full_name, department, avatar_url')
      .eq('department', me.department)
      .eq('level', me.level)
      .neq('id', currentUserId)
      .limit(10);

    if (candidates) {
      const notFriends = [];
      for (const c of candidates) {
        const status = await getFriendshipStatus(currentUserId, c.id);
        if (!status || status.status !== 'accepted') notFriends.push(c);
      }
      sameDeptLevelUsers = notFriends.slice(0, 5);
    }
  }

  const showInviteCTA = (!recentUsers || recentUsers.length === 0) &&
                        (!sameDeptLevelUsers || sameDeptLevelUsers.length === 0);

  container.innerHTML = `
    ${recentUsers && recentUsers.length > 0 ? `
      <div class="suggestion-box">
        <h4>Recently Joined</h4>
        <div class="horizontal-scroll">
          ${recentUsers.map(u => `
            <div class="suggestion-card" onclick="window.location.hash='#/profile/${u.id}'">
              ${getAvatarHtml(u)}
              <span class="name">${escapeHtml(u.full_name.split(' ')[0])}</span>
              <span class="meta">${escapeHtml(u.department)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    ${sameDeptLevelUsers.length > 0 ? `
      <div class="suggestion-box">
        <h4>People you may know</h4>
        <div class="horizontal-scroll">
          ${sameDeptLevelUsers.map(u => `
            <div class="suggestion-card" onclick="window.location.hash='#/profile/${u.id}'">
              ${getAvatarHtml(u)}
              <span class="name">${escapeHtml(u.full_name.split(' ')[0])}</span>
              <span class="meta">${escapeHtml(u.department)}</span>
              <button class="btn-micro btn-friend add" data-user-id="${u.id}" onclick="event.stopPropagation(); this.click();"><i data-lucide="user-plus"></i></button>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
    ${showInviteCTA ? `
      <div class="invite-cta" style="margin:12px 16px; padding:16px; background:var(--color-surface); border-radius:var(--border-radius); text-align:center;">
        <p style="margin-bottom:12px; color:var(--color-text-secondary);">No one from your department is here yet. Be the first to invite them!</p>
        <div style="display:flex; gap:8px; justify-content:center;">
          <button class="btn btn-sm btn-primary" id="copyInviteLink"><i data-lucide="copy"></i> Copy Link</button>
          <button class="btn btn-sm btn-primary" id="shareWhatsApp"><i data-lucide="message-circle"></i> WhatsApp</button>
        </div>
      </div>
    ` : ''}
  `;

  const copyBtn = document.getElementById('copyInviteLink');
  const whatsappBtn = document.getElementById('shareWhatsApp');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText('https://futiaspace.vercel.app').then(() => {
        showToast('Invite link copied!', 'success');
      });
    });
  }
  if (whatsappBtn) {
    whatsappBtn.addEventListener('click', () => {
      const text = encodeURIComponent("Join me on FutiaSpace – the campus network for FUTIA students! https://futiaspace.vercel.app");
      window.open(`https://wa.me/?text=${text}`, '_blank');
    });
  }

  lucide.createIcons({ target: container });
}

function subscribeToFriendshipChanges() {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase
    .channel('directory-friendships')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'friendships',
      filter: `(sender_id=eq.${currentUserId} or receiver_id=eq.${currentUserId})`
    }, () => debouncedRefreshProfiles())
    .subscribe();
}

const debouncedRefreshProfiles = debounce(loadProfiles, 500);

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

window.addEventListener('hashchange', () => {
  if (!window.location.hash.startsWith('#/directory')) {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
});