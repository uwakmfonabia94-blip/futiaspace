// js/pages/login.js
import { navigate } from '../router.js';
import { supabase } from '../supabase.js';

export function renderLogin() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="auth-container">
      <div class="auth-logo">
        <img src="logo.svg" alt="FutiaSpace" />
      </div>
      <h1 class="auth-title">Welcome back</h1>
      <p class="auth-subtitle">Sign in to continue to your campus community.</p>
      <form id="loginForm">
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" placeholder="Your Email" required />
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" placeholder="Your Password" required />
          <button type="button" class="password-toggle" id="togglePassword">
            <i data-lucide="eye"></i>
          </button>
        </div>
        <button type="submit" class="btn btn-primary" id="loginBtn">Log In</button>
      </form>
      <p class="auth-link">Don't have an account? <a href="#/signup">Sign up</a></p>
      <div id="loginError" style="color: var(--color-danger); text-align:center; margin-top:16px;"></div>
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

  // Form submission
  const form = document.getElementById('loginForm');
  const btn = document.getElementById('loginBtn');
  const errorEl = document.getElementById('loginError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const email = document.getElementById('email').value;
    const password = pwField.value;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      errorEl.textContent = error.message;
      btn.disabled = false;
      btn.textContent = 'Log In';
    }
    // onAuthStateChange handles the rest
  });
}