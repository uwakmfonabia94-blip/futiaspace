// js/pages/landing.js
import { navigate } from '../router.js';

export function renderLanding() {
  const main = document.getElementById('mainContent');
  if (!main) return;

  main.innerHTML = `
    <div class="landing-page">
      <div class="landing-logo">
        <img src="logo.svg" alt="FutiaSpace" />
      </div>
      <h1 class="landing-title">FutiaSpace</h1>
      <p class="landing-subtitle">The official campus network for FUTIA students.</p>
      <p class="landing-description">
        Connect with classmates, share campus moments, and stay in the loop — all in one place.
      </p>
      <div class="landing-buttons">
        <button class="btn btn-primary btn-lg" id="getStartedBtn">Get Started</button>
        <button class="btn btn-secondary btn-lg" id="loginBtnLanding">Log In</button>
      </div>
      <footer class="auth-footer">&copy; 2026 Uwakmfon Theophilus Production</footer>
    </div>
  `;

  document.getElementById('getStartedBtn').addEventListener('click', () => {
    navigate('/signup');
  });
  document.getElementById('loginBtnLanding').addEventListener('click', () => {
    navigate('/login');
  });
}