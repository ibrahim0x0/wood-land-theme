/**
 * Embla Carousel Factory
 *
 * Creates consistent carousel instances with common features:
 * - RTL support (automatic)
 * - Navigation buttons
 * - Dots
 * - Progress bar
 * - Thumbnail sync
 * - Autoplay
 * - Fade effect
 */

import EmblaCarousel from "embla-carousel";
import Autoplay from "embla-carousel-autoplay";
import Fade from "embla-carousel-fade";
import AutoScroll from "embla-carousel-auto-scroll";
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";

/**
 * Enable mouse drag-to-scroll on a native horizontal scroll container whose
 * cards are direct children (no inner transform track). Touch already scrolls
 * natively; this adds the desktop mouse-drag affordance the recommended strips
 * were missing. Sets `scrollLeft` directly (fine for short strips), with a 4px
 * threshold + capture-phase click guard so card links still work after a drag.
 *
 * @param {HTMLElement} el - the scroll viewport
 */
export function enableDragScroll(el) {
  if (!el || el.dataset.dragScroll === "1") return;
  el.dataset.dragScroll = "1";
  let down = false;
  let moved = false;
  let startX = 0;
  let startLeft = 0;
  el.style.cursor = "grab";
  el.addEventListener("dragstart", (e) => e.preventDefault());
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    down = true;
    moved = false;
    startX = e.clientX;
    startLeft = el.scrollLeft;
  });
  el.addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (!moved) {
      if (Math.abs(dx) < 4) return;
      moved = true;
      el.style.cursor = "grabbing";
      el.style.userSelect = "none";
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
    }
    el.scrollLeft = startLeft - dx;
  });
  const end = (e) => {
    if (!down) return;
    down = false;
    el.style.cursor = "grab";
    el.style.userSelect = "";
    try { el.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  // Capture-phase guard: swallow the click that ends a drag so a card's
  // <a>/<button> doesn't fire when the user was actually scrolling.
  el.addEventListener(
    "click",
    (e) => {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
    },
    true
  );
}

/**
 * Pause an auto-animating carousel while it's scrolled out of the viewport.
 *
 * A content-heavy home page can stack 40+ carousels — several of them
 * auto-scrolling marquees. Embla's AutoScroll/Autoplay (and the native
 * setInterval autoplay) each keep a rAF/timer loop running even when the strip
 * is far off-screen, so they pile up into seconds of wasted main-thread work
 * (the dominant TBT/INP cost on a long storefront home). An IntersectionObserver
 * runs OFF the main thread and lets us stop each loop the moment it leaves the
 * viewport and resume it when it returns — no visible change for the user, since
 * whatever is on screen is always the thing that keeps moving.
 *
 * @param {HTMLElement} el    element to observe (the carousel container)
 * @param {() => void}  play  resume the animation
 * @param {() => void}  stop  pause the animation
 * @returns {() => void} cleanup that disconnects the observer
 */
function pauseWhenOffscreen(el, play, stop) {
  if (!el || typeof IntersectionObserver === "undefined") return () => {};
  let visible = true;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting === visible) continue;
        visible = entry.isIntersecting;
        if (visible) play();
        else stop();
      }
    },
    // Start a little before it scrolls into view so it's already moving by the
    // time it's visible; any pixel of overlap counts as visible.
    { rootMargin: "200px 0px", threshold: 0 }
  );
  io.observe(el);
  return () => io.disconnect();
}

/**
 * Create a carousel instance
 *
 * @param {HTMLElement|string} container - Container element or selector
 * @param {Object} options - Configuration options
 * @param {boolean} options.loop - Enable infinite loop (default: false)
 * @param {string} options.align - Slide alignment: 'start' | 'center' | 'end' (default: 'start')
 * @param {boolean} options.fade - Enable fade transition (default: false)
 * @param {number|false} options.autoplay - Autoplay delay in ms, false to disable (default: false)
 * @param {number|false} options.autoScroll - Auto-scroll speed, false to disable (default: false)
 * @param {boolean} options.dragFree - Enable free dragging (default: false)
 *
 * @returns {Object} Carousel instance with methods: scrollTo, scrollPrev, scrollNext, destroy, embla
 *
 * @example
 * // Basic carousel
 * const carousel = createCarousel('#my-carousel');
 *
 * // With autoplay and fade
 * const heroCarousel = createCarousel(element, {
 *   loop: true,
 *   autoplay: 5000,
 *   fade: true
 * });
 *
 * // Cleanup
 * carousel.destroy();
 */
