/**
 * Hero background video — deferred, breakpoint-aware loader.
 *
 * The hero ships its background <video> with NO `autoplay` and an empty
 * <source> (the URL is parked in `data-src`), so nothing downloads at parse
 * time. That keeps the (often multi-MB, merchant-uploaded) video off the LCP
 * critical path — previously `autoplay` forced an immediate full download,
 * silently overriding `preload="none"` and pushing LCP past 10s on mobile.
 *
 * Once the main thread is idle (post-LCP) this module loads ONLY the video
 * CSS actually shows at the current breakpoint, then plays it. Visibility is
 * read from the computed `display`, so it inherits the theme's existing
 * media-query rules AND the reduced-motion opt-out
 * (`.hero-bg-video[data-respect-motion]` → display:none) for free: a hidden
 * video is never even fetched. So a mobile visitor never downloads the
 * desktop file, and vice-versa.
 */

function loadVideo(video) {
  if (video.dataset.heroVideoLoaded === "true") return;
  const source = video.querySelector("source[data-src]");
  if (!source || !source.dataset.src) return;
  video.dataset.heroVideoLoaded = "true";
  source.src = source.dataset.src;
  video.load();

  // The video starts at opacity:0 (CSS) so the static .hero-bg-img behind it
  // stays visible while it downloads + decodes. Reveal it only once a REAL
  // frame is on screen, so the swap is a clean cross-fade instead of a pop or
  // a black flash (load() clears the poster before the first frame paints).
  // requestVideoFrameCallback fires on actual frame presentation (smoothest);
  // `playing` is the fallback for browsers that lack rVFC. Both are idempotent.
  const reveal = () => video.classList.add("is-playing");
  if (typeof video.requestVideoFrameCallback === "function") {
    video.requestVideoFrameCallback(reveal);
  }
  video.addEventListener("playing", reveal, { once: true });

  // Muted + playsinline → the browser allows a programmatic play(). Swallow
  // the rejection some battery-saver / data-saver modes still throw; the
  // poster (or a blank background) remains as a graceful fallback.
  const p = video.play();
  if (p && typeof p.catch === "function") p.catch(() => {});
}

function activate() {
  document.querySelectorAll(".hero-bg-video").forEach((video) => {
    const visible = window.getComputedStyle(video).display !== "none";
    if (visible) {
      loadVideo(video);
    } else if (video.dataset.heroVideoLoaded === "true" && !video.paused) {
      // A breakpoint flip hid a video we'd loaded — stop decoding it.
      video.pause();
    }
  });
}

function scheduleActivate() {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(activate, { timeout: 1500 });
  } else {
    setTimeout(activate, 1200);
  }
}

// Breakpoint flip (e.g. orientation change) can reveal the other video —
// bind ONCE so repeated content:loaded re-inits don't stack listeners.
let mqBound = false;
function bindBreakpoint() {
  if (mqBound || !window.matchMedia) return;
  mqBound = true;
  const mq = window.matchMedia("(min-width: 768px)");
  if (mq.addEventListener) mq.addEventListener("change", activate);
  else if (mq.addListener) mq.addListener(activate); // Safari < 14
}

function init() {
  if (!document.querySelector(".hero-bg-video")) return;
  bindBreakpoint();
  scheduleActivate();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
// Re-scan when content is injected (e.g. editor live-preview re-render).
document.addEventListener("content:loaded", init);
