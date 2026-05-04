// js/pages/feedSection.js
import { supabase } from '../supabase.js';
import { getCurrentUser } from '../ui/shell.js';
import { escapeHtml, timeAgo, getAvatarHtml } from '../lib/utils.js';
import { showToast } from '../ui/toast.js';
import { showConfirm } from '../ui/modal.js';

export const feelings = [
  { id: 'happy',    label: 'Happy',    code: 0x1F60A },
  { id: 'sad',      label: 'Sad',      code: 0x1F622 },
  { id: 'angry',    label: 'Angry',    code: 0x1F620 },
  { id: 'excited',  label: 'Excited',  code: 0x1F929 },
  { id: 'tired',    label: 'Tired',    code: 0x1F62B },
  { id: 'blessed',  label: 'Blessed',  code: 0x1F60C },
  { id: 'grateful', label: 'Grateful', code: 0x1F64F },
  { id: 'cool',     label: 'Cool',     code: 0x1F60E },
  { id: 'funny',    label: 'Funny',    code: 0x1F602 },
  { id: 'love',     label: 'Love',     code: 0x1F60D },
  { id: 'sick',     label: 'Sick',     code: 0x1F912 },
  { id: 'worried',  label: 'Worried',  code: 0x1F61F },
];

const postPrompts = [
  "What's the best thing that happened today?",
  "Share a study tip that works!",
  "What are you grateful for right now?",
  "What’s one thing you’re looking forward to?",
  "What’s your favourite spot on campus?",
  "What’s the most interesting thing you’ve learned this week?",
  "Share a motivational quote that keeps you going.",
  "What’s a skill you’d love to learn?",
  "What’s your favourite meal in the cafeteria?",
  "Ask a question you’ve been curious about."
];

function randomPrompt() { return postPrompts[Math.floor(Math.random() * postPrompts.length)]; }

let postsPage = 0;
const postsLimit = 10;
let hasMorePosts = true;
let isLoadingPosts = false;
let postsObserver = null;
let currentUserId = null;

export function renderFeedSection(container, lastVisit, userId) {
  currentUserId = userId;
  container.innerHTML = `
    <div class="feed-section">
      <div class="feed-compose">
        <div id="feelingPickerContainer"></div>
        <textarea id="quickPostInput" placeholder="${randomPrompt()}" maxlength="500" class="feed-compose-textarea"></textarea>
        <div class="feed-compose-actions">
          <div style="display:flex; gap:8px;">
            <button id="feelingBtn" class="btn btn-sm btn-secondary"><i data-lucide="smile"></i> Feeling</button>
          </div>
          <button id="quickPostBtn" class="btn btn-sm btn-primary" disabled>Post</button>
        </div>
      </div>
      <div id="latestPostsList"></div>
      <div id="postsSentinel" style="height:10px;"></div>
    </div>
  `;
  lucide.createIcons({ target: container });
  setupCompose(userId, lastVisit);
  loadLatestPosts(userId, lastVisit, true);
  setupPostsInfiniteScroll(userId, lastVisit);
}

function setupPostsInfiniteScroll(userId, lastVisit) {
  if (postsObserver) postsObserver.disconnect();
  postsObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && hasMorePosts && !isLoadingPosts) {
      loadLatestPosts(userId, lastVisit, false);
    }
  }, { threshold: 0.1 });
  const sentinel = document.getElementById('postsSentinel');
  if (sentinel) postsObserver.observe(sentinel);
}

async function loadLatestPosts(userId, lastVisit, reset = false) {
  if (isLoadingPosts || (!hasMorePosts && !reset)) return;
  isLoadingPosts = true;

  const list = document.getElementById('latestPostsList');
  if (!list) { isLoadingPosts = false; return; }

  if (reset) {
    postsPage = 0;
    hasMorePosts = true;
    list.innerHTML = '<div class="skeleton-post"></div><div class="skeleton-post"></div>';
  }

  const offset = postsPage * postsLimit;
  const { data: posts, error } = await supabase.rpc('get_all_posts', {
    current_user_id: userId,
    limit_count: postsLimit,
    offset_count: offset
  });

  if (error || !posts || posts.length === 0) {
    hasMorePosts = false;
    if (reset) list.innerHTML = '<p style="text-align:center;color:var(--text-muted);">No posts yet. Be the first!</p>';
    isLoadingPosts = false;
    return;
  }

  const html = posts.map(post => renderPostCard(post, userId, lastVisit)).join('');
  if (reset) list.innerHTML = html;
  else list.insertAdjacentHTML('beforeend', html);

  lucide.createIcons({ target: list });
  if (window.twemoji) window.twemoji.parse(list);
  attachPostEvents(userId, lastVisit);

  postsPage++;
  hasMorePosts = posts.length === postsLimit;
  isLoadingPosts = false;
}