export function createCarousel(container, options = {}) {
  const containerEl = typeof container === "string" ? document.querySelector(container) : container;

  if (!containerEl) {
    console.warn("Carousel container not found:", container);
    return null;
  }

  // Find viewport (may be a child element or the container itself)
  const viewport =
    containerEl.querySelector("[data-carousel-viewport]") ||
    containerEl.querySelector(".embla__viewport") ||
    containerEl.querySelector(".products-embla__viewport") ||
    containerEl.querySelector(".embla") ||
    containerEl;

  // Check if we have slides
  const slides = viewport.querySelectorAll(
    ".embla__slide, .products-embla__slide, .product-gallery__slide, .product-gallery-thumbs__slide, [data-carousel-slide]"
  );
  if (slides.length <= 1 && !options.forceInit) {
    return null;
  }

  // Native scroll-snap mode (product rows). Native overflow scrolling is far
  // smoother on touch than Embla's JS/rAF-driven drag: it runs on the
  // COMPOSITOR thread, so swiping stays buttery even when the main thread is
  // congested (this storefront's platform SDK keeps it busy for seconds). We
  // keep Embla for marquees (auto-scroll), fades, loops and the gallery.
  if (options.native) {
    return createNativeCarousel(containerEl, viewport, slides, options);
  }

  // RTL support
  const isRTL = document.dir === "rtl" || document.documentElement.dir === "rtl";

  // Build plugins array
  const plugins = [];

  if (options.fade) {
    plugins.push(Fade());
  }

  if (options.autoplay) {
    plugins.push(
      Autoplay({
        delay: options.autoplay,
        stopOnMouseEnter: true,
        stopOnInteraction: false
      })
    );
  }

  // Wheel / trackpad horizontal scrolling. Without this, a horizontal
  // trackpad swipe (or shift-scroll) isn't caught by Embla; the browser then
  // runs its overscroll / back-navigation gesture, which animates and snaps
  // back — feeling like the slider "scrolls left and returns" and is janky.
  // Skipped for auto-scroll marquees and fade carousels, where intercepting
  // the wheel would fight the continuous motion / cross-fade. The plugin uses
  // the wheel's natural axis, so vertical page scroll still passes through.
  if (!options.autoScroll && !options.fade && options.wheel !== false) {
    plugins.push(WheelGesturesPlugin());
  }

  if (options.autoScroll) {
    plugins.push(
      AutoScroll({
        speed: options.autoScroll,
        // 'forward' (default) scrolls toward the END of the slides
        // → in LTR this means R→L, in RTL it's L→R (Embla picks the
        // correct visual direction from `document.dir` automatically).
        // 'backward' is the inverse.
        direction: options.autoScrollDirection || "forward",
        // For continuous marquees `stopOnInteraction: false` keeps
        // the strip flowing after the user touches/drags. We still
        // honor `stopOnMouseEnter` so a hover pause is opt-in via
        // the calling section's settings.
        stopOnInteraction: false,
        stopOnMouseEnter: options.autoScrollPauseOnHover === true
      })
    );
  }

  // Embla options
  const emblaOptions = {
    direction: isRTL ? "rtl" : "ltr",
    loop: options.loop ?? false,
    align: options.align ?? "start",
    containScroll: options.containScroll ?? "trimSnaps",
    slidesToScroll: options.slidesToScroll ?? 1,
    dragFree: options.dragFree ?? false,
    duration: options.fade ? 25 : 20
  };

  // Initialize Embla
  const embla = EmblaCarousel(viewport, emblaOptions, plugins);

  // Setup navigation buttons
  setupNavigation(containerEl, embla);

  // Setup dots if present
  setupDots(containerEl, embla);

  // Setup progress bar if present
  setupProgress(containerEl, embla);

  // Grab-cursor affordance: the slider is drag-scrollable, so on devices
  // with a pointer we show `grab` at rest and `grabbing` while dragging —
  // signalling "you can swipe this" the moment the cursor enters. Embla
  // emits pointerDown/pointerUp for exactly this. Touch devices have no
  // cursor so it's a harmless no-op there; child links/buttons keep their
  // own `cursor: pointer`. Skipped for fade carousels (no spatial drag).
  if (!options.fade) {
    viewport.style.cursor = "grab";
    embla.on("pointerDown", () => {
      viewport.style.cursor = "grabbing";
    });
    embla.on("pointerUp", () => {
      viewport.style.cursor = "grab";
    });
  }

  // Pause auto-motion (AutoScroll marquees / Autoplay) while the carousel is
  // scrolled off-screen — see pauseWhenOffscreen. Both plugins expose
  // play()/stop()/isPlaying(); under reduced-motion neither option is set, so
  // this whole block is skipped (the plugin doesn't exist).
  let stopOffscreenPause = () => {};
  if (options.autoScroll || options.autoplay) {
    const motionPlugin = () => embla.plugins().autoScroll || embla.plugins().autoplay || null;
    stopOffscreenPause = pauseWhenOffscreen(
      containerEl,
      () => { const pl = motionPlugin(); if (pl && !pl.isPlaying()) pl.play(); },
      () => { const pl = motionPlugin(); if (pl && pl.isPlaying()) pl.stop(); }
    );
  }

  // Return public API
  return {
    embla,
    destroy: () => { stopOffscreenPause(); embla.destroy(); },
    scrollTo: (index) => embla.scrollTo(index),
    scrollPrev: () => embla.scrollPrev(),
    scrollNext: () => embla.scrollNext(),
    selectedIndex: () => embla.selectedScrollSnap()
  };
}

