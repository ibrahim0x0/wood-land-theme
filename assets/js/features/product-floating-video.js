/**
 * Floating Product Video
 *
 * Drives the draggable corner video rendered by
 * components/products/product-floating-video.jinja (id="wdl-pop-video").
 * Markup/source come from Layout Settings → Product Videos → Floating videos;
 * this module only handles close / expand / mute and pointer dragging with
 * rAF-smoothed motion + edge snapping.
 */

function initFloatingVideo() {
  const wrapper = document.getElementById("wdl-pop-video");
  if (!wrapper || wrapper.dataset.fvInit === "1") return;
  wrapper.dataset.fvInit = "1";

  const video = wrapper.querySelector("video");
  const closeBtn = wrapper.querySelector(".wdl-pv__close");
  const expandBtn = wrapper.querySelector(".wdl-pv__expand");
  const muteBtn = wrapper.querySelector(".wdl-pv__mute");
  const icoExpand = wrapper.querySelector(".wdl-pv__ico-expand");
  const icoCollapse = wrapper.querySelector(".wdl-pv__ico-collapse");
  const icoMuted = wrapper.querySelector(".wdl-pv__ico-muted");
  const icoUnmuted = wrapper.querySelector(".wdl-pv__ico-unmuted");

  let isExpanded = false;

  closeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    wrapper.classList.add("is-hidden");
    video?.pause();
  });

  expandBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    isExpanded = !isExpanded;
    wrapper.classList.toggle("is-expanded", isExpanded);
    wrapper.classList.toggle("is-collapsed", !isExpanded);
    if (icoExpand) icoExpand.style.display = isExpanded ? "none" : "block";
    if (icoCollapse) icoCollapse.style.display = isExpanded ? "block" : "none";
  });

  muteBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!video) return;
    video.muted = !video.muted;
    if (icoMuted) icoMuted.style.display = video.muted ? "block" : "none";
    if (icoUnmuted) icoUnmuted.style.display = video.muted ? "none" : "block";
  });

  // ── Dragging: pointer events + rAF lerp + edge snapping ──
  const EDGE_MARGIN = 12;
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  let isDragging = false;
  let startX, startY, currentLeft, currentBottom, targetLeft, targetBottom;
  let rafId = null;

  const updatePosition = () => {
    wrapper.style.left = currentLeft + "px";
    wrapper.style.bottom = currentBottom + "px";
    wrapper.style.right = "auto";
    wrapper.style.top = "auto";

    if (isDragging) {
      const dx = targetLeft - currentLeft;
      const dy = targetBottom - currentBottom;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        currentLeft += dx * 0.35;
        currentBottom += dy * 0.35;
        rafId = requestAnimationFrame(updatePosition);
      } else {
        currentLeft = targetLeft;
        currentBottom = targetBottom;
        wrapper.style.left = currentLeft + "px";
        wrapper.style.bottom = currentBottom + "px";
      }
    }
  };

  const onPointerDown = (e) => {
    if (e.target.closest(".wdl-pv__btn")) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = wrapper.getBoundingClientRect();
    currentLeft = rect.left;
    currentBottom = window.innerHeight - rect.bottom;
    targetLeft = currentLeft;
    targetBottom = currentBottom;

    wrapper.classList.add("is-dragging");
    wrapper.classList.remove("is-snapping");
    wrapper.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const rect = wrapper.getBoundingClientRect();

    targetLeft = clamp(currentLeft + dx, 0, window.innerWidth - rect.width);
    targetBottom = clamp(currentBottom - dy, 0, window.innerHeight - rect.height);

    startX = e.clientX;
    startY = e.clientY;
    currentLeft = targetLeft;
    currentBottom = targetBottom;

    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(updatePosition);
  };

  const onPointerUp = () => {
    if (!isDragging) return;
    isDragging = false;
    wrapper.classList.remove("is-dragging");
    if (rafId) cancelAnimationFrame(rafId);

    const rect = wrapper.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const centerX = rect.left + rect.width / 2;

    wrapper.classList.add("is-snapping");
    wrapper.style.left = centerX < vw / 2 ? EDGE_MARGIN + "px" : vw - rect.width - EDGE_MARGIN + "px";
    wrapper.style.bottom = clamp(vh - rect.bottom, EDGE_MARGIN, vh - rect.height - EDGE_MARGIN) + "px";

    setTimeout(() => wrapper.classList.remove("is-snapping"), 350);
  };

  wrapper.addEventListener("pointerdown", onPointerDown);
  wrapper.addEventListener("pointermove", onPointerMove);
  wrapper.addEventListener("pointerup", onPointerUp);
  wrapper.addEventListener("pointercancel", onPointerUp);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFloatingVideo);
} else {
  initFloatingVideo();
}
