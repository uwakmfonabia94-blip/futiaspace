/**
 * FutiaSpace — js/profile.js
 *
 * Handles two pages:
 *
 *  ① Profile view  (#/profile/:id  and  #/profile-self)
 *     • Skeleton → real content reveal
 *     • Avatar with initials fallback
 *     • Name, dept/level/gender tags, poke count stat
 *     • Optional bio section
 *     • Own profile  → shows Edit button, hides Poke button
 *     • Other profile → hides Edit button, shows Poke button
 *     • "Chat — coming soon" pill always visible
 *     • Back button with history.back() fallback
 *
 *  ② Edit profile  (#/edit-profile)
 *     • Pre-populate all fields from cached current profile
 *     • Avatar tap → file picker → compress → live preview
 *     • Name, level, gender (editable)
 *     • Department (editable, fires warning modal if changed)
 *     • Bio with live character counter (max 160)
 *     • Save: upload new avatar if changed, then UPDATE profiles row
 *     • Calls router.refreshCurrentProfile() to keep cache in sync
 *     • Navigates back to own profile after save
 */

import { supabase }                              from './supabase.js';
import {
  navigate,
  getCurrentProfile,
  refreshCurrentProfile,
}                                                from './router.js';
import { uploadAvatar }                          from './auth.js';
import {
  showToast,
  showModal,
  compressImage,
  setLoadingBtn,
  renderAvatar,
  sanitiseText,
  escapeHtml,
  formatLevel,
}                                                from './utils.js';
import { initPoke }                              from './poke.js';


// ════════════════════════════════════════════════════════════════
// MODULE STATE
// ════════════════════════════════════════════════════════════════

/** The profile currently displayed on the view page. */
let _viewedProfile   = null;

/**
 * New avatar Blob selected on the edit-profile page.
 * null = user didn't change their photo this session.
 */
let _editAvatarBlob  = null;

/** The department value at the time the edit page loaded (for change detection). */
let _originalDept    = '';


// ════════════════════════════════════════════════════════════════
// PUBLIC API  (called by router.js)
// ════════════════════════════════════════════════════════════════

/**
 * Initialise the profile view page.
 * @param {string|undefined} userId  UUID from the route param.
 *   When undefined (profile-self route) we use the current user's id.
 */
export async function initProfile(userId) {
  const me = getCurrentProfile();

  // Resolve whose profile to show
  const targetId = userId || me?.id;
  if (!targetId) {
    showToast('Could not load profile.', 'error');
    navigate('#/home');
    return;
  }

  const isOwnProfile = (me && targetId === me.id);

  // Wire back button once
  _wireProfileBackButton();

  // Show edit button only on own profile
  const editBtn = document.getElementById('btn-go-edit-profile');
  if (editBtn) {
    if (isOwnProfile) {
      editBtn.classList.remove('hidden');
      // Wire only once
      if (!editBtn.dataset.wired) {
        editBtn.dataset.wired = '1';
        editBtn.addEventListener('click', () => navigate('#/edit-profile'));
      }
    } else {
      editBtn.classList.add('hidden');
    }
  }

  // Show skeleton, hide content
  _showSkeleton(true);

  // If viewing own profile and it's already cached, use it immediately
  if (isOwnProfile && me) {
    _viewedProfile = me;
    _renderProfile(me, isOwnProfile);
    _showSkeleton(false);
    initPoke(me.id);
    return;
  }

  // Fetch from DB
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', targetId)
      .single();

    if (error || !data) {
      _showSkeleton(false);
      _showProfileNotFound();
      return;
    }

    _viewedProfile = data;
    _renderProfile(data, isOwnProfile);
    _showSkeleton(false);
    initPoke(data.id);

  } catch (err) {
    console.error('[profile] load error:', err);
    _showSkeleton(false);
    showToast('Could not load profile. Please try again.', 'error');
  }
}

/**
 * Initialise the edit-profile page.
 * Called by router.js when #/edit-profile becomes active.
 */
export function initEditProfile() {
  const me = getCurrentProfile();
  if (!me) {
    navigate('#/home');
    return;
  }

  // Reset any pending avatar from a previous visit
  _editAvatarBlob  = null;
  _originalDept    = me.department || '';

  _wireEditBackButton();
  _populateEditForm(me);
  _wireEditAvatarPicker();
  _wireEditBioCounter();
  _wireEditSaveButton();
}