/**
 * Native scroll-snap carousel.
 *
 * For plain horizontal sliders (product rows) where touch smoothness matters
 * most. Instead of Embla's JS/rAF-driven drag — bound to the main thread, so
 * it stutters when the page is busy — the viewport scrolls NATIVELY via CSS
 * scroll-snap. Momentum + snapping run on the compositor thread, so swiping
 * stays smooth regardless of main-thread load. Arrows / progress are wired to
 * the native scroll position; returns the same public shape as createCarousel.
 */
function createNativeCarousel(containerEl, viewport, slides, options) {
  const isRTL = document.dir === "rtl" || document.documentElement.dir === "rtl";

  const slideStep = () => {
    const first = slides[0];
    return (first && first.getBoundingClientRect().width) || viewport.clientWidth;
  };
  const maxScroll = () => viewport.scrollWidth - viewport.clientWidth;

  // dir: +1 = next (toward the end), -1 = prev. RTL flips the sign because
  // scrollLeft runs negative in a right-to-left scroll container.
  const scrollByDir = (dir) => {
    const amount = slideStep() * dir;
    viewport.scrollBy({ left: isRTL ? -amount : amount, behavior: "smooth" });
  };

  const prevBtn = containerEl.querySelector("[data-carousel-prev], .products-embla__prev, .embla__prev");
  const nextBtn = containerEl.querySelector("[data-carousel-next], .products-embla__next, .embla__next");
  if (prevBtn) prevBtn.addEventListener("click", () => scrollByDir(-1));
  if (nextBtn) nextBtn.addEventListener("click", () => scrollByDir(1));

  // Desktop mouse drag-to-scroll. A mouse can't drag a native scroll container
  // (only touch / trackpad / wheel), so without this a mouse user gets only the
  // arrows. CRUCIALLY we drive the drag with a COMPOSITOR transform on the
  // track — NOT per-move `scrollLeft` writes, which are main-thread work and so
  // stutter under the very SDK load that made Embla janky. On release we bake
  // the transform into the real scrollLeft. Mouse only; touch/pen stay native.
  const track = viewport.firstElementChild;
  let down = false;
  let moved = false;
  let startX = 0;
  let baseLeft = 0;
  let dx = 0;
  let dragRaf = 0;
  const renderDrag = () => {
    dragRaf = 0;
    if (track) track.style.transform = `translate3d(${dx}px, 0, 0)`;
  };
  // Native text-selection and the HTML5 ghost-drag of <img>/<a> hijack the
  // cursor and fight the drag — suppress the ghost-drag here (user-select:none
  // is set on the viewport in the section CSS to stop the text selection).
  viewport.addEventListener("dragstart", (e) => e.preventDefault());
  viewport.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !track) return;
    down = true;
    moved = false;
    startX = e.clientX;
    baseLeft = viewport.scrollLeft;
    // Deliberately NO pointer-capture / is-dragging here: capturing on a plain
    // mousedown swallows the target button's click. We only capture once a real
    // drag begins (past the threshold in pointermove below).
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!down) return;
    const raw = e.clientX - startX;
    if (!moved) {
      if (Math.abs(raw) < 4) return; // below threshold → still a potential click
      moved = true;
      viewport.classList.add("is-dragging"); // CSS forces grabbing over the card
      track.style.willChange = "transform";
      // Capture now (not on mousedown) so plain clicks reach the buttons.
      try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
    }
    // Clamp so you can't drag into blank space past the ends. The effective
    // scroll while dragging is `baseLeft - dx`; keep it inside the scroll
    // range (which is [0, max] in LTR, [-max, 0] in RTL).
    const max = viewport.scrollWidth - viewport.clientWidth;
    const minSL = isRTL ? -max : 0;
    const maxSL = isRTL ? 0 : max;
    dx = Math.min(baseLeft - minSL, Math.max(baseLeft - maxSL, raw));
    if (!dragRaf) dragRaf = requestAnimationFrame(renderDrag);
  });
  const endDrag = (e) => {
    if (!down) return;
    down = false;
    if (moved && track) {
      viewport.classList.remove("is-dragging");
      if (dragRaf) { cancelAnimationFrame(dragRaf); dragRaf = 0; }
      // Bake the visual offset into the real scroll position, then drop the
      // transform — both in this task, so the frame renders the final state
      // with no jump.
      viewport.scrollLeft = baseLeft - dx;
      track.style.transform = "";
      track.style.willChange = "";
      try { viewport.releasePointerCapture(e.pointerId); } catch (_) {}
    }
  };
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);
  // A drag ends in a click on whatever card was under the cursor — swallow it
  // so the card's link doesn't navigate after a drag.
  viewport.addEventListener(
    "click",
    (e) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    },
    true
  );

  const progressBar = containerEl.querySelector("[data-carousel-progress], .products-embla__progress-bar");

  // Dots — page-based (one per viewport-width of scrollable content). Built
  // lazily, rebuilt on resize; the active dot tracks the scroll position. Each
  // dot jumps to its page. Buttons get class `carousel-dot` (styled globally).
  const dotsContainer = containerEl.querySelector("[data-carousel-dots]");
  let dotEls = [];
  const pageCount = () => Math.max(1, Math.round(viewport.scrollWidth / (viewport.clientWidth || 1)));
  const buildDots = () => {
    if (!dotsContainer) return;
    const n = pageCount();
    dotsContainer.style.display = n <= 1 ? "none" : "";
    if (n === dotEls.length) return;
    dotsContainer.innerHTML = "";
    dotEls = [];
    for (let i = 0; i < n; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "carousel-dot";
      b.setAttribute("data-active", String(i === 0));
      b.setAttribute("aria-label", String(i + 1));
      b.addEventListener("click", () => {
        viewport.scrollTo({ left: (isRTL ? -1 : 1) * i * viewport.clientWidth, behavior: "smooth" });
      });
      dotsContainer.appendChild(b);
      dotEls.push(b);
    }
  };
  const updateDots = () => {
    if (!dotEls.length) return;
    const active = Math.round(Math.abs(viewport.scrollLeft) / (viewport.clientWidth || 1));
    for (let i = 0; i < dotEls.length; i++) dotEls[i].setAttribute("data-active", String(i === active));
  };
  buildDots();
  if (dotsContainer) window.addEventListener("resize", () => { buildDots(); updateDots(); });

  // State sync runs AFTER the native scroll, on a rAF — it never blocks the
  // scroll itself (the whole point of going native).
  let raf = 0;
  const sync = () => {
    raf = 0;
    const max = maxScroll();
    const pos = Math.min(max, Math.abs(viewport.scrollLeft));
    if (progressBar) progressBar.style.width = `${max > 0 ? Math.round((pos / max) * 100) : 0}%`;
    if (prevBtn) prevBtn.disabled = pos <= 1;
    if (nextBtn) nextBtn.disabled = pos >= max - 1;
    updateDots();
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(sync); };
  viewport.addEventListener("scroll", onScroll, { passive: true });

  // Optional autoplay (already suppressed upstream under reduced-motion).
  let timer = null;
  let stopOffscreenPause = () => {};
  const stopAutoplay = () => { if (timer) { clearInterval(timer); timer = null; } };
  const startAutoplay = () => {
    if (!options.autoplay || timer) return;
    timer = setInterval(() => {
      if (Math.abs(viewport.scrollLeft) >= maxScroll() - 1) {
        viewport.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        scrollByDir(1);
      }
    }, options.autoplay);
  };
  if (options.autoplay) {
    viewport.addEventListener("pointerenter", stopAutoplay);
    viewport.addEventListener("pointerleave", startAutoplay);
    viewport.addEventListener("touchstart", stopAutoplay, { passive: true });
    startAutoplay();
    // Stop the interval when the row scrolls out of view; resume on return.
    stopOffscreenPause = pauseWhenOffscreen(containerEl, startAutoplay, stopAutoplay);
  }

  // Swipe hint — stays visible + animated at all times; only hidden when the
  // row doesn't actually overflow (nothing to swipe to). Re-checked on resize.
  const hint = containerEl.querySelector(".products-embla__swipe-hint");
  if (hint) {
    const updateHint = () => hint.classList.toggle("is-hidden", maxScroll() <= 0);
    updateHint();
    window.addEventListener("resize", updateHint);
  }

  requestAnimationFrame(sync);

  return {
    embla: null,
    destroy: () => {
      stopAutoplay();
      stopOffscreenPause();
      viewport.removeEventListener("scroll", onScroll);
    },
    scrollTo: (i) => {
      const s = slides[i];
      if (s) s.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    },
    scrollNext: () => scrollByDir(1),
    scrollPrev: () => scrollByDir(-1),
    selectedIndex: () => 0
  };
}

