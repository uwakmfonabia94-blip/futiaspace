// js/pages/feed.js
import { supabase } from '../supabase.js';
import { getCurrentUser } from '../ui/shell.js';
import { escapeHtml, timeAgo, getAvatarHtml } from '../lib/utils.js';
import { showConfirm } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';

let page = 0;
const limit = 10;
let realtimeChannel = null;
let isLoading = false;

const placeholders = [
  "What's happening on campus?",
  "Share a thought, ask a question…",
  "Found a cool spot? Tell everyone!",
  "What's the best food on campus?",
  "Need help with an assignment?",
  "Organising a study group? Post here!",
  "Any events this week?",
  "Just got out of class – what'd you learn?"
];

export async function renderFeed() {
  const main = document.getElementById('mainContent');
  if (!main) return;
  const user = getCurrentUser();
  if (!user) return;

  main.innerHTML = `
    <div class="feed-page">
      <!-- Inline compose box -->
      <div class="feed-compose">
        <textarea id="feedComposeInput" class="feed-compose-textarea" placeholder="${placeholders[0]}" maxlength="500"></textarea>
        <div class="feed-compose-actions">
          <span class="compose-char-count" id="feedCharCount">0 / 500</span>
          <button class="btn btn-primary btn-sm" id="feedPostBtn" disabled>Post</button>
        </div>
      </div>

      <div id="feedPostsContainer">
        ${skeletonPosts(4)}
      </div>
      <button id="loadMoreBtn" class="btn btn-secondary" style="margin:16px; display:none;">Load more</button>
    </div>
  `;

  // Compose textarea logic
  const textarea = document.getElementById('feedComposeInput');
  const postBtn = document.getElementById('feedPostBtn');
  const charCount = document.getElementById('feedCharCount');

  // Rotating placeholder
  let placeholderIndex = 0;
  const rotate = () => {
    if (!textarea || document.activeElement === textarea) return;
    if (textarea.value.trim() === '') {
      placeholderIndex = (placeholderIndex + 1) % placeholders.length;
      textarea.placeholder = placeholders[placeholderIndex];
    }
  };
  setInterval(rotate, 5000);

  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    charCount.textContent = `${len} / 500`;
    postBtn.disabled = len === 0 || len > 500;
  });

  postBtn.addEventListener('click', async () => {
    const content = textarea.value.trim();
    if (!content) return;
    postBtn.disabled = true;
    postBtn.textContent = 'Posting…';
    const { error } = await supabase.from('posts').insert({ user_id: user.id, content });
    if (error) {
      showToast('Failed to post: ' + error.message, 'error');
      postBtn.disabled = false;
      postBtn.textContent = 'Post';
    } else {
      textarea.value = '';
      charCount.textContent = '0 / 500';
      postBtn.disabled = true;
      postBtn.textContent = 'Post';
      showToast('Post shared!', 'success');
    }
  });

  await loadPosts(true);
  subscribeRealtime();
}

// ── Skeleton ────────────────────────────────────────
function skeletonPosts(count) {
  return Array(count).fill(`
    <div class="feed-post skeleton">
      <div class="post-header">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-lines">
          <div class="line" style="width:40%;"></div>
          <div class="line" style="width:25%;"></div>
        </div>
      </div>
      <div class="skeleton-lines" style="margin-top:8px;">
        <div class="line" style="width:90%;"></div>
        <div class="line" style="width:70%;"></div>
      </div>
    </div>
  `).join('');
}

// ── Core loading (uses single RPC) ──────────────────
async function loadPosts(reset = false) {
  if (isLoading) return;
  isLoading = true;
  const userId = getCurrentUser().id;
  const container = document.getElementById('feedPostsContainer');
  if (!container) { isLoading = false; return; }

  try {
    if (reset) {
      page = 0;
      container.innerHTML = skeletonPosts(4);
    }

    const offset = page * limit;
    const { data: posts, error } = await supabase.rpc('get_feed_posts_v2', {
      current_user_id: userId,
      limit_count: limit,
      offset_count: offset
    });

    if (error) {
      container.innerHTML = `<p style="text-align:center;padding:20px;">Could not load feed.</p>`;
      console.error(error);
      return;
    }

    if (!posts || posts.length === 0) {
      if (reset) {
        container.innerHTML = `<p class="feed-empty">✨ No posts yet – be the first to share something!</p>`;
      }
      const lm = document.getElementById('loadMoreBtn');
      if (lm) lm.style.display = 'none';
      return;
    }

    const html = posts.map(post => renderPostHTML(post)).join('');
    if (reset) container.innerHTML = html;
    else container.insertAdjacentHTML('beforeend', html);

    lucide.createIcons({ target: container });
    attachPostEvents();

    const lm = document.getElementById('loadMoreBtn');
    if (lm) lm.style.display = posts.length < limit ? 'none' : 'block';
  } finally {
    isLoading = false;
  }
}

