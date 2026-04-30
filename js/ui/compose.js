// js/ui/compose.js
import { supabase } from '../supabase.js';
import { getCurrentUser } from './shell.js';

export function openCompose() {
  let overlay = document.getElementById('composeOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'composeOverlay';
    overlay.className = 'compose-overlay';
    overlay.innerHTML = `
      <div class="compose-container">
        <div class="compose-header">
          <button class="compose-cancel-btn"><i data-lucide="x"></i></button>
          <span class="compose-title">New Post</span>
          <button class="btn btn-sm btn-primary" id="postSubmitBtn" disabled>Post</button>
        </div>
        <textarea id="composeText" class="compose-textarea" placeholder="What's happening on campus…?" maxlength="500"></textarea>
        <div class="compose-char-count">0 / 500</div>
      </div>
    `;
    document.body.appendChild(overlay);
    lucide.createIcons({ target: overlay });

    const textarea = overlay.querySelector('#composeText');
    const submitBtn = overlay.querySelector('#postSubmitBtn');
    const charCount = overlay.querySelector('.compose-char-count');

    textarea.addEventListener('input', () => {
      const len = textarea.value.length;
      charCount.textContent = `${len} / 500`;
      submitBtn.disabled = len === 0 || len > 500;
    });

    overlay.querySelector('.compose-cancel-btn').addEventListener('click', closeCompose);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeCompose(); });

    submitBtn.addEventListener('click', async () => {
      const content = textarea.value.trim();
      if (!content) return;
      const user = getCurrentUser();
      if (!user) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Posting...';
      const { error } = await supabase.from('posts').insert({ user_id: user.id, content });
      if (error) {
        alert('Failed to post: ' + error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Post';
      } else {
        closeCompose();
      }
    });
  }

  overlay.style.display = 'flex';
  setTimeout(() => overlay.classList.add('visible'), 10);
  overlay.querySelector('#composeText').focus();
}

export function closeCompose() {
  const overlay = document.getElementById('composeOverlay');
  if (overlay) {
    overlay.classList.remove('visible');
    setTimeout(() => {
      overlay.style.display = 'none';
      overlay.querySelector('#composeText').value = '';
      overlay.querySelector('.compose-char-count').textContent = '0 / 500';
      overlay.querySelector('#postSubmitBtn').disabled = true;
    }, 200);
  }
}