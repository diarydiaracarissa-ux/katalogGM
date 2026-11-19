/**
 * Full-Resolution Original Photo Lightbox
 * Menampilkan foto asli 100% utuh (tanpa crop) dengan fitur Zoom, Pan,
 * dan tombol Buka Foto Asli untuk melihat detail serat kain gorden dengan jelas.
 */

export class OriginalPhotoLightbox {
  constructor() {
    this.el = document.getElementById('photoLightbox');
    this.stage = document.getElementById('lightboxStage');
    this.img = document.getElementById('lightboxImg');
    this.titleEl = document.getElementById('lightboxTitle');
    this.metaEl = document.getElementById('lightboxMeta');
    this.zoomLabel = document.getElementById('lightboxZoomLabel');
    this.openRawBtn = document.getElementById('lightboxOpenRaw');
    this.cleanToggleBtn = document.getElementById('lightboxCleanToggle');

    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.isOpen = false;
    this.cleanMode = false;

    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('lightboxClose')?.addEventListener('click', () => this.close());
    document.getElementById('lightboxZoomIn')?.addEventListener('click', () => this.setZoom(this.scale + 0.5));
    document.getElementById('lightboxZoomOut')?.addEventListener('click', () => this.setZoom(this.scale - 0.5));
    document.getElementById('lightboxZoomReset')?.addEventListener('click', () => this.resetTransform());

    this.cleanToggleBtn?.addEventListener('click', () => {
      this.cleanMode = !this.cleanMode;
      this.el.classList.toggle('clean-mode', this.cleanMode);
      this.cleanToggleBtn.textContent = this.cleanMode ? 'Tampilkan Info' : 'Mode Bersih';
    });

    // Click backdrop to close (only when not zoomed/dragging)
    this.stage?.addEventListener('click', (e) => {
      if (e.target === this.stage && this.scale === 1) {
        this.close();
      }
    });

    // Double click image to toggle 2x zoom
    this.img?.addEventListener('dblclick', (e) => {
      e.preventDefault();
      if (this.scale > 1.1) {
        this.resetTransform();
      } else {
        this.setZoom(2.2);
      }
    });

    // Mouse wheel zoom
    this.stage?.addEventListener(
      'wheel',
      (e) => {
        if (!this.isOpen) return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.25 : -0.25;
        this.setZoom(this.scale + delta);
      },
      { passive: false }
    );

    // Drag-to-pan when zoomed
    this.img?.addEventListener('pointerdown', (e) => {
      if (this.scale <= 1) return;
      this.isDragging = true;
      this.startX = e.clientX - this.translateX;
      this.startY = e.clientY - this.translateY;
      this.img.setPointerCapture(e.pointerId);
      this.img.classList.add('grabbing');
    });

    this.img?.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      this.translateX = e.clientX - this.startX;
      this.translateY = e.clientY - this.startY;
      this.applyTransform();
    });

    const endDrag = () => {
      this.isDragging = false;
      this.img?.classList.remove('grabbing');
    };
    this.img?.addEventListener('pointerup', endDrag);
    this.img?.addEventListener('pointercancel', endDrag);

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') this.close();
      else if (e.key === '+' || e.key === '=') this.setZoom(this.scale + 0.4);
      else if (e.key === '-') this.setZoom(this.scale - 0.4);
      else if (e.key === '0') this.resetTransform();
    });
  }

  open({ imageUrl, title, metaText }) {
    this.isOpen = true;
    this.cleanMode = false;
    this.el.classList.remove('clean-mode');
    if (this.cleanToggleBtn) this.cleanToggleBtn.textContent = 'Mode Bersih';

    this.img.src = imageUrl;
    this.img.alt = title || 'Foto Asli Gorden';
    this.titleEl.textContent = title || 'Foto Asli Produk';
    this.metaEl.textContent = metaText || 'Foto asli resolusi penuh tanpa crop';
    this.openRawBtn.href = imageUrl;

    this.resetTransform();
    this.el.classList.add('open');
    this.el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Update exact natural dimensions once loaded
    this.img.onload = () => {
      if (this.img.naturalWidth && this.img.naturalHeight) {
        const res = `${this.img.naturalWidth} × ${this.img.naturalHeight} px`;
        this.metaEl.textContent = metaText ? `${res} • ${metaText}` : `${res} • Foto Asli Resolusi Penuh`;
      }
    };
  }

  close() {
    this.isOpen = false;
    this.el.classList.remove('open');
    this.el.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  setZoom(nextScale) {
    this.scale = Math.max(1, Math.min(3.5, Number(nextScale.toFixed(2))));
    if (this.scale === 1) {
      this.translateX = 0;
      this.translateY = 0;
    }
    this.applyTransform();
  }

  resetTransform() {
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.applyTransform();
  }

  applyTransform() {
    this.img.style.transform = `translate3d(${this.translateX}px, ${this.translateY}px, 0) scale(${this.scale})`;
    this.img.classList.toggle('zoomed', this.scale > 1);
    if (this.zoomLabel) {
      this.zoomLabel.textContent = `${Math.round(this.scale * 100)}%`;
    }
  }
}
