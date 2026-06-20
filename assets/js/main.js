/**
 * Theme Entry Point
 *
 * Initializes all theme features based on page context.
 * Uses event-based architecture for dynamic content.
 *
 * Events:
 * - content:loaded - Dispatch when new content is added (e.g., AJAX, quick view)
 *                    All modules will re-init their elements
 */

import { createCarousel, createConditionalCarousel } from "./lib/carousel.js";
import { initAllProductGalleries } from "./product/gallery.js";
import { initCart, initButtons as initCartButtons } from "./cart/add-to-cart.js";

// Cart drawer — self-initializes if a #cart-drawer-dialog is present on the page.
import "./cart/drawer.js";
// Cart-page "recommended products" strip — self-initializes if present.
import "./cart/recommended-strip.js";

// Product modules (self-initializing, register global callbacks)
import "./product/variants.js";
import "./product/quick-view.js";
import "./product/lightbox.js";
import "./product/sticky-bar.js";

// Feature modules (self-initializing)
import "./features/layout.js";
import "./features/nav-keyboard.js";
import "./features/product-card-ratings.js";
import "./features/section-ids.js";
import "./features/wishlist.js";
import "./features/search.js";
import "./features/qty-input.js";
import "./features/phone-input.js";
import "./features/product-filter.js";
// NOTE: price-slider.js (noUiSlider) is intentionally NOT imported here. It
// ships in the separate listing-only bundle (assets/js/listing.js →
// dist/theme-listing.js), loaded by products.jinja + category.jinja, so
// noUiSlider stays off every page that has no price filter. product-filter.js
// stays global above because pagination.jinja's per-page select calls
// window.productFilter on the reviews/questions pages too.
import "./features/bundle-offers.js";
import "./features/notify-me.js";
import "./features/buy-now.js";
import "./features/product-video-testimonials.js";
import "./features/product-floating-video.js";
import "./features/hero-video.js";
import "./features/desc-image-first.js";
import "./features/free-shipping-badge.js";
// Note: loyalty-rewards is loaded as standalone script AFTER vitrin_body in layout.jinja

// Store for initialized carousel instances (for cleanup)
const carouselInstances = new WeakMap();

/**
 * Initialize all carousels with data-carousel attribute
 */
function initCarousels() {
  document.querySelectorAll("[data-carousel]").forEach((container) => {
    // Skip if already initialized
    if (carouselInstances.has(container)) return;

    // Respect `prefers-reduced-motion` for any auto-advancing
    // behavior. Embla's AutoScroll and Autoplay are JS-driven (not
    // CSS), so a CSS @media rule can't pause them — we have to
    // simply not enable the plugin when the user has requested
    // reduced motion. Slides remain manually scrollable; only the
    // automatic motion is suppressed.
    const prefersReducedMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const options = {
      loop: container.dataset.carouselLoop === "true",
      fade: container.dataset.carouselFade === "true",
      autoplay:
        prefersReducedMotion || !container.dataset.carouselAutoplay
          ? false
          : parseInt(container.dataset.carouselAutoplay),
      autoScroll:
        prefersReducedMotion || !container.dataset.carouselAutoscroll
          ? false
          : parseFloat(container.dataset.carouselAutoscroll),
      // AutoScroll-specific extras — only consumed when autoScroll is set.
      // `direction` is 'forward' (default) or 'backward'; the marquee section
      // uses this to expose a "reverse" toggle. `pauseOnHover` maps to
      // Embla's `stopOnMouseEnter` so the strip pauses when the user hovers.
      autoScrollDirection: container.dataset.carouselAutoscrollDirection || "forward",
      autoScrollPauseOnHover: container.dataset.carouselAutoscrollPauseOnHover === "true",
      align: container.dataset.carouselAlign || "start",
      // Dot-pagination granularity. "auto" groups slides into pages so a long
      // list shows a handful of page-dots instead of one dot per slide.
      slidesToScroll: container.dataset.carouselSlidesToScroll || 1,
      // Drag-free (free-flick scrolling) is now the DEFAULT for every
      // carousel — opt a specific instance out with
      // data-carousel-dragfree="false". Fade carousels are excluded since
      // they cross-fade in place, so free dragging is meaningless there.
      dragFree:
        container.dataset.carouselFade !== "true" &&
        container.dataset.carouselDragfree !== "false",
      // Native scroll-snap mode (product rows) — compositor-thread swiping.
      native: container.dataset.carouselNative === "true"
    };

    // Conditional carousel (only init when content overflows)
    if (container.dataset.carouselConditional === "true") {
      const controlsEl = container.parentElement?.querySelector("[data-carousel-controls]");
      const instance = createConditionalCarousel(container, options, controlsEl);
      if (instance) {
        carouselInstances.set(container, instance);
      }
    } else {
      // Regular carousel
      const instance = createCarousel(container, options);
      if (instance) {
        carouselInstances.set(container, instance);
      }
    }
  });
}

/**
 * Initialize theme
 */
function init() {
  // Per-page init log is noise in production; gate it behind the same
  // `__themeDebug` flag the tracking stubs in layout.jinja use.
  if (window.__themeDebug) {
    console.log("[Theme] Initializing for page:", document.body.dataset.template);
  }

  // Initialize carousels
  initCarousels();

  // Initialize product galleries (product page, quick view)
  initAllProductGalleries();

  // Initialize cart (add-to-cart buttons, badge)
  initCart();
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Re-init when new content is loaded (AJAX, quick view, etc.)
window.addEventListener("content:loaded", () => {
  initCarousels();
  initAllProductGalleries();
  initCartButtons();
});

// Re-init cart buttons when products are filtered/updated
window.addEventListener("products:updated", () => {
  initCartButtons();
});
