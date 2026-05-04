// js/pages/directory.js
import { supabase } from '../supabase.js';
import { getCurrentUser } from '../ui/shell.js';
import { escapeHtml, timeAgo, getAvatarHtml, getVerifiedBadge } from '../lib/utils.js';
import { renderFeedSection } from './feedSection.js';
import { showToast } from '../ui/toast.js';

let currentUserId = null;
let profileOffset = 0;
const profileLimit = 10;
let hasMoreProfiles = true;
let isLoadingProfiles = false;
let studentObserver = null;
let peopleYouMayKnowOffset = 0;
let peopleYouMayKnowAll = [];

export async function renderDirectory() {
  const main = document.getElementById('mainContent');
  if (!main) return;

  const user = getCurrentUser();
  currentUserId = user.id;

  main.innerHTML = `
    <div class="home-page">
      <div id="feedSectionContainer"></div>
      <div id="peopleDiscoverySection"></div>
      <div id="campusActivitySection"></div>
      <div id="peopleYouMayKnowSection"></div>
      <div id="productSpotlightSection"></div>
      <div id="studentGridSection">
        <div id="profileGridContent" class="profile-grid"></div>
        <div id="studentSentinel" style="height:10px;"></div>
      </div>
    </div>
  `;

  const lastVisit = localStorage.getItem('futiaspace-lastVisit');
  localStorage.setItem('futiaspace-lastVisit', new Date().toISOString());

  renderFeedSection(document.getElementById('feedSectionContainer'), lastVisit, currentUserId);

  await Promise.all([
    loadPeopleDiscovery(lastVisit),
    loadCampusActivity(lastVisit),
    loadPeopleYouMayKnow(lastVisit),
    loadProductSpotlight(lastVisit),
    loadStudentGrid(true, lastVisit)
  ]);

  setupStudentInfiniteScroll(lastVisit);
}

function setupStudentInfiniteScroll(lastVisit) {
  if (studentObserver) studentObserver.disconnect();
  studentObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && hasMoreProfiles && !isLoadingProfiles) {
      loadStudentGrid(false, lastVisit);
    }
  }, { threshold: 0.1 });
  const sentinel = document.getElementById('studentSentinel');
  if (sentinel) studentObserver.observe(sentinel);
}

