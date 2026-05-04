// js/pages/feedSection.js
import { supabase } from '../supabase.js';
import { getCurrentUser } from '../ui/shell.js';
import { escapeHtml, timeAgo, getAvatarHtml, getVerifiedBadge } from '../lib/utils.js';
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
  if (reset) { postsPage = 0; hasMorePosts = true; list.innerHTML = '<div class="skeleton-post"></div><div class="skeleton-post"></div>'; }
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
  // Load verification status for all post authors
  const authorIds = [...new Set(posts.map(p => p.author_json?.id))];
  let verifiedMap = {};
  if (authorIds.length) {
    const { data: verifiedUsers } = await supabase.from('profiles').select('id, is_verified').in('id', authorIds);
    verifiedMap = Object.fromEntries(verifiedUsers.map(v => [v.id, v.is_verified]));
  }
  const html = posts.map(post => renderPostCard(post, userId, lastVisit, verifiedMap)).join('');
  if (reset) list.innerHTML = html;
  else list.insertAdjacentHTML('beforeend', html);
  lucide.createIcons({ target: list });
  if (window.twemoji) window.twemoji.parse(list);
  attachPostEvents(userId, lastVisit);
  postsPage++;
  hasMorePosts = posts.length === postsLimit;
  isLoadingPosts = false;
}

