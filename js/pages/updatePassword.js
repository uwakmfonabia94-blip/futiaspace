// js/pages/updatePassword.js
import { supabase } from '../supabase.js';
import { navigate } from '../router.js';
import { showToast } from '../ui/toast.js';

export async function renderUpdatePassword() {
  const main = document.getElementById('mainContent');
  if (!main) return;

  // First, try to extract token from URL hash (for reset links)
  let session = null;
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');

  if (accessToken && refreshToken) {
    // Manually set the session from the reset link
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (!error && data.session) {
      session = data.session;
    } else {
      console.error('Session set error:', error);
    }
  }

  // If no session from hash, try normal session
  if (!session) {
    const { data: { session: existingSession }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !existingSession) {
      showToast('Invalid or expired reset link. Please request a new one.', 'error');
      navigate('/forgot-password');
      return;
    }
    session = existingSession;
  }

  // Render the form
  main.innerHTML = `
    <div class="auth-container">
      <div class="auth-logo">
        <img src="logo.svg" alt="FutiaSpace" />
      </div>
      <h1 class="auth-title">Set new password</h1>
      <p class="auth-subtitle">Choose a strong password for your account.</p>
      <form id="updatePasswordForm">
        <div class="form-group">
          <label for="password">New password</label>
          <input type="password" id="password" required minlength="6" placeholder="At least 6 characters" />
          <button type="button" class="password-toggle" id="togglePassword">
            <i data-lucide="eye"></i>
          </button>
        </div>
        <div class="form-group">
          <label for="confirm">Confirm password</label>
          <input type="password" id="confirm" required placeholder="Confirm new password" />
        </div>
        <button type="submit" class="btn btn-primary" id="updateBtn">Update password</button>
      </form>
      <div id="updateError" style="color: var(--color-danger); text-align:center; margin-top:16px;"></div>
      <div class="auth-footer">&copy; 2026 Uwakmfon Theophilus Production</div>
    </div>
  `;
  lucide.createIcons();

  // Password toggle
  const toggleBtn = document.getElementById('togglePassword');
  const pwField = document.getElementById('password');
  let showPw = false;
  toggleBtn.addEventListener('click', () => {
    showPw = !showPw;
    pwField.type = showPw ? 'text' : 'password';
    toggleBtn.innerHTML = `<i data-lucide="${showPw ? 'eye-off' : 'eye'}"></i>`;
    lucide.createIcons({ target: toggleBtn });
  });

  const form = document.getElementById('updatePasswordForm');
  const btn = document.getElementById('updateBtn');
  const errorEl = document.getElementById('updateError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';

    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirm').value;

    if (password !== confirm) {
      errorEl.textContent = 'Passwords do not match.';
      return;
    }
    if (password.length < 6) {
      errorEl.textContent = 'Password must be at least 6 characters.';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Updating...';

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      errorEl.textContent = error.message;
      btn.disabled = false;
      btn.textContent = 'Update password';
    } else {
      showToast('Password updated successfully! Please log in.', 'success');
      await supabase.auth.signOut();
      navigate('/login');
    }
  });
}