async function loadPeopleDiscovery(lastVisit) {
  const container = document.getElementById('peopleDiscoverySection');
  if (!container) return;
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentUsers } = await supabase
    .from('profiles')
    .select('id, full_name, department, avatar_url, created_at, is_verified')
    .gte('created_at', twoWeeksAgo)
    .neq('id', currentUserId)
    .order('created_at', { ascending: false })
    .limit(6);
  if (!recentUsers || recentUsers.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = `
    <div class="section-box">
      <h4 class="section-title">Recently Joined</h4>
      <div class="vertical-list">
        ${recentUsers.map(u => `
          <div class="list-item clickable" onclick="window.location.hash='#/profile/${u.id}'">
            ${getAvatarHtml(u)}
            <div>
              <strong>${escapeHtml(u.full_name)} ${getVerifiedBadge(u.is_verified, u.id)}</strong>
              <span>${escapeHtml(u.department)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  lucide.createIcons({ target: container });
}

async function loadCampusActivity(lastVisit) {
  const container = document.getElementById('campusActivitySection');
  if (!container) return;
  const items = [];
  // Referrals
  const { data: referrals } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, referred_by, created_at, is_verified')
    .not('referred_by', 'is', null)
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(3);
  if (referrals) {
    const referrerIds = [...new Set(referrals.map(p => p.referred_by))];
    const { data: referrers } = await supabase.from('profiles').select('id, full_name').in('id', referrerIds);
    const referrerMap = Object.fromEntries((referrers || []).map(r => [r.id, r.full_name]));
    referrals.forEach(p => {
      items.push({
        html: `<img src="${p.avatar_url || ''}" class="activity-avatar" onerror="this.style.display='none'" />
               <span><strong>${escapeHtml(p.full_name)} ${getVerifiedBadge(p.is_verified, p.id)}</strong> joined via ${escapeHtml(referrerMap[p.referred_by] || 'someone')}'s invite</span>`,
        link: `/profile/${p.id}`
      });
    });
  }
  // Friendships
  const { data: friendships } = await supabase
    .from('friendships')
    .select('sender_id, receiver_id, updated_at, sender:profiles!sender_id(avatar_url, full_name, is_verified), receiver:profiles!receiver_id(avatar_url, full_name, is_verified)')
    .eq('status', 'accepted')
    .order('updated_at', { ascending: false })
    .limit(3);
  if (friendships) {
    friendships.forEach(f => {
      const senderImg = f.sender?.avatar_url ? `<img src="${escapeHtml(f.sender.avatar_url)}" class="activity-avatar" />` : `<div class="activity-avatar-placeholder">${getInitials(f.sender?.full_name)}</div>`;
      const receiverImg = f.receiver?.avatar_url ? `<img src="${escapeHtml(f.receiver.avatar_url)}" class="activity-avatar" />` : `<div class="activity-avatar-placeholder">${getInitials(f.receiver?.full_name)}</div>`;
      items.push({
        html: `<div class="activity-avatars">${senderImg}${receiverImg}</div>
               <span>${escapeHtml(f.sender?.full_name || 'Someone')} ${getVerifiedBadge(f.sender?.is_verified, f.sender_id)} & ${escapeHtml(f.receiver?.full_name || 'Someone')} ${getVerifiedBadge(f.receiver?.is_verified, f.receiver_id)} are now friends</span>`,
        link: `/profile/${f.sender_id}`
      });
    });
  }
  // Marketplace
  const { data: products } = await supabase
    .from('marketplace_items')
    .select('id, title, price, image_url1')
    .gte('created_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(3);
  if (products) {
    products.forEach(p => {
      const img = p.image_url1 ? `<img src="${escapeHtml(p.image_url1)}" class="activity-product-img" />` : '<div class="activity-product-placeholder"><i data-lucide="package"></i></div>';
      items.push({
        html: `${img} <span>New: <strong>${escapeHtml(p.title)}</strong>${p.price ? ' · ₦' + parseInt(p.price).toLocaleString() : ''}</span>`,
        link: '/marketplace'
      });
    });
  }
  if (items.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = `
    <div class="section-box">
      <h4 class="section-title">Campus Activity</h4>
      <div class="vertical-list">
        ${items.slice(0, 6).map(item => `
          <div class="list-item clickable" onclick="window.location.hash='#${item.link}'">
            ${item.html}
          </div>
        `).join('')}
      </div>
    </div>
  `;
  lucide.createIcons({ target: container });
}

function getInitials(name) {
  return (name || '?').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

async function loadPeopleYouMayKnow(lastVisit, reset = true) {
  const container = document.getElementById('peopleYouMayKnowSection');
  if (!container) return;
  if (reset) { peopleYouMayKnowOffset = 0; peopleYouMayKnowAll = []; }
  const { data: me } = await supabase.from('profiles').select('department, level').eq('id', currentUserId).single();
  if (!me) { container.innerHTML = ''; return; }
  const { data: candidates } = await supabase
    .from('profiles')
    .select('id, full_name, department, avatar_url, is_verified')
    .eq('department', me.department)
    .eq('level', me.level)
    .neq('id', currentUserId)
    .range(peopleYouMayKnowOffset, peopleYouMayKnowOffset + 5);
  if (!candidates || candidates.length === 0) { if (reset) container.innerHTML = ''; return; }
  const notFriends = [];
  for (const c of candidates) {
    const status = await getFriendshipStatus(currentUserId, c.id);
    if (!status || (status.status !== 'accepted' && status.status !== 'pending')) {
      notFriends.push(c);
      peopleYouMayKnowAll.push(c);
    }
  }
  if (reset) {
    container.innerHTML = `
      <div class="section-box">
        <h4 class="section-title">People You May Know</h4>
        <div class="vertical-list" id="peopleYouMayKnowList"></div>
        ${notFriends.length === 5 ? '<button id="loadMorePeopleBtn" class="btn btn-sm btn-secondary">See more</button>' : ''}
      </div>
    `;
  }
  const list = document.getElementById('peopleYouMayKnowList');
  if (list) {
    list.insertAdjacentHTML('beforeend', notFriends.map(u => `
      <div class="list-item clickable" onclick="window.location.hash='#/profile/${u.id}'">
        ${getAvatarHtml(u)}
        <div>
          <strong>${escapeHtml(u.full_name)} ${getVerifiedBadge(u.is_verified, u.id)}</strong>
          <span>${escapeHtml(u.department)}</span>
        </div>
        <button class="btn-friend add" data-user-id="${u.id}"><i data-lucide="user-plus"></i></button>
      </div>
    `).join(''));
  }
  lucide.createIcons({ target: container });
  attachFriendButtons(container);
  const loadMoreBtn = document.getElementById('loadMorePeopleBtn');
  if (loadMoreBtn) loadMoreBtn.addEventListener('click', () => { peopleYouMayKnowOffset += 5; loadPeopleYouMayKnow(lastVisit, false); });
}

function attachFriendButtons(container) {
  container.querySelectorAll('.btn-friend.add').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const userId = btn.dataset.userId;
      await supabase.from('friendships').insert({ sender_id: currentUserId, receiver_id: userId, status: 'pending' });
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="user-check"></i> Sent';
      lucide.createIcons({ target: btn });
      showToast('Friend request sent', 'success');
    });
  });
}