/**
 * Setup navigation buttons
 */
function setupNavigation(container, embla) {
  const prevBtn =
    container.querySelector("[data-carousel-prev]") ||
    container.querySelector(".embla__prev") ||
    container.querySelector(".product-gallery__prev");

  const nextBtn =
    container.querySelector("[data-carousel-next]") ||
    container.querySelector(".embla__next") ||
    container.querySelector(".product-gallery__next");

  // Also check for mobile buttons
  const prevBtnMobile = container.querySelector(".product-gallery__prev-mobile");
  const nextBtnMobile = container.querySelector(".product-gallery__next-mobile");

  const buttons = [prevBtn, prevBtnMobile].filter(Boolean);
  const nextButtons = [nextBtn, nextBtnMobile].filter(Boolean);

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => embla.scrollPrev());
  });

  nextButtons.forEach((btn) => {
    btn.addEventListener("click", () => embla.scrollNext());
  });

  const updateButtonStates = () => {
    const canScrollPrev = embla.canScrollPrev();
    const canScrollNext = embla.canScrollNext();

    buttons.forEach((btn) => (btn.disabled = !canScrollPrev));
    nextButtons.forEach((btn) => (btn.disabled = !canScrollNext));
  };

  embla.on("init", updateButtonStates);
  embla.on("select", updateButtonStates);
  embla.on("reInit", updateButtonStates);
}