// ════════════════════════════════════════════════════════════════
// 1.  PROFILE VIEW — RENDER
// ════════════════════════════════════════════════════════════════

function _renderProfile(profile, isOwn) {
  // Avatar
  const imgEl      = document.getElementById('profile-avatar-img');
  const initialsEl = document.getElementById('profile-avatar-initials');
  if (imgEl && initialsEl) {
    renderAvatar(imgEl, initialsEl, profile.avatar_url, profile.full_name);
  }

  // Name
  _setText('profile-name', profile.full_name || '—');

  // Tags
  _setText('profile-dept',   profile.department || '');
  _setText('profile-level',  formatLevel(profile.level));
  _setText('profile-gender', profile.gender || '');

  // Poke count
  _setText('profile-poke-count', String(profile.poke_count ?? 0));

  // Bio — hide the whole section if no bio
  const bioSection = document.getElementById('profile-bio-section');
  const bioEl      = document.getElementById('profile-bio');
  if (bioSection && bioEl) {
    if (profile.bio && profile.bio.trim()) {
      bioEl.textContent = profile.bio.trim();
      bioSection.classList.remove('hidden');
    } else {
      bioSection.classList.add('hidden');
    }
  }

  // Actions — poke button visible only on OTHER profiles
  const actionsEl = document.getElementById('profile-actions');
  const pokeBtn   = document.getElementById('btn-poke');
  if (actionsEl && pokeBtn) {
    if (isOwn) {
      // Hide poke button on own profile — no point poking yourself
      pokeBtn.classList.add('hidden');
    } else {
      pokeBtn.classList.remove('hidden');
    }
  }

  // Re-render Lucide icons for the freshly populated content
  _renderPageIcons('page-profile');
}

function _showSkeleton(show) {
  const skeleton = document.getElementById('profile-skeleton');
  const content  = document.getElementById('profile-content');
  if (skeleton) skeleton.classList.toggle('hidden', !show);
  if (content)  content.classList.toggle('hidden',  show);
}

function _showProfileNotFound() {
  const content = document.getElementById('profile-content');
  if (!content) return;
  content.classList.remove('hidden');
  content.innerHTML = `
    <div class="empty-state" style="padding-top:var(--space-12)">
      <i data-lucide="user-x" aria-hidden="true"></i>
      <h3>Profile not found</h3>
      <p>This student may have deleted their account.</p>
    </div>`;
  _renderPageIcons('page-profile');
}

function _wireProfileBackButton() {
  const btn = document.getElementById('btn-back-from-profile');
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else navigate('#/home');
  });
}


// ════════════════════════════════════════════════════════════════
// 2.  EDIT PROFILE — FORM POPULATION
// ════════════════════════════════════════════════════════════════

function _populateEditForm(profile) {
  // Avatar — show current photo or initials
  const imgEl      = document.getElementById('edit-avatar-img');
  const initialsEl = document.getElementById('edit-avatar-initials');
  if (imgEl && initialsEl) {
    renderAvatar(imgEl, initialsEl, profile.avatar_url, profile.full_name);
  }

  // Text fields
  _setValue('edit-name',  profile.full_name  || '');
  _setValue('edit-bio',   profile.bio        || '');

  // Selects
  _setSelectValue('edit-level',      profile.level      || '');
  _setSelectValue('edit-gender',     profile.gender     || '');
  _setSelectValue('edit-department', profile.department || '');

  // Bio counter
  const bioEl    = document.getElementById('edit-bio');
  const bioCount = document.getElementById('edit-bio-count');
  if (bioEl && bioCount) bioCount.textContent = (profile.bio || '').length;

  // Re-render icons (camera overlay etc.)
  _renderPageIcons('page-edit-profile');
}


// ════════════════════════════════════════════════════════════════
// 3.  EDIT PROFILE — AVATAR PICKER
// ════════════════════════════════════════════════════════════════

