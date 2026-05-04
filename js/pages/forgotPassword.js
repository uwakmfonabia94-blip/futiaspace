// js/pages/forgotPassword.js
import { supabase } from '../supabase.js';
import { navigate } from '../router.js';
import { showToast } from '../ui/toast.js';

export function renderForgotPassword() {
  const main = document.getElementById('mainContent');
  if (!main) return;

  main.innerHTML = `
    <div class="auth-container">
      <div class="auth-logo">
        <img src="logo.svg" alt="FutiaSpace" />
      </div>
      <h1 class="auth-title">Reset password</h1>
      <p class="auth-subtitle">Enter your email address and we'll send you a link to reset your password.</p>
      <form id="forgotPasswordForm">
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" placeholder="Your Email" required />
        </div>
        <button type="submit" class="btn btn-primary" id="resetBtn">Send reset link</button>
      </form>
      <p class="auth-link"><a href="#/login">Back to login</a></p>
      <div id="resetError" style="color: var(--color-danger); text-align:center; margin-top:16px;"></div>
      <div class="auth-footer">&copy; 2026 Uwakmfon Theophilus Production</div>
    </div>
  `;

  lucide.createIcons();

  const form = document.getElementById('forgotPasswordForm');
  const btn = document.getElementById('resetBtn');
  const errorEl = document.getElementById('resetError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const email = document.getElementById('email').value.trim();

    if (!email) {
      errorEl.textContent = 'Please enter your email address.';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending...';

    // IMPORTANT: Do NOT include a hash (#) in redirectTo.
    // Supabase will append the token as a hash fragment automatically.
    const redirectTo = `${window.location.origin}/update-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      errorEl.textContent = error.message;
      btn.disabled = false;
      btn.textContent = 'Send reset link';
    } else {
      showToast('Reset link sent to your email!', 'success');
      // Clear the form and redirect after a short delay
      document.getElementById('email').value = '';
      setTimeout(() => navigate('/login'), 3000);
    }
  });
}