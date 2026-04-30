// js/ui/imageViewer.js
export function openImageViewer(url) {
  if (!url) return;
  const overlay = document.createElement('div');
  overlay.className = 'image-viewer-overlay';
  overlay.innerHTML = `
    <div class="image-viewer-container">
      <button class="image-viewer-close"><i data-lucide="x"></i></button>
      <img src="${url}" class="image-viewer-img" alt="Full view" />
    </div>
  `;
  document.body.appendChild(overlay);
  lucide.createIcons({ target: overlay });

  const close = () => overlay.remove();

  overlay.addEventListener('click', (e) => {
    if (e.target.closest('.image-viewer-close') || e.target === overlay) {
      close();
    }
  });

  window.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') {
      close();
      window.removeEventListener('keydown', esc);
    }
  });
}

// Expose globally (for inline onclick attributes)
window.openImageViewer = openImageViewer;