function _wireEditAvatarPicker() {
  const trigger   = document.getElementById('edit-avatar-trigger');
  const fileInput = document.getElementById('edit-avatar-file');

  if (!trigger || !fileInput) return;
  if (trigger.dataset.wired) return;
  trigger.dataset.wired = '1';

  trigger.addEventListener('click', () => fileInput.click());
  trigger.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      showToast('Please choose a JPEG, PNG, or WebP image.', 'warning');
      e.target.value = '';
      return;
    }

    try {
      const blob = await compressImage(file, 400, 0.82);
      _editAvatarBlob = blob;

      // Live preview in the edit circle
      const imgEl      = document.getElementById('edit-avatar-img');
      const initialsEl = document.getElementById('edit-avatar-initials');
      if (imgEl) {
        const objUrl  = URL.createObjectURL(blob);
        imgEl.src     = objUrl;
        imgEl.classList.remove('hidden');
        imgEl.onload  = () => URL.revokeObjectURL(objUrl);
      }
      if (initialsEl) initialsEl.classList.add('hidden');

    } catch {
      showToast('Could not process image. Please try a different photo.', 'error');
      e.target.value = '';
    }
  });
}


// ════════════════════════════════════════════════════════════════
// 4.  EDIT PROFILE — BIO COUNTER
// ════════════════════════════════════════════════════════════════

function _wireEditBioCounter() {
  const bioEl    = document.getElementById('edit-bio');
  const bioCount = document.getElementById('edit-bio-count');
  if (!bioEl || !bioCount) return;
  if (bioEl.dataset.wired) return;
  bioEl.dataset.wired = '1';

  bioEl.addEventListener('input', () => {
    bioCount.textContent = bioEl.value.length;
  });
}


// ════════════════════════════════════════════════════════════════
// 5.  EDIT PROFILE — SAVE
// ════════════════════════════════════════════════════════════════

function _wireEditSaveButton() {
  const btn = document.getElementById('btn-save-profile');
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', _handleSaveProfile);
}

async function _handleSaveProfile() {
  const me  = getCurrentProfile();
  const btn = document.getElementById('btn-save-profile');

  if (!me) {
    navigate('#/home');
    return;
  }

  // ── Read field values ────────────────────────────────────────
  const name       = sanitiseText(document.getElementById('edit-name')?.value,  80);
  const level      = document.getElementById('edit-level')?.value      || '';
  const gender     = document.getElementById('edit-gender')?.value     || '';
  const department = document.getElementById('edit-department')?.value || '';
  const bio        = sanitiseText(document.getElementById('edit-bio')?.value,   160);

  // ── Validation ────────────────────────────────────────────────
  if (!name || name.length < 2) {
    _fieldError('edit-name', 'Please enter your full name (at least 2 characters).');
    document.getElementById('edit-name')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (!level) {
    _fieldError('edit-level', 'Please select your level.');
    return;
  }
  if (!gender) {
    _fieldError('edit-gender', 'Please select your gender.');
    return;
  }
  if (!department) {
    _fieldError('edit-department', 'Please select your department.');
    return;
  }

  // ── Department change warning ─────────────────────────────────
  const deptChanged = department !== _originalDept && _originalDept !== '';
  if (deptChanged) {
    const result = await showModal({
      title   : 'Change department?',
      message : `Changing to "${department}" will move you to a different directory. Your coursemates there won't see you in "${_originalDept}" anymore.`,
      iconType: 'warning',
      actions : [
        { label: 'Keep current', key: 'cancel',  style: 'outline'  },
        { label: 'Yes, change',  key: 'confirm', style: 'primary'  },
      ],
    });
    if (result !== 'confirm') return;
  }

  setLoadingBtn(btn, true);

  try {
    let avatarUrl  = me.avatar_url  || null;
    let avatarPath = me.avatar_path || null;

    // ── Upload new avatar if one was selected ───────────────────
    if (_editAvatarBlob) {
      const result = await uploadAvatar(me.id, _editAvatarBlob);
      if (result.url)  avatarUrl  = result.url;
      if (result.path) avatarPath = result.path;
    }

    // ── Update the profiles row ─────────────────────────────────
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name  : name,
        level,
        gender,
        department,
        bio        : bio || null,
        avatar_url : avatarUrl,
        avatar_path: avatarPath,
      })
      .eq('id', me.id);

    if (error) {
      setLoadingBtn(btn, false);
      showToast(error.message || 'Could not save changes. Please try again.', 'error');
      return;
    }

    // ── Refresh the router's cached profile ─────────────────────
    await refreshCurrentProfile();

    // ── Reset edit state ─────────────────────────────────────────
    _editAvatarBlob = null;
    _originalDept   = department;
    const fileInput = document.getElementById('edit-avatar-file');
    if (fileInput) fileInput.value = '';

    setLoadingBtn(btn, false);
    showToast('Profile updated!', 'success', 2500);

    // Navigate to own profile to see the changes
    navigate(`#/profile-self`);

  } catch (err) {
    setLoadingBtn(btn, false);
    console.error('[profile] save error:', err);
    showToast('Something went wrong. Please try again.', 'error');
  }
}


