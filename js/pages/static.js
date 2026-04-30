// js/pages/static.js
export function renderPrivacy() {
  setStaticContent('Privacy Policy', `
    <p>We don't share your personal data with third parties. All information is used solely for campus networking.</p>
  `);
}

export function renderAbout() {
  setStaticContent('About FutiaSpace', `
    <p>FutiaSpace is the official campus network for Federal University of Technology, Ikot Abasi. Connect with classmates, share moments, and stay in the loop.</p>
  `);
}

export function renderGuidelines() {
  setStaticContent('Community Guidelines', `
    <p>Be respectful. No hate speech, harassment, or inappropriate content. Keep the campus vibe friendly!</p>
  `);
}

function setStaticContent(title, content) {
  const main = document.getElementById('mainContent');
  if (!main) return;
  main.innerHTML = `
    <div style="padding:24px;">
      <h2 style="margin-bottom:16px;">${title}</h2>
      ${content}
    </div>
  `;
}