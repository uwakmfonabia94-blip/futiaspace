// js/pages/updatePassword.js
import { supabase } from '../supabase.js';
import { navigate } from '../router.js';
import { showToast } from '../ui/toast.js';

export async function renderUpdatePassword() {
  const main = document.getElementById('mainContent');
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

  // The reset link gives us a session automatically; we just need to update the user's password.
  // First, ensure we have a session. If not, redirect to login.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    showToast('Invalid or expired reset link. Please request a new one.', 'error');
    navigate('/forgot-password');
    return;
  }

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