export function renderPostCard(post, userId, lastVisit) {
  const author = post.author_json;
  const isOwn = post.post_user_id === userId;
  const feeling = post.feeling_type ? feelings.find(f => f.id === post.feeling_type) : null;
  const isNew = lastVisit && new Date(post.created_at) > new Date(lastVisit);
  const feelingHtml = feeling ? `<div class="feeling-text"><img src="https://twemoji.maxcdn.com/v/14.0.2/72x72/${feeling.code.toString(16)}.png" class="twemoji-inline" alt="${feeling.label}" /> ${author.full_name} is feeling ${feeling.label}</div>` : '';

  return `
    <div class="post-card" data-post-id="${post.id}">
      <div class="post-header">
        <div class="post-avatar clickable" onclick="window.location.hash='#/profile/${author.id}'">
          ${getAvatarHtml(author)}
        </div>
        <div>
          <span class="post-author-name clickable" onclick="window.location.hash='#/profile/${author.id}'">${escapeHtml(author.full_name)}</span>
          <span class="post-time">${timeAgo(post.created_at)}</span>
          ${isNew ? '<span class="badge new-badge">New</span>' : ''}
        </div>
        <div class="post-menu-wrapper">
          <button class="post-menu-btn"><i data-lucide="more-horizontal"></i></button>
          <div class="post-dropdown" style="display:none;">
            ${isOwn ?
              `<button class="dropdown-item delete-post-btn" data-post-id="${post.id}"><i data-lucide="trash-2"></i> Delete</button>` :
              `<button class="dropdown-item copy-link-btn" data-post-id="${post.id}"><i data-lucide="link"></i> Copy Link</button>
               <button class="dropdown-item report-post-btn" data-post-id="${post.id}"><i data-lucide="flag"></i> Report</button>`
            }
          </div>
        </div>
      </div>
      <div class="post-content">
        ${feelingHtml}
        ${escapeHtml(post.content)}
      </div>
      <div class="post-actions">
        <button class="action-btn like-btn ${post.is_liked ? 'liked' : ''}" data-post-id="${post.id}">
          <i data-lucide="heart"></i> <span>${post.like_count || 0}</span>
        </button>
        <button class="action-btn comment-toggle-btn" data-post-id="${post.id}">
          <i data-lucide="message-circle"></i> <span>${post.comment_count || 0}</span>
        </button>
        <button class="action-btn bookmark-btn" data-post-id="${post.id}">
          <i data-lucide="bookmark"></i> <span>${post.share_count || 0}</span>
        </button>
      </div>
      <div class="comments-section" id="comments-${post.id}" style="display:none;">
        <div style="display:flex; gap:6px; margin-bottom:8px;">
          <input type="text" class="comment-input" placeholder="Write a comment..." data-post-id="${post.id}" />
          <button class="btn btn-sm btn-primary post-comment-btn" data-post-id="${post.id}">Post</button>
        </div>
        <div class="comments-list" id="comments-list-${post.id}"></div>
      </div>
    </div>
  `;
}