async function loadProductSpotlight(lastVisit) {
  const container = document.getElementById('productSpotlightSection');
  if (!container) return;
  const { data: products } = await supabase
    .from('marketplace_items')
    .select('id, title, price, image_url1, user_id')
    .eq('status', 'available')
    .order('created_at', { ascending: false })
    .limit(3);
  if (!products || products.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = `
    <div class="section-box">
      <h4 class="section-title">Products for Sale</h4>
      <div class="vertical-list">
        ${products.map(p => {
          const img = p.image_url1 ? `<img src="${escapeHtml(p.image_url1)}" class="product-list-img" />` : '<div class="activity-product-placeholder"><i data-lucide="package"></i></div>';
          return `
            <div class="list-item clickable" onclick="window.location.hash='#/marketplace'">
              ${img}
              <div style="flex:1;">
                <strong>${escapeHtml(p.title)}</strong>
                <span>${p.price ? '₦' + parseInt(p.price).toLocaleString() : 'Free'}</span>
              </div>
              <button class="btn btn-sm btn-primary chat-seller-product" data-seller-id="${p.user_id}"><i data-lucide="message-circle"></i> Chat</button>
            </div>
          `;
        }).join('')}
      </div>
      <a href="#/marketplace" class="see-more-link">See more products →</a>
    </div>
  `;
  lucide.createIcons({ target: container });
  container.querySelectorAll('.chat-seller-product').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.hash = `#/chat/${btn.dataset.sellerId}`;
    });
  });
}

async function loadStudentGrid(reset = false, lastVisit) {
  if (isLoadingProfiles || (!hasMoreProfiles && !reset)) return;
  isLoadingProfiles = true;
  const container = document.getElementById('profileGridContent');
  if (!container) { isLoadingProfiles = false; return; }
  if (reset) { profileOffset = 0; hasMoreProfiles = true; container.innerHTML = '<div class="skeleton-grid">Loading...</div>'; }
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, department, level, gender, avatar_url, created_at, is_verified')
    .neq('id', currentUserId)
    .order('created_at', { ascending: false })
    .range(profileOffset, profileOffset + profileLimit - 1);
  if (error || !profiles || profiles.length === 0) {
    hasMoreProfiles = false;
    if (reset) container.innerHTML = '<p class="empty-text">No other students found.</p>';
    isLoadingProfiles = false;
    return;
  }
  // Pin current user to the top if present in this batch (only when reset = true)
  let sortedProfiles = [...profiles];
  if (reset) {
    const selfIndex = sortedProfiles.findIndex(p => p.id === currentUserId);
    if (selfIndex !== -1) {
      const self = sortedProfiles[selfIndex];
      sortedProfiles.splice(selfIndex, 1);
      sortedProfiles.unshift(self);
    }
  }
  const enriched = await Promise.all(sortedProfiles.map(async p => {
    const friendship = await getFriendshipStatus(currentUserId, p.id);
    return { ...p, friendship };
  }));
  const html = enriched.map(profile => renderProfileCard(profile, lastVisit)).join('');
  if (reset) container.innerHTML = html;
  else container.insertAdjacentHTML('beforeend', html);
  lucide.createIcons({ target: container });
  profileOffset += profileLimit;
  hasMoreProfiles = profiles.length === profileLimit;
  isLoadingProfiles = false;
  container.querySelectorAll('.btn-friend.add').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const userId = btn.dataset.userId;
      await supabase.from('friendships').insert({ sender_id: currentUserId, receiver_id: userId, status: 'pending' });
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="user-check"></i> Sent';
      lucide.createIcons({ target: btn });
      showToast('Friend request sent', 'success');
    });
  });
}

function renderProfileCard(profile, lastVisit) {
  const isNew = lastVisit && new Date(profile.created_at) > new Date(lastVisit);
  const friendBtn = getFriendButtonHtml(profile.friendship, profile.id);
  const verifiedBadge = getVerifiedBadge(profile.is_verified, profile.id);
  return `
    <div class="profile-card" data-user-id="${profile.id}" onclick="window.location.hash='#/profile/${profile.id}'">
      ${isNew ? '<span class="badge new-badge">New</span>' : ''}
      <div class="card-avatar">${getAvatarHtml(profile)}</div>
      <div class="card-info">
        <h3>${escapeHtml(profile.full_name)} ${verifiedBadge}</h3>
        <p class="dept-level">${escapeHtml(profile.department)} · ${profile.level}L</p>
        <p class="card-detail"><i data-lucide="user"></i> ${profile.gender}</p>
      </div>
      <div class="card-action">${friendBtn}</div>
    </div>
  `;
}

async function getFriendshipStatus(userA, userB) {
  const { data } = await supabase
    .from('friendships')
    .select('id, sender_id, receiver_id, status')
    .or(`and(sender_id.eq.${userA},receiver_id.eq.${userB}),and(sender_id.eq.${userB},receiver_id.eq.${userA})`)
    .maybeSingle();
  return data;
}

function getFriendButtonHtml(friendship, otherUserId) {
  if (!friendship) return `<button class="btn-friend add" data-user-id="${otherUserId}"><i data-lucide="user-plus"></i></button>`;
  if (friendship.status === 'pending') {
    if (friendship.sender_id === currentUserId) return `<button class="btn-friend pending" disabled><i data-lucide="user-check"></i> Sent</button>`;
    return `<div class="friend-request-actions"><button class="btn-accept" data-friendship-id="${friendship.id}">Accept</button><button class="btn-decline" data-friendship-id="${friendship.id}">Decline</button></div>`;
  }
  if (friendship.status === 'accepted') return `<span class="friend-badge"><i data-lucide="check-circle"></i> Friends</span>`;
  return '';
}