/**
 * FutiaSpace — js/auth.js
 * Handles all authentication flows:
 *  • Landing page button wiring
 *  • Login (email + password, persistent session)
 *  • Signup (all 8 fields + profile photo upload + compression)
 *  • Forgot password (email reset link)
 *  • Reset password (new password after clicking email link)
 *  • Password show / hide toggle (all 4 password fields)
 *  • Bio character counter
 *  • Avatar upload + client-side compression + live preview
 *  • Full client-side form validation before any network call
 *  • No browser alert/confirm — custom modals and toasts only
 */

import { supabase }  from './supabase.js';
import { navigate }  from './router.js';
import {
  showToast,
  compressImage,
  setLoadingBtn,
  sanitiseText,
}                    from './utils.js';


// ════════════════════════════════════════════════════════════════
// MODULE STATE
// ════════════════════════════════════════════════════════════════

/** Compressed avatar Blob waiting to be uploaded during signup. */
let _pendingAvatarBlob = null;

/** Tracks per-field password visibility so toggles don't cross-contaminate. */
const _pwVisible = {};


// ════════════════════════════════════════════════════════════════
// ENTRY POINT
// ════════════════════════════════════════════════════════════════
export function initAuth() {
  _wireLandingPage();
  _wireLoginPage();
  _wireSignupPage();
  _wireForgotPasswordPage();
  _wireResetPasswordPage();
  _wireGlobalInputClearErrors();
}


// ════════════════════════════════════════════════════════════════
// 1.  LANDING
// ════════════════════════════════════════════════════════════════
function _wireLandingPage() {
  document.getElementById('btn-landing-signup')
    ?.addEventListener('click', () => navigate('#/signup'));

  document.getElementById('btn-landing-login')
    ?.addEventListener('click', () => navigate('#/login'));
}


// ════════════════════════════════════════════════════════════════
// 2.  LOGIN
// ════════════════════════════════════════════════════════════════
function _wireLoginPage() {
  document.getElementById('btn-to-forgot')
    ?.addEventListener('click', () => navigate('#/forgot-password'));

  document.getElementById('btn-to-signup-from-login')
    ?.addEventListener('click', () => navigate('#/signup'));

  _wirePasswordToggle('login-pw-toggle', 'login-password');

  ['login-email', 'login-password'].forEach(id => {
    document.getElementById(id)
      ?.addEventListener('keydown', e => { if (e.key === 'Enter') _handleLogin(); });
  });

  document.getElementById('btn-login')
    ?.addEventListener('click', _handleLogin);
}

async function _handleLogin() {
  const emailEl = document.getElementById('login-email');
  const passEl  = document.getElementById('login-password');
  const btn     = document.getElementById('btn-login');

  const email    = emailEl?.value.trim().toLowerCase() || '';
  const password = passEl?.value || '';

  // Validate
  if (!email) { _fieldError(emailEl, 'Please enter your email address.'); return; }
  if (!_isValidEmail(email)) { _fieldError(emailEl, 'Please enter a valid email address.'); return; }
  if (!password) { _fieldError(passEl, 'Please enter your password.'); return; }

  _clearFieldErrors([emailEl, passEl]);
  setLoadingBtn(btn, true);

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoadingBtn(btn, false);
      const msg = error.message.toLowerCase();
      if (msg.includes('invalid') || msg.includes('credentials')) {
        _fieldError(passEl, 'Incorrect email or password. Please try again.');
      } else if (msg.includes('email not confirmed')) {
        showToast('Please confirm your email before logging in.', 'warning');
      } else {
        showToast(error.message || 'Login failed. Please try again.', 'error');
      }
      return;
    }

    // Success — router.js onAuthStateChange handles redirect to home
    if (emailEl) emailEl.value = '';
    if (passEl)  passEl.value  = '';

  } catch {
    setLoadingBtn(btn, false);
    showToast('Something went wrong. Please check your connection.', 'error');
  }
}


// ════════════════════════════════════════════════════════════════
// 3.  SIGN UP
// ════════════════════════════════════════════════════════════════
function _wireSignupPage() {
  document.getElementById('btn-to-login-from-signup')
    ?.addEventListener('click', () => navigate('#/login'));

  _wirePasswordToggle('signup-pw-toggle', 'signup-password');

  // Avatar circle → triggers hidden file input
  const trigger   = document.getElementById('avatar-upload-trigger');
  const fileInput = document.getElementById('avatar-file-input');

  trigger?.addEventListener('click', () => fileInput?.click());
  trigger?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput?.click(); }
  });
  fileInput?.addEventListener('change', _handleAvatarSelect);

  // Bio character counter
  const bioEl    = document.getElementById('signup-bio');
  const bioCount = document.getElementById('signup-bio-count');
  if (bioEl && bioCount) {
    bioEl.addEventListener('input', () => { bioCount.textContent = bioEl.value.length; });
  }

  // Field-to-field Enter navigation
  document.getElementById('signup-name')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('signup-email')?.focus(); });
  document.getElementById('signup-email')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('signup-password')?.focus(); });

  document.getElementById('btn-signup')
    ?.addEventListener('click', _handleSignup);
}

