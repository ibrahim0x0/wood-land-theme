/**
 * Product Video Testimonials
 *
 * Wires the customer-video carousel rendered by
 * components/products/product-video-testimonials.jinja (id="wdl-vid-section").
 * The markup/data are produced server-side from Layout Settings → Product
 * Videos; this module only handles interaction: play/pause, dots, arrows,
 * and keeping the active dot in sync as the strip is scrolled.
 */

function initVideoTestimonials() {
  const section = document.getElementById("wdl-vid-section");
  if (!section || section.dataset.vidInit === "1") return;
  section.dataset.vidInit = "1";

  const slider = section.querySelector(".wdl-v__slider");
  const cards = Array.from(section.querySelectorAll(".wdl-v__card"));
  const dots = Array.from(section.querySelectorAll(".wdl-v__dot"));
  const prevBtn = section.querySelector(".wdl-v__nav--prev");
  const nextBtn = section.querySelector(".wdl-v__nav--next");
  const videos = Array.from(section.querySelectorAll("video"));
  if (!slider || !cards.length) return;

  let currentIndex = 0;

  const updateUI = () => {
    dots.forEach((d, di) => d.classList.toggle("is-active", di === currentIndex));
    if (prevBtn) prevBtn.disabled = currentIndex === 0;
    if (nextBtn) nextBtn.disabled = currentIndex === cards.length - 1;
  };

  const goTo = (i) => {
    currentIndex = Math.max(0, Math.min(cards.length - 1, i));
    cards[currentIndex].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    updateUI();
  };

  // Per-card play/pause. Unmutes on play; falls back to muted autoplay if the
  // browser blocks sound. Pauses every other video first (one at a time).
  cards.forEach((card) => {
    const media = card.querySelector(".wdl-v__media");
    const video = card.querySelector("video");
    const playBtn = card.querySelector(".wdl-v__play");
    if (!media || !video) return;

    media.addEventListener("click", () => {
      if (video.paused) {
        videos.forEach((v) => {
          if (v !== video && !v.paused) {
            v.pause();
            v.parentElement.querySelector(".wdl-v__play")?.classList.remove("is-hidden");
          }
        });
        video.muted = false;
        const p = video.play();
        if (p && p.then) {
          p.then(() => playBtn?.classList.add("is-hidden")).catch(() => {
            video.muted = true;
            video.play().then(() => playBtn?.classList.add("is-hidden")).catch(() => {});
          });
        }
      } else {
        video.pause();
        playBtn?.classList.remove("is-hidden");
      }
    });

    video.addEventListener("ended", () => playBtn?.classList.remove("is-hidden"));
  });

  prevBtn?.addEventListener("click", () => goTo(currentIndex - 1));
  nextBtn?.addEventListener("click", () => goTo(currentIndex + 1));
  dots.forEach((dot, i) => dot.addEventListener("click", () => goTo(i)));

  // Keep currentIndex in sync as the user free-scrolls the strip.
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && e.intersectionRatio >= 0.6) {
          currentIndex = parseInt(e.target.dataset.index, 10) || 0;
          updateUI();
        }
      });
    },
    { root: slider, threshold: [0.6] }
  );
  cards.forEach((c) => io.observe(c));

  updateUI();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initVideoTestimonials);
} else {
  initVideoTestimonials();
}