/**
 * Setup dots navigation
 */
function setupDots(container, embla) {
  const dotsContainer = container.querySelector("[data-carousel-dots]") || container.querySelector(".embla__dots");

  if (!dotsContainer) return;

  const createDots = () => {
    dotsContainer.innerHTML = "";
    // One dot per SCROLL SNAP, not per slide. With slidesToScroll:"auto" Embla
    // groups slides into pages, so a long list shows a few page-dots instead of
    // one-per-slide. It also fixes the old mismatch where per-slide dots
    // outnumbered the snaps, leaving trailing dots that could never go active
    // (active is tracked via selectedScrollSnap()).
    embla.scrollSnapList().forEach((_, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className =
        "h-1.5 w-3 rounded-full bg-white/50 transition-all data-[active=true]:w-5 data-[active=true]:bg-white/80";
      dot.addEventListener("click", () => embla.scrollTo(index));
      dotsContainer.appendChild(dot);
    });
  };

  const updateActiveDot = () => {
    const selectedIndex = embla.selectedScrollSnap();
    dotsContainer.querySelectorAll("button").forEach((dot, index) => {
      dot.dataset.active = String(index === selectedIndex);
    });
  };

  embla.on("init", () => {
    createDots();
    updateActiveDot();
  });
  embla.on("select", updateActiveDot);
  embla.on("reInit", () => {
    createDots();
    updateActiveDot();
  });
}