async function _handleAvatarSelect(e) {
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
    _pendingAvatarBlob = blob;

    const previewImg  = document.getElementById('avatar-preview-img');
    const placeholder = document.getElementById('avatar-upload-placeholder');
    const trigger     = document.getElementById('avatar-upload-trigger');

    if (previewImg) {
      const objUrl    = URL.createObjectURL(blob);
      previewImg.src  = objUrl;
      previewImg.classList.remove('hidden');
      previewImg.onload = () => URL.revokeObjectURL(objUrl);
    }
    if (placeholder) placeholder.classList.add('hidden');
    if (trigger)     trigger.classList.add('has-photo');

  } catch {
    showToast('Could not process image. Please try a different photo.', 'error');
    e.target.value = '';
  }
}

async function _handleSignup() {
  const nameEl   = document.getElementById('signup-name');
  const emailEl  = document.getElementById('signup-email');
  const passEl   = document.getElementById('signup-password');
  const levelEl  = document.getElementById('signup-level');
  const genderEl = document.getElementById('signup-gender');
  const deptEl   = document.getElementById('signup-department');
  const bioEl    = document.getElementById('signup-bio');
  const btn      = document.getElementById('btn-signup');

  const name       = sanitiseText(nameEl?.value, 80);
  const email      = emailEl?.value.trim().toLowerCase() || '';
  const password   = passEl?.value || '';
  const level      = levelEl?.value || '';
  const gender     = genderEl?.value || '';
  const department = deptEl?.value || '';
  const bio        = sanitiseText(bioEl?.value, 160);

  // ── Validation — collect all errors, show at once ────────────
  const fieldErrors = [];

  if (!_pendingAvatarBlob) {
    showToast('Please add a profile photo — it helps coursemates recognise you.', 'warning', 4000);
    document.getElementById('avatar-upload-trigger')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (!name || name.length < 2) {
    fieldErrors.push({ el: nameEl,   msg: 'Please enter your full name (at least 2 characters).' });
  }
  if (!email) {
    fieldErrors.push({ el: emailEl,  msg: 'Please enter your email address.' });
  } else if (!_isValidEmail(email)) {
    fieldErrors.push({ el: emailEl,  msg: 'Please enter a valid email address.' });
  }
  if (!password) {
    fieldErrors.push({ el: passEl,   msg: 'Please create a password.' });
  } else if (password.length < 8) {
    fieldErrors.push({ el: passEl,   msg: 'Password must be at least 8 characters.' });
  }
  if (!level) {
    fieldErrors.push({ el: levelEl,  msg: 'Please select your level.' });
  }
  if (!gender) {
    fieldErrors.push({ el: genderEl, msg: 'Please select your gender.' });
  }
  if (!department) {
    fieldErrors.push({ el: deptEl,   msg: 'Please select your department.' });
  }

  if (fieldErrors.length) {
    fieldErrors.forEach(({ el, msg }) => _fieldError(el, msg));
    fieldErrors[0].el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  _clearFieldErrors([nameEl, emailEl, passEl, levelEl, genderEl, deptEl]);
  setLoadingBtn(btn, true);

  try {
    // Step 1: Create auth user — trigger creates the profile row automatically
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name : name,
          department,
          level,
          gender,
          bio: bio || null,
        },
      },
    });

    if (authError) {
      setLoadingBtn(btn, false);
      const msg = authError.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('user already exists')) {
        _fieldError(emailEl, 'This email is already registered. Try logging in instead.');
      } else {
        showToast(authError.message || 'Signup failed. Please try again.', 'error');
      }
      return;
    }

    const userId = authData.user?.id;
    if (!userId) {
      setLoadingBtn(btn, false);
      showToast('Signup failed — please try again.', 'error');
      return;
    }

    // Step 2: Upload avatar
    const avatarResult = await uploadAvatar(userId, _pendingAvatarBlob);

    // Step 3: Update the profile row the trigger created with avatar fields
    if (avatarResult.url && avatarResult.path) {
      await supabase
        .from('profiles')
        .update({ avatar_url: avatarResult.url, avatar_path: avatarResult.path })
        .eq('id', userId);
    }

    // Clean up — router.js SIGNED_IN event handles the redirect
    _pendingAvatarBlob = null;
    _resetSignupForm();
    // Leave btn loading — redirect clears the page naturally

  } catch (err) {
    setLoadingBtn(btn, false);
    showToast('Something went wrong during signup. Please try again.', 'error');
    console.error('[auth] signup error:', err);
  }
}