// ── Post HTML ───────────────────────────────────────
function renderPostHTML(post) {
  const author = post.author_json;
  const isOwnPost = post.post_user_id === getCurrentUser().id;

  return `
    <div class="feed-post" data-post-id="${post.id}">
      <div class="post-header">
        <div class="post-avatar clickable" onclick="window.location.hash='#/profile/${author.id}'">
          ${getAvatarHtml(author)}
        </div>
        <div class="post-author-info">
          <span class="post-author-name clickable" onclick="window.location.hash='#/profile/${author.id}'">${escapeHtml(author.full_name)}</span>
          <span class="post-time">${timeAgo(post.created_at)}</span>
        </div>
        ${!isOwnPost ? `<button class="btn-sm btn-secondary add-friend-btn" data-user-id="${author.id}"><i data-lucide="user-plus"></i> Add</button>` : ''}
        ${isOwnPost ? `
          <div class="post-menu-wrapper">
            <button class="post-menu-btn"><i data-lucide="more-horizontal"></i></button>
            <div class="post-dropdown" style="display:none;">
              <button class="dropdown-item delete-post-btn" data-post-id="${post.id}"><i data-lucide="trash-2"></i> Delete</button>
            </div>
          </div>` : ''}
        ${!isOwnPost ? `<button class="report-post-btn" data-post-id="${post.id}" title="Report post"><i data-lucide="flag"></i></button>` : ''}
      </div>
      <div class="post-content">${escapeHtml(post.content)}</div>
      <div class="post-actions">
        <button class="action-btn like-btn ${post.is_liked ? 'liked' : ''}" data-post-id="${post.id}">
          <i data-lucide="heart"></i> <span class="like-count">${post.like_count || 0}</span>
        </button>
        <button class="action-btn comment-toggle-btn" data-post-id="${post.id}">
          <i data-lucide="message-circle"></i> <span>${post.comment_count || 0}</span>
        </button>
      </div>
      <div class="comments-section" id="comments-${post.id}" style="display:none;">
        <div class="comments-list" id="comments-list-${post.id}"></div>
        <div class="comment-input-area">
          <input type="text" class="comment-input" placeholder="Write a comment..." data-post-id="${post.id}" />
          <button class="btn btn-sm btn-primary post-comment-btn" data-post-id="${post.id}">Post</button>
        </div>
      </div>
    </div>
  `;
}