export async function loadComments(postId) {
  const list = document.getElementById(`comments-list-${postId}`);
  if (!list) return;
  list.innerHTML = '<div class="skeleton-comment"></div><div class="skeleton-comment"></div>';
  const { data: comments, error } = await supabase
    .from('comments')
    .select('id, user_id, content, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error || !comments) { list.innerHTML = ''; return; }
  const ids = [...new Set(comments.map(c => c.user_id))];
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, avatar_url').in('id', ids);
  const map = Object.fromEntries(profiles.map(p => [p.id, p]));
  list.innerHTML = comments.map(c => {
    const a = map[c.user_id] || { full_name: 'Unknown', avatar_url: null };
    return `<div class="comment-item"><div class="comment-avatar clickable" onclick="window.location.hash='#/profile/${a.id}'">${getAvatarHtml(a)}</div><div><strong class="clickable" onclick="window.location.hash='#/profile/${a.id}'">${escapeHtml(a.full_name)}</strong><p>${escapeHtml(c.content)}</p><span class="comment-time">${timeAgo(c.created_at)}</span></div></div>`;
  }).join('');
  if (window.twemoji) window.twemoji.parse(list);
}

export function attachPostEvents(userId, lastVisit) {
  // Like
  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.removeEventListener('click', likeHandler);
    btn.addEventListener('click', likeHandler);
    async function likeHandler(e) {
      e.stopPropagation();
      const postId = btn.dataset.postId;
      const isLiked = btn.classList.contains('liked');
      if (isLiked) {
        const { data: like } = await supabase.from('likes').select('id').eq('post_id', postId).eq('user_id', userId).single();
        if (like) await supabase.from('likes').delete().eq('id', like.id);
      } else {
        await supabase.from('likes').insert({ post_id: postId, user_id: userId });
      }
      btn.classList.toggle('liked');
      const cnt = btn.querySelector('span');
      cnt.textContent = parseInt(cnt.textContent) + (btn.classList.contains('liked') ? 1 : -1);
    }
  });

  // Comments toggle
  document.querySelectorAll('.comment-toggle-btn').forEach(btn => {
    btn.removeEventListener('click', commentToggleHandler);
    btn.addEventListener('click', commentToggleHandler);
    async function commentToggleHandler(e) {
      e.stopPropagation();
      const postId = btn.dataset.postId;
      const div = document.getElementById(`comments-${postId}`);
      if (div.style.display === 'none') {
        div.style.display = 'block';
        await loadComments(postId);
      } else {
        div.style.display = 'none';
      }
    }
  });

  // Post comment
  document.querySelectorAll('.post-comment-btn').forEach(btn => {
    btn.removeEventListener('click', postCommentHandler);
    btn.addEventListener('click', postCommentHandler);
    async function postCommentHandler(e) {
      const postId = btn.dataset.postId;
      const input = document.querySelector(`.comment-input[data-post-id="${postId}"]`);
      const content = input.value.trim();
      if (!content) return;
      await supabase.from('comments').insert({ post_id: postId, user_id: userId, content });
      input.value = '';
      await loadComments(postId);
    }
  });

  // Bookmark with localStorage & icon change
  document.querySelectorAll('.bookmark-btn').forEach(btn => {
    btn.removeEventListener('click', bookmarkHandler);
    btn.addEventListener('click', bookmarkHandler);
    function bookmarkHandler(e) {
      e.stopPropagation();
      const pid = btn.dataset.postId;
      let bm = JSON.parse(localStorage.getItem('futiaspace-bookmarks') || '[]');
      if (bm.includes(pid)) {
        bm = bm.filter(id => id !== pid);
        showToast('Bookmark removed', 'info');
      } else {
        bm.push(pid);
        showToast('Post bookmarked', 'success');
      }
      localStorage.setItem('futiaspace-bookmarks', JSON.stringify(bm));
      const svg = btn.querySelector('svg');
      if (svg) {
        const newIcon = document.createElement('span');
        newIcon.innerHTML = bm.includes(pid)
          ? '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path><polyline points="12 8 12 15"></polyline><polyline points="9 11 15 11"></polyline></svg>'
          : '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
        svg.parentNode.replaceChild(newIcon.firstElementChild, svg);
      }
    }
  });

  // Delete / Copy / Report
  document.querySelectorAll('.delete-post-btn').forEach(btn => {
    btn.removeEventListener('click', deleteHandler);
    btn.addEventListener('click', deleteHandler);
    async function deleteHandler(e) {
      e.stopPropagation();
      const confirmed = await showConfirm('Delete Post', 'Are you sure?');
      if (confirmed) {
        await supabase.from('posts').delete().eq('id', btn.dataset.postId);
        showToast('Post deleted', 'success');
        loadLatestPosts(userId, lastVisit, true);
      }
    }
  });

  document.querySelectorAll('.copy-link-btn').forEach(btn => {
    btn.removeEventListener('click', copyHandler);
    btn.addEventListener('click', copyHandler);
    function copyHandler(e) {
      e.stopPropagation();
      navigator.clipboard.writeText(`https://futiaspace.com.ng/#/profile/${userId}?post=${btn.dataset.postId}`);
      showToast('Link copied', 'success');
    }
  });

  document.querySelectorAll('.report-post-btn').forEach(btn => {
    btn.removeEventListener('click', reportHandler);
    btn.addEventListener('click', reportHandler);
    async function reportHandler(e) {
      e.stopPropagation();
      const confirmed = await showConfirm('Report Post', 'Are you sure you want to report this post?');
      if (confirmed) {
        await supabase.from('reports').insert({ post_id: btn.dataset.postId, reporter_id: userId, reason: 'inappropriate' });
        showToast('Report submitted', 'success');
      }
    }
  });

  // Dropdown toggle
  document.querySelectorAll('.post-menu-btn').forEach(btn => {
    btn.removeEventListener('click', menuHandler);
    btn.addEventListener('click', menuHandler);
    function menuHandler(e) {
      e.stopPropagation();
      const dd = btn.nextElementSibling;
      dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
    }
  });
  window.addEventListener('click', () => {
    document.querySelectorAll('.post-dropdown').forEach(d => d.style.display = 'none');
  });
}