function _resetSignupForm() {
  ['signup-name', 'signup-email', 'signup-password', 'signup-bio'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const levelEl  = document.getElementById('signup-level');
  const genderEl = document.getElementById('signup-gender');
  const deptEl   = document.getElementById('signup-department');
  if (levelEl)  levelEl.value  = '';
  if (genderEl) genderEl.value = '';
  if (deptEl)   deptEl.value   = '';

  const bioCount = document.getElementById('signup-bio-count');
  if (bioCount) bioCount.textContent = '0';

  const previewImg  = document.getElementById('avatar-preview-img');
  const placeholder = document.getElementById('avatar-upload-placeholder');
  const trigger     = document.getElementById('avatar-upload-trigger');
  const fileInput   = document.getElementById('avatar-file-input');
  if (previewImg)  { previewImg.src = ''; previewImg.classList.add('hidden'); }
  if (placeholder) placeholder.classList.remove('hidden');
  if (trigger)     trigger.classList.remove('has-photo');
  if (fileInput)   fileInput.value = '';
}


// ════════════════════════════════════════════════════════════════
// 4.  FORGOT PASSWORD
// ════════════════════════════════════════════════════════════════
function _wireForgotPasswordPage() {
  document.getElementById('btn-back-from-forgot')
    ?.addEventListener('click', () => navigate('#/login'));

  document.getElementById('btn-back-to-login-from-success')
    ?.addEventListener('click', () => {
      resetForgotPasswordPage();
      navigate('#/login');
    });

  document.getElementById('forgot-email')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') _handleForgotPassword(); });

  document.getElementById('btn-send-reset')
    ?.addEventListener('click', _handleForgotPassword);
}

async function _handleForgotPassword() {
  const emailEl = document.getElementById('forgot-email');
  const btn     = document.getElementById('btn-send-reset');
  const email   = emailEl?.value.trim().toLowerCase() || '';

  if (!email) { _fieldError(emailEl, 'Please enter your email address.'); return; }
  if (!_isValidEmail(email)) { _fieldError(emailEl, 'Please enter a valid email address.'); return; }

  _clearFieldErrors([emailEl]);
  setLoadingBtn(btn, true);

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/#/reset-password`,
    });

    setLoadingBtn(btn, false);

    if (error) {
      showToast(error.message || 'Could not send reset link. Please try again.', 'error');
      return;
    }

    // Always show success — Supabase doesn't reveal if the email exists (security)
    _showForgotSuccess();

  } catch {
    setLoadingBtn(btn, false);
    showToast('Something went wrong. Please check your connection.', 'error');
  }
}

function _showForgotSuccess() {
  document.getElementById('forgot-form-state')?.classList.add('hidden');
  const successEl = document.getElementById('forgot-success-state');
  if (successEl) {
    successEl.classList.remove('hidden');
    if (window.lucide) {
      window.lucide.createIcons({ icons: window.lucide.icons, rootElement: successEl });
    }
  }
}

/** Called by router.js when navigating back to the forgot-password page. */
export function resetForgotPasswordPage() {
  document.getElementById('forgot-form-state')?.classList.remove('hidden');
  document.getElementById('forgot-success-state')?.classList.add('hidden');
  const emailEl = document.getElementById('forgot-email');
  if (emailEl) emailEl.value = '';
  _clearFieldErrors([emailEl]);
}


// ════════════════════════════════════════════════════════════════
// 5.  RESET PASSWORD  (after user clicks the email link)
// ════════════════════════════════════════════════════════════════
function _wireResetPasswordPage() {
  _wirePasswordToggle('new-pw-toggle',     'new-password');
  _wirePasswordToggle('confirm-pw-toggle', 'confirm-password');

  ['new-password', 'confirm-password'].forEach(id => {
    document.getElementById(id)
      ?.addEventListener('keydown', e => { if (e.key === 'Enter') _handleUpdatePassword(); });
  });

  document.getElementById('btn-update-password')
    ?.addEventListener('click', _handleUpdatePassword);
}