function renderPostCard(post, userId, lastVisit, verifiedMap) {
  const author = post.author_json;
  const isOwn = post.post_user_id === userId;
  const feeling = post.feeling_type ? feelings.find(f => f.id === post.feeling_type) : null;
  const isNew = lastVisit && new Date(post.created_at) > new Date(lastVisit);
  const feelingHtml = feeling ? `<div class="feeling-text"><img src="https://twemoji.maxcdn.com/v/14.0.2/72x72/${feeling.code.toString(16)}.png" class="twemoji-inline" alt="${feeling.label}" /> ${author.full_name} is feeling ${feeling.label}</div>` : '';
  const verifiedBadge = getVerifiedBadge(verifiedMap[author.id] || false, author.id);
  const editedLabel = post.edited_at ? `<span class="edited-label" title="Edited ${timeAgo(post.edited_at)}">(edited)</span>` : '';
  return `
    <div class="post-card" data-post-id="${post.id}">
      <div class="post-header">
        <div class="post-avatar clickable" onclick="window.location.hash='#/profile/${author.id}'">${getAvatarHtml(author)}</div>
        <div>
          <span class="post-author-name clickable" onclick="window.location.hash='#/profile/${author.id}'">${escapeHtml(author.full_name)}</span>${verifiedBadge}
          <span class="post-time">${timeAgo(post.created_at)} ${editedLabel}</span>
          ${isNew ? '<span class="badge new-badge">New</span>' : ''}
        </div>
        <div class="post-menu-wrapper">
          <button class="post-menu-btn"><i data-lucide="more-horizontal"></i></button>
          <div class="post-dropdown" style="display:none;">
            ${isOwn ?
              `<button class="dropdown-item edit-post-btn" data-post-id="${post.id}" data-post-content="${escapeHtml(post.content)}" data-feeling="${post.feeling_type || ''}"><i data-lucide="edit-2"></i> Edit</button>
               <button class="dropdown-item delete-post-btn" data-post-id="${post.id}"><i data-lucide="trash-2"></i> Delete</button>` :
              `<button class="dropdown-item copy-link-btn" data-post-id="${post.id}"><i data-lucide="link"></i> Copy Link</button>
               <button class="dropdown-item report-post-btn" data-post-id="${post.id}"><i data-lucide="flag"></i> Report</button>`
            }
          </div>
        </div>
      </div>
      <div class="post-content">
        ${feelingHtml}
        <div class="post-text-content">${escapeHtml(post.content)}</div>
      </div>
      <div class="post-actions">
        <button class="action-btn like-btn ${post.is_liked ? 'liked' : ''}" data-post-id="${post.id}"><i data-lucide="heart"></i> <span>${post.like_count || 0}</span></button>
        <button class="action-btn comment-toggle-btn" data-post-id="${post.id}"><i data-lucide="message-circle"></i> <span>${post.comment_count || 0}</span></button>
        <button class="action-btn bookmark-btn" data-post-id="${post.id}"><i data-lucide="bookmark"></i> <span>${post.share_count || 0}</span></button>
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
  // Load comments (top level)
  const { data: comments, error } = await supabase
    .from('comments')
    .select('id, user_id, content, created_at, edited_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error || !comments) { list.innerHTML = ''; return; }
  const userIds = [...new Set(comments.map(c => c.user_id))];
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, avatar_url, is_verified').in('id', userIds);
  const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));
  // Also get replies count for each comment (to show "View replies")
  const commentIds = comments.map(c => c.id);
  let repliesCounts = {};
  if (commentIds.length) {
    const { data: repliesData } = await supabase
      .from('comment_replies')
      .select('comment_id, count')
      .in('comment_id', commentIds);
    if (repliesData) {
      repliesCounts = repliesData.reduce((acc, r) => { acc[r.comment_id] = parseInt(r.count); return acc; }, {});
    }
  }
  list.innerHTML = comments.map(comment => {
    const author = profileMap[comment.user_id] || { full_name: 'Unknown', avatar_url: null, is_verified: false };
    const authorBadge = getVerifiedBadge(author.is_verified, author.id);
    const editedLabel = comment.edited_at ? `<span class="edited-label" title="Edited ${timeAgo(comment.edited_at)}">(edited)</span>` : '';
    const replyCount = repliesCounts[comment.id] || 0;
    return `
      <div class="comment-item-wrapper" data-comment-id="${comment.id}">
        <div class="comment-item">
          <div class="comment-avatar clickable" onclick="window.location.hash='#/profile/${author.id}'">${getAvatarHtml(author)}</div>
          <div class="comment-content">
            <strong class="clickable" onclick="window.location.hash='#/profile/${author.id}'">${escapeHtml(author.full_name)}</strong>${authorBadge}
            <p>${escapeHtml(comment.content)} <span class="comment-time">${timeAgo(comment.created_at)} ${editedLabel}</span></p>
            <div class="comment-actions">
              <button class="btn-reply-to-comment" data-comment-id="${comment.id}" data-author-name="${escapeHtml(author.full_name)}">Reply</button>
              ${replyCount > 0 ? `<button class="btn-view-replies" data-comment-id="${comment.id}">View replies (${replyCount})</button>` : ''}
            </div>
          </div>
        </div>
        <div class="replies-container" id="replies-${comment.id}" style="display:none; margin-left: 44px;"></div>
      </div>
    `;
  }).join('');
  // Attach reply and view replies handlers after rendering
  attachCommentEvents(postId);
  if (window.twemoji) window.twemoji.parse(list);
}

async function loadReplies(commentId) {
  const container = document.getElementById(`replies-${commentId}`);
  if (!container) return;
  const { data: replies, error } = await supabase
    .from('comment_replies')
    .select('id, user_id, content, created_at, edited_at')
    .eq('comment_id', commentId)
    .order('created_at', { ascending: true });
  if (error || !replies || replies.length === 0) {
    container.innerHTML = '<p class="empty-replies">No replies yet.</p>';
    return;
  }
  const userIds = [...new Set(replies.map(r => r.user_id))];
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, avatar_url, is_verified').in('id', userIds);
  const profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));
  container.innerHTML = replies.map(reply => {
    const author = profileMap[reply.user_id] || { full_name: 'Unknown', avatar_url: null, is_verified: false };
    const authorBadge = getVerifiedBadge(author.is_verified, author.id);
    const editedLabel = reply.edited_at ? `<span class="edited-label" title="Edited ${timeAgo(reply.edited_at)}">(edited)</span>` : '';
    return `
      <div class="reply-item">
        <div class="comment-avatar clickable" onclick="window.location.hash='#/profile/${author.id}'">${getAvatarHtml(author)}</div>
        <div class="comment-content">
          <strong class="clickable" onclick="window.location.hash='#/profile/${author.id}'">${escapeHtml(author.full_name)}</strong>${authorBadge}
          <p>${escapeHtml(reply.content)} <span class="comment-time">${timeAgo(reply.created_at)} ${editedLabel}</span></p>
        </div>
      </div>
    `;
  }).join('');
  lucide.createIcons({ target: container });
}

function attachCommentEvents(postId) {
  // Reply button
  document.querySelectorAll(`#comments-list-${postId} .btn-reply-to-comment`).forEach(btn => {
    btn.removeEventListener('click', replyHandler);
    btn.addEventListener('click', replyHandler);
    async function replyHandler(e) {
      e.stopPropagation();
      const commentId = btn.dataset.commentId;
      const authorName = btn.dataset.authorName;
      const existingInput = document.querySelector(`#replies-${commentId} .reply-input-area`);
      if (existingInput) { existingInput.remove(); return; }
      const replyHtml = `
        <div class="reply-input-area" style="margin-top: 8px; display:flex; gap:6px;">
          <input type="text" class="reply-input" placeholder="Reply to ${authorName}..." maxlength="300" />
          <button class="btn btn-sm btn-primary submit-reply" data-comment-id="${commentId}">Reply</button>
        </div>
      `;
      const container = document.getElementById(`replies-${commentId}`);
      if (container) container.insertAdjacentHTML('beforebegin', replyHtml);
      const submitBtn = document.querySelector(`.submit-reply[data-comment-id="${commentId}"]`);
      const inputField = submitBtn?.previousElementSibling;
      submitBtn?.addEventListener('click', async () => {
        const content = inputField.value.trim();
        if (!content) return;
        const { error } = await supabase.from('comment_replies').insert({
          comment_id: commentId,
          user_id: currentUserId,
          content
        });
        if (error) showToast('Could not post reply', 'error');
        else {
          showToast('Reply posted', 'success');
          inputField.value = '';
          // Refresh replies display
          await loadReplies(commentId);
          // Also update the "View replies" count (optional: increment counter)
          const viewBtn = document.querySelector(`.btn-view-replies[data-comment-id="${commentId}"]`);
          if (viewBtn) {
            const currentCount = parseInt(viewBtn.textContent.match(/\d+/) || 0);
            const newCount = currentCount + 1;
            viewBtn.textContent = `View replies (${newCount})`;
          }
        }
        inputField.parentElement?.remove();
      });
    }
  });
  // View replies button
  document.querySelectorAll(`#comments-list-${postId} .btn-view-replies`).forEach(btn => {
    btn.removeEventListener('click', viewRepliesHandler);
    btn.addEventListener('click', viewRepliesHandler);
    async function viewRepliesHandler(e) {
      e.stopPropagation();
      const commentId = btn.dataset.commentId;
      const repliesDiv = document.getElementById(`replies-${commentId}`);
      if (repliesDiv.style.display === 'none') {
        await loadReplies(commentId);
        repliesDiv.style.display = 'block';
        btn.textContent = `Hide replies`;
      } else {
        repliesDiv.style.display = 'none';
        const count = btn.textContent.match(/\d+/)?.[0] || 0;
        btn.textContent = `View replies (${count})`;
      }
    }
  });
}

export function attachPostEvents(userId, lastVisit) {
  // Like (unchanged)
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
  // Bookmark (unchanged)
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

  // Edit post (new)
  document.querySelectorAll('.edit-post-btn').forEach(btn => {
    btn.removeEventListener('click', editHandler);
    btn.addEventListener('click', editHandler);
    async function editHandler(e) {
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
        loadLatestPosts(userId, lastVisit, true);
      }
    }
  });

  // Delete, copy, report (unchanged)
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
      const confirmed = await showConfirm('Report Post', 'Are you sure?');
      if (confirmed) {
        await supabase.from('reports').insert({ post_id: btn.dataset.postId, reporter_id: userId, reason: 'inappropriate' });
        showToast('Report submitted', 'success');
      }
    }
  });

  // Dropdown toggle (unchanged)
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

// Compose logic (unchanged)
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