// Compose logic
function setupCompose(userId, lastVisit) {
  const textarea = document.getElementById('quickPostInput');
  const postBtn = document.getElementById('quickPostBtn');
  const feelingBtn = document.getElementById('feelingBtn');
  const feelingContainer = document.getElementById('feelingPickerContainer');

  textarea.addEventListener('input', () => {
    const hasFeeling = !!window._currentFeeling;
    postBtn.disabled = (!textarea.value.trim() && !hasFeeling);
  });

  postBtn.addEventListener('click', async () => {
    const content = textarea.value.trim();
    const selectedFeeling = window._currentFeeling;
    if (!content && !selectedFeeling) return;
    const finalContent = content;
    const { error } = await supabase.from('posts').insert({
      user_id: userId,
      content: finalContent,
      feeling_type: selectedFeeling?.id || null
    });
    if (error) { showToast('Could not post', 'error'); } else {
      textarea.value = '';
      postBtn.disabled = true;
      window._currentFeeling = null;
      feelingBtn.innerHTML = '<i data-lucide="smile"></i> Feeling';
      lucide.createIcons({ target: feelingBtn });
      showToast('Post shared!', 'success');
      loadLatestPosts(userId, lastVisit, true);
    }
  });

  let pickerVisible = false;
  feelingBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (pickerVisible) { feelingContainer.innerHTML = ''; pickerVisible = false; return; }
    feelingContainer.innerHTML = `<div class="feeling-picker">${feelings.map(f => `<button class="feeling-chip" data-code="${f.code}" data-id="${f.id}" title="${f.label}"><img src="https://twemoji.maxcdn.com/v/14.0.2/72x72/${f.code.toString(16)}.png" class="twemoji-inline" alt="${f.label}" /> ${escapeHtml(f.label)}</button>`).join('')}</div>`;
    if (window.twemoji) window.twemoji.parse(feelingContainer);
    pickerVisible = true;
    feelingContainer.querySelectorAll('.feeling-chip').forEach(chip => {
      chip.addEventListener('click', (e2) => {
        e2.stopPropagation();
        window._currentFeeling = { code: parseInt(chip.dataset.code), id: chip.dataset.id, label: chip.title };
        feelingBtn.innerHTML = `<i data-lucide="smile"></i> Feeling ${chip.title}`;
        lucide.createIcons({ target: feelingBtn });
        feelingContainer.innerHTML = '';
        pickerVisible = false;
        postBtn.disabled = false;
      });
    });
  });
  document.addEventListener('click', (e) => {
    if (!feelingContainer.contains(e.target) && e.target !== feelingBtn) { feelingContainer.innerHTML = ''; pickerVisible = false; }
  });
}