async function _handleUpdatePassword() {
  const newPassEl     = document.getElementById('new-password');
  const confirmPassEl = document.getElementById('confirm-password');
  const btn           = document.getElementById('btn-update-password');

  const newPass     = newPassEl?.value     || '';
  const confirmPass = confirmPassEl?.value || '';

  if (!newPass) { _fieldError(newPassEl, 'Please enter a new password.'); return; }
  if (newPass.length < 8) { _fieldError(newPassEl, 'Password must be at least 8 characters.'); return; }
  if (!confirmPass) { _fieldError(confirmPassEl, 'Please confirm your new password.'); return; }
  if (newPass !== confirmPass) { _fieldError(confirmPassEl, 'Passwords do not match.'); return; }

  _clearFieldErrors([newPassEl, confirmPassEl]);
  setLoadingBtn(btn, true);

  try {
    const { error } = await supabase.auth.updateUser({ password: newPass });

    if (error) {
      setLoadingBtn(btn, false);
      showToast(error.message || 'Could not update password. Please try again.', 'error');
      return;
    }

    // router.js USER_UPDATED event fires → shows toast + navigates to home
    if (newPassEl)     newPassEl.value     = '';
    if (confirmPassEl) confirmPassEl.value = '';

  } catch {
    setLoadingBtn(btn, false);
    showToast('Something went wrong. Please try again.', 'error');
  }
}


// ════════════════════════════════════════════════════════════════
// 6.  AVATAR UPLOAD  (exported — also used by profile.js for edits)
// ════════════════════════════════════════════════════════════════

/**
 * Upload a compressed image Blob to Supabase Storage.
 * Storage path: avatars/{userId}/avatar.jpg
 * Uses upsert so it overwrites the old photo automatically.
 *
 * @param   {string} userId  Auth user UUID.
 * @param   {Blob}   blob    Compressed image from compressImage().
 * @returns {{ url: string|null, path: string|null }}
 */
export async function uploadAvatar(userId, blob) {
  const path = `${userId}/avatar.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, blob, {
      contentType : 'image/jpeg',
      upsert      : true,
      cacheControl: '3600',
    });

  if (uploadError) {
    console.error('[auth] avatar upload:', uploadError.message);
    showToast(
      'Profile photo could not be saved — you can add it later from Edit Profile.',
      'warning',
      5000,
    );
    return { url: null, path: null };
  }

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);

  // Cache-bust so the new photo shows immediately after an edit
  const publicUrl = urlData?.publicUrl
    ? `${urlData.publicUrl}?t=${Date.now()}`
    : null;

  return { url: publicUrl, path };
}


// ════════════════════════════════════════════════════════════════
// 7.  PASSWORD TOGGLE
// ════════════════════════════════════════════════════════════════
function _wirePasswordToggle(toggleId, inputId) {
  const btn   = document.getElementById(toggleId);
  const input = document.getElementById(inputId);
  if (!btn || !input) return;

  _pwVisible[inputId] = false;

  btn.addEventListener('click', () => {
    _pwVisible[inputId] = !_pwVisible[inputId];
    const show = _pwVisible[inputId];

    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    btn.innerHTML = show
      ? '<i data-lucide="eye-off" aria-hidden="true"></i>'
      : '<i data-lucide="eye"     aria-hidden="true"></i>';

    if (window.lucide) {
      window.lucide.createIcons({ icons: window.lucide.icons, rootElement: btn });
    }

    // Keep cursor at end after type switch
    const len = input.value.length;
    input.setSelectionRange(len, len);
    input.focus();
  });
}


// ════════════════════════════════════════════════════════════════
// 8.  FORM VALIDATION HELPERS
// ════════════════════════════════════════════════════════════════

function _fieldError(el, message) {
  if (!el) return;
  el.classList.add('error');
  _removeErrorMsg(el);

  const errEl = document.createElement('p');
  errEl.id            = `err-${el.id}`;
  errEl.className     = 'field-error-msg';
  errEl.textContent   = message;
  errEl.style.cssText = [
    'font-size:var(--font-size-xs)',
    'color:var(--text-danger)',
    'margin-top:4px',
    'font-weight:500',
    'line-height:1.4',
  ].join(';');
  errEl.setAttribute('role', 'alert');

  // Insert after the input or its wrapper
  const insertAfter = el.closest('.input-pw-wrap') || el;
  insertAfter.insertAdjacentElement('afterend', errEl);

  el.setAttribute('aria-invalid', 'true');
}

function _removeErrorMsg(el) {
  if (!el) return;
  el.classList.remove('error');
  el.removeAttribute('aria-invalid');
  const existing = document.getElementById(`err-${el.id}`);
  if (existing) existing.remove();
}

function _clearFieldErrors(els = []) {
  els.forEach(el => _removeErrorMsg(el));
}

/** Auto-clear error styling as the user types or changes a select. */
function _wireGlobalInputClearErrors() {
  document.addEventListener('input',  e => {
    if (e.target.matches('.form-input, .form-textarea')) _removeErrorMsg(e.target);
  });
  document.addEventListener('change', e => {
    if (e.target.matches('.form-select')) _removeErrorMsg(e.target);
  });
}

function _isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}