// ── Event binding ──────────────────────────────────
function attachPostEvents() {
  const userId = getCurrentUser().id;

  // ---- Three‑dot menu ----
  document.querySelectorAll('.post-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = btn.nextElementSibling;
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });
  });

  // Close all dropdowns when clicking outside
  window.addEventListener('click', (e) => {
    if (!e.target.closest('.post-menu-wrapper')) {
      document.querySelectorAll('.post-dropdown').forEach(d => d.style.display = 'none');
    }
  });

  // ---- Delete post (custom confirmation) ----
  document.querySelectorAll('.delete-post-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const postId = btn.dataset.postId;
      const confirmed = await showConfirm('Delete Post', 'Are you sure you want to delete this post?');
      if (confirmed) {
        const { error } = await supabase.from('posts').delete().eq('id', postId);
        if (error) showToast('Delete failed', 'error');
        else {
          showToast('Post deleted', 'success');
          loadPosts(true);
        }
      }
    });
  });

  // ---- Like / Unlike ----
  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const postId = btn.dataset.postId;
      const isLiked = btn.classList.contains('liked');

      if (isLiked) {
        const { data: like } = await supabase
          .from('likes')
          .select('id')
          .eq('post_id', postId)
          .eq('user_id', userId)
          .single();
        if (like) await supabase.from('likes').delete().eq('id', like.id);
      } else {
        await supabase.from('likes').insert({ post_id: postId, user_id: userId });
      }

      btn.classList.toggle('liked');
      const countSpan = btn.querySelector('.like-count');
      countSpan.textContent = parseInt(countSpan.textContent) + (btn.classList.contains('liked') ? 1 : -1);
    });
  });

  // ---- Add friend (on post header) ----
  document.querySelectorAll('.add-friend-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const targetUserId = btn.dataset.userId;
      const { error } = await supabase.from('friendships').insert({
        sender_id: userId,
        receiver_id: targetUserId,
        status: 'pending'
      });
      if (error) {
        if (error.code === '23505') showToast('Friend request already sent', 'info');
        else showToast('Could not send friend request', 'error');
        return;
      }
      btn.innerHTML = `<i data-lucide="clock"></i> Pending`;
      btn.disabled = true;
      lucide.createIcons({ target: btn });
      showToast('Friend request sent', 'success');
    });
  });

  // ---- Report post ----
  document.querySelectorAll('.report-post-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showReportModal(btn.dataset.postId);
    });
  });

  // ---- Toggle comments ----
  document.querySelectorAll('.comment-toggle-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const postId = btn.dataset.postId;
      const commentsDiv = document.getElementById(`comments-${postId}`);
      if (commentsDiv.style.display === 'none') {
        commentsDiv.style.display = 'block';
        await loadComments(postId);
      } else {
        commentsDiv.style.display = 'none';
      }
    });
  });

  // ---- Post comment ----
  document.querySelectorAll('.post-comment-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const postId = btn.dataset.postId;
      const input = document.querySelector(`.comment-input[data-post-id="${postId}"]`);
      const content = input.value.trim();
      if (!content) return;
      const { error } = await supabase.from('comments').insert({ post_id: postId, user_id: userId, content });
      if (error) showToast('Could not add comment', 'error');
      else {
        input.value = '';
        await loadComments(postId);
      }
    });
  });

  document.querySelectorAll('.comment-input').forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.nextElementSibling.click();
      }
    });
  });
}

// ── Comments loading (flat list) ────────────────────
async function loadComments(postId) {
  const listEl = document.getElementById(`comments-list-${postId}`);
  if (!listEl) return;

  const { data: comments, error } = await supabase
    .from('comments')
    .select('id, user_id, content, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error || !comments) return;

  const authorIds = [...new Set(comments.map(c => c.user_id))];
  const { data: authors } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', authorIds);
  const authorMap = Object.fromEntries(authors.map(a => [a.id, a]));

  listEl.innerHTML = comments.map(c => {
    const author = authorMap[c.user_id] || { full_name: 'Unknown', avatar_url: null };
    return `
      <div class="comment-item">
        <div class="comment-avatar clickable" onclick="window.location.hash='#/profile/${author.id}'">
          ${getAvatarHtml(author)}
        </div>
        <div class="comment-body">
          <span class="comment-author clickable" onclick="window.location.hash='#/profile/${author.id}'">${escapeHtml(author.full_name)}</span>
          <p>${escapeHtml(c.content)}</p>
          <span class="comment-time">${timeAgo(c.created_at)}</span>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons({ target: listEl });
}

// ── Real‑time subscriptions ─────────────────────────
function subscribeRealtime() {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase
    .channel('feed-mvp')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => loadPosts(true))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, () => loadPosts(true))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => loadPosts(true))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, () => loadPosts(true))
    .subscribe();
}

// ── Report modal (custom) ──────────────────────────
function showReportModal(postId) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <h3>Report Post</h3>
      <p>Why are you reporting this post?</p>
      <select id="reportReason" class="input-clean" style="margin-bottom:12px;">
        <option value="spam">Spam</option>
        <option value="harassment">Harassment</option>
        <option value="inappropriate">Inappropriate content</option>
        <option value="other">Other</option>
      </select>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="reportCancel">Cancel</button>
        <button class="btn btn-danger" id="reportSubmit">Submit Report</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('reportCancel').onclick = () => overlay.remove();
  document.getElementById('reportSubmit').onclick = async () => {
    const reason = document.getElementById('reportReason').value;
    await supabase.from('reports').insert({
      post_id: postId,
      reporter_id: getCurrentUser().id,
      reason
    });
    overlay.remove();
    showToast('Thank you, your report has been submitted.', 'success');
  };
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

// ── Load more button ────────────────────────────────
document.addEventListener('click', (e) => {
  if (e.target.id === 'loadMoreBtn') {
    page++;
    loadPosts(false);
  }
});

// ── Cleanup on navigation ───────────────────────────
window.addEventListener('hashchange', () => {
  if (!window.location.hash.startsWith('#/feed')) {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
});