// ════════════════════════════════════════════════════════════════
// 6.  EDIT PROFILE — BACK BUTTON
// ════════════════════════════════════════════════════════════════

function _wireEditBackButton() {
  const btn = document.getElementById('btn-back-from-edit');
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';

  btn.addEventListener('click', async () => {
    // Warn if there are unsaved changes
    const hasChanges = _hasUnsavedChanges();
    if (hasChanges) {
      const result = await showModal({
        title   : 'Discard changes?',
        message : 'You have unsaved changes. If you go back now they will be lost.',
        iconType: 'warning',
        actions : [
          { label: 'Keep editing', key: 'cancel',  style: 'outline' },
          { label: 'Discard',      key: 'confirm', style: 'danger'  },
        ],
      });
      if (result !== 'confirm') return;
    }

    // Reset pending avatar
    _editAvatarBlob = null;
    const fileInput = document.getElementById('edit-avatar-file');
    if (fileInput) fileInput.value = '';

    if (window.history.length > 1) window.history.back();
    else navigate('#/profile-self');
  });
}


// ════════════════════════════════════════════════════════════════
// 7.  UNSAVED CHANGE DETECTION
// ════════════════════════════════════════════════════════════════

/** Returns true if any edit-profile field differs from the cached profile. */
function _hasUnsavedChanges() {
  const me = getCurrentProfile();
  if (!me) return false;

  // New avatar selected
  if (_editAvatarBlob) return true;

  const nameEl  = document.getElementById('edit-name');
  const levelEl = document.getElementById('edit-level');
  const genderEl= document.getElementById('edit-gender');
  const deptEl  = document.getElementById('edit-department');
  const bioEl   = document.getElementById('edit-bio');

  if (nameEl?.value.trim()   !== (me.full_name  || '').trim())  return true;
  if (levelEl?.value         !== (me.level      || ''))          return true;
  if (genderEl?.value        !== (me.gender     || ''))          return true;
  if (deptEl?.value          !== (me.department || ''))          return true;
  if (bioEl?.value.trim()    !== (me.bio        || '').trim())   return true;

  return false;
}


// ════════════════════════════════════════════════════════════════
// 8.  INLINE FIELD ERROR HELPERS
// ════════════════════════════════════════════════════════════════

function _fieldError(inputId, message) {
  const el = document.getElementById(inputId);
  if (!el) return;

  el.classList.add('error');
  // Remove any existing error for this field
  document.getElementById(`err-${inputId}`)?.remove();

  const errEl = document.createElement('p');
  errEl.id          = `err-${inputId}`;
  errEl.textContent = message;
  errEl.style.cssText = [
    'font-size:var(--font-size-xs)',
    'color:var(--text-danger)',
    'margin-top:4px',
    'font-weight:500',
    'line-height:1.4',
    'padding-left:var(--page-pad)',
  ].join(';');
  errEl.setAttribute('role', 'alert');

  // Insert after input or its wrapper
  const insertAfter = el.closest('.input-pw-wrap') || el;
  insertAfter.insertAdjacentElement('afterend', errEl);
  el.setAttribute('aria-invalid', 'true');

  // Auto-clear on change
  const clearFn = () => {
    el.classList.remove('error');
    el.removeAttribute('aria-invalid');
    document.getElementById(`err-${inputId}`)?.remove();
    el.removeEventListener('input',  clearFn);
    el.removeEventListener('change', clearFn);
  };
  el.addEventListener('input',  clearFn);
  el.addEventListener('change', clearFn);
}


// ════════════════════════════════════════════════════════════════
// 9.  DOM HELPERS
// ════════════════════════════════════════════════════════════════

function _setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function _setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function _setSelectValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  // Try to set the value; if the option doesn't exist the select stays on default
  el.value = value;
  // Verify it actually got set
  if (el.value !== value) {
    // Option may not exist — add a fallback disabled option to show the value
    const opt = document.createElement('option');
    opt.value    = value;
    opt.textContent = value;
    opt.disabled = true;
    el.appendChild(opt);
    el.value = value;
  }
}

function _renderPageIcons(pageId) {
  if (!window.lucide) return;
  const el = document.getElementById(pageId);
  if (el) window.lucide.createIcons({ icons: window.lucide.icons, rootElement: el });
}