/**
 * Setup progress bar
 */
function setupProgress(container, embla) {
  const progressBar =
    container.querySelector("[data-carousel-progress]") ||
    container.querySelector(".embla__progress-bar") ||
    container.querySelector(".product-gallery__progress-bar");

  if (!progressBar) return;

  const updateProgress = () => {
    const progress = Math.max(0, Math.min(1, embla.scrollProgress()));
    progressBar.style.width = `${progress * 100}%`;
  };

  embla.on("init", updateProgress);
  embla.on("scroll", updateProgress);
  embla.on("reInit", updateProgress);
}

/**
 * Sync two carousels (e.g., main gallery + thumbnails)
 *
 * @param {Object} main - Main carousel instance
 * @param {Object} thumbs - Thumbnails carousel instance
 * @param {NodeList|Array} thumbButtons - Thumbnail button elements
 */
export function syncCarousels(main, thumbs, thumbButtons) {
  if (!main || !thumbs) return;

  // Click on thumbnail scrolls main
  thumbButtons.forEach((btn, index) => {
    btn.addEventListener("click", () => main.scrollTo(index));
  });

  // Main carousel changes scroll thumbs
  main.embla.on("select", () => {
    const selectedIndex = main.selectedIndex();
    thumbs.scrollTo(selectedIndex);

    // Update active state
    thumbButtons.forEach((btn, index) => {
      if (index === selectedIndex) {
        btn.classList.add("border-primary");
        btn.classList.remove("border-transparent");
      } else {
        btn.classList.remove("border-primary");
        btn.classList.add("border-transparent");
      }
    });
  });
}

/**
 * Create a conditional carousel that only initializes when content overflows
 * Useful for responsive layouts where carousel may not be needed on large screens
 *
 * @param {HTMLElement|string} container - Container element
 * @param {Object} options - Same as createCarousel options
 * @param {HTMLElement} controlsElement - Element to show/hide based on carousel state
 * @returns {Object} Controller with init/destroy methods
 */
export function createConditionalCarousel(container, options = {}, controlsElement = null) {
  const containerEl = typeof container === "string" ? document.querySelector(container) : container;

  if (!containerEl) return null;

  const viewport =
    containerEl.querySelector("[data-carousel-viewport]") ||
    containerEl.querySelector(".embla__viewport") ||
    containerEl;

  const slides = viewport.querySelector(".embla__container, [data-carousel-container]");

  let instance = null;

  function needsCarousel() {
    if (!slides) return false;
    return slides.scrollWidth > viewport.clientWidth;
  }

  function init() {
    if (instance) return;
    if (!needsCarousel()) return;

    instance = createCarousel(containerEl, { ...options, forceInit: true });

    if (controlsElement && instance) {
      controlsElement.classList.remove("hidden");
      controlsElement.classList.add("flex");
    }
  }

  function destroy() {
    if (!instance) return;
    instance.destroy();
    instance = null;

    if (controlsElement) {
      controlsElement.classList.add("hidden");
      controlsElement.classList.remove("flex");
    }
  }

  function check() {
    if (needsCarousel()) {
      init();
    } else {
      destroy();
    }
  }

  // Initial check
  check();

  // Re-check on resize
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(check, 150);
  });

  return {
    init,
    destroy,
    check,
    get instance() {
      return instance;
    }
  };
}
