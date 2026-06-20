/**
 * Quick View Module
 *
 * Fetches product page content and displays it in a compact anchored
 * popover. Uses an in-memory LRU cache + hover prefetch so the second
 * open feels instantaneous.
 *
 * DOM contract with Zid's product template (fetched server-side):
 *   #product-main-section
 *     .product-gallery-column → moved to .qv3-header-row
 *     .product-details-column
 *       #header                → moved to .qv3-header-row
 *       form#product-form
 *         [data-quantity-wrapper] → moved to .qv3-cta-row
 *         [data-product-actions]  → moved to .qv3-cta-row
 *
 * If Zid restructures these selectors, the popover degrades gracefully
 * (the affected section just stays empty / hidden) and logs a warning.
 *
 * Usage:
 *   window.quickViewManager.open(productSlug, productUrl, anchorEl?)
 */

import { lockBodyScroll, unlockBodyScroll, forceUnlockBodyScroll } from "../lib/scroll-lock.js";

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  // Memory budget: each cached entry stores the extracted product section
  // HTML (~50-200 KB). 7 entries caps us at ~1-1.5 MB — comfortable on
  // low-end mobile while still covering a realistic browsing cluster.
  maxCacheSize: 7,
  hoverDelay: 200,
  productSectionId: "product-main-section"
};

const ELEMENTS = {
  dialog: "quick-view-dialog",
  modal: "product-quick-view-modal",
  skeleton: "quick-view-skeleton",
  content: "quick-view-content",
  headerRow: "quick-view-header-row",
  ctaRow: "quick-view-cta-row",
  footer: "quick-view-footer",
  productLink: "quick-view-product-link"
};

// Viewport breakpoint below which the panel becomes a bottom sheet
// (JS skips positioning; CSS media query takes over).
const MOBILE_BREAKPOINT = "(max-width: 639px)";

// ─────────────────────────────────────────────────────────────
// Quick View Manager
// ─────────────────────────────────────────────────────────────

class QuickViewManager {
  constructor() {
    // LRU cache keyed by product URL.
    this.cache = new Map();

    // Hover prefetch state.
    this.prefetchController = null;
    this.hoverTimeout = null;
    this.currentHoveredCard = null;
    this.currentPrefetchUrl = null;

    // SDK script state — fetched once from the first loaded product page.
    this.sdkScriptLoaded = false;
    this.sdkScriptUrl = null;

    // Anchored-popover state.
    this.currentAnchor = null;
    this.previouslyFocused = null; // restored on close
    this.repositionRaf = 0;        // rAF handle for throttled reposition

    // Bound event handlers (stable references for add/remove).
    this.handleMouseOver = this.handleMouseOver.bind(this);
    this.handleMouseOut = this.handleMouseOut.bind(this);
    this.handleCartUpdated = this.handleCartUpdated.bind(this);
    this.handleOutsideClick = this.handleOutsideClick.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleReposition = this.handleReposition.bind(this);
    this.handleBuyNowClick = this.handleBuyNowClick.bind(this);
  }

  // ─────────────────────────────────────────────────────────────
  // LRU cache
  // ─────────────────────────────────────────────────────────────

  cacheGet(url) {
    const data = this.cache.get(url);
    if (!data) return null;
    // Re-insert to move to the end (most-recently-used).
    this.cache.delete(url);
    this.cache.set(url, data);
    return data;
  }

  cacheSet(url, html, productObj) {
    this.cache.delete(url);
    if (this.cache.size >= CONFIG.maxCacheSize) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(url, { html, productObj });
  }

  cacheHas(url) { return this.cache.has(url); }
  cacheClear() { this.cache.clear(); }

  // ─────────────────────────────────────────────────────────────
  // URL + page-parsing helpers
  // ─────────────────────────────────────────────────────────────

  buildFetchUrl(productUrl) {
    const themeParam = new URLSearchParams(window.location.search).get("theme");
    if (!themeParam) return productUrl;
    const sep = productUrl.includes("?") ? "&" : "?";
    return `${productUrl}${sep}theme=${encodeURIComponent(themeParam)}`;
  }

  extractProductSection(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const section = doc.getElementById(CONFIG.productSectionId);
    return section ? section.outerHTML : null;
  }

  extractProductObj(html) {
    const match = html.match(/window\.productObj\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch (err) {
      console.warn("[QuickView] Failed to parse productObj:", err);
      return null;
    }
  }

  extractSdkScriptUrl(html) {
    const match = html.match(/<script[^>]+src="([^"]*theme-statics\/product\.js[^"]*)"/);
    return match ? match[1] : null;
  }

  loadSdkScript() {
    if (this.sdkScriptLoaded) return Promise.resolve();
    if (!this.sdkScriptUrl) {
      // No URL yet means we never saw a product page — variant-swap /
      // price-update behaviour won't run. Surface it so it's findable.
      console.warn("[QuickView] SDK script URL not resolved; variant behaviours may not init.");
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = this.sdkScriptUrl;
      script.onload = () => {
        this.sdkScriptLoaded = true;
        resolve();
      };
      script.onerror = () => reject(new Error("[QuickView] Failed to load SDK script"));
      document.head.appendChild(script);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Hover prefetch
  // ─────────────────────────────────────────────────────────────

  async prefetch(productUrl) {
    if (!productUrl || this.cacheHas(productUrl)) return;

    this.cancelPrefetch();
    this.prefetchController = new AbortController();

    try {
      const response = await fetch(this.buildFetchUrl(productUrl), {
        signal: this.prefetchController.signal,
        priority: "low"
      });
      if (!response.ok) return;

      const html = await response.text();
      const sectionHtml = this.extractProductSection(html);
      const productObj = this.extractProductObj(html);

      if (!this.sdkScriptUrl) this.sdkScriptUrl = this.extractSdkScriptUrl(html);
      if (sectionHtml) this.cacheSet(productUrl, sectionHtml, productObj);
    } catch (err) {
      if (err.name !== "AbortError") {
        console.warn("[QuickView] Prefetch failed:", err);
      }
    } finally {
      this.prefetchController = null;
    }
  }

  cancelPrefetch() {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    if (this.prefetchController) {
      this.prefetchController.abort();
      this.prefetchController = null;
    }
    this.currentPrefetchUrl = null;
  }

  setupPrefetchListeners() {
    document.addEventListener("mouseover", this.handleMouseOver);
    document.addEventListener("mouseout", this.handleMouseOut);
  }

  handleMouseOver(event) {
    if (!(event.target instanceof Element)) return;
    const card = event.target.closest("[data-product-card]");
    if (!card || card === this.currentHoveredCard) return;

    this.cancelPrefetch();
    this.currentHoveredCard = card;

    const productUrl = card.querySelector("a[href]")?.getAttribute("href");
    if (!productUrl || this.cacheHas(productUrl)) return;
    if (productUrl === this.currentPrefetchUrl) return;

    this.currentPrefetchUrl = productUrl;
    this.hoverTimeout = setTimeout(() => this.prefetch(productUrl), CONFIG.hoverDelay);
  }

  handleMouseOut(event) {
    if (!(event.target instanceof Element)) return;
    const card = event.target.closest("[data-product-card]");
    if (!card) return;

    const related = event.relatedTarget;
    if (related instanceof Element && related.closest("[data-product-card]") === card) {
      return;
    }
    this.cancelPrefetch();
    this.currentHoveredCard = null;
  }

  // ─────────────────────────────────────────────────────────────
  // Modal state
  // ─────────────────────────────────────────────────────────────

  getElements() {
    const elements = {};
    for (const [key, id] of Object.entries(ELEMENTS)) {
      elements[key] = document.getElementById(id);
      if (!elements[key]) {
        console.error(`[QuickView] Element not found: #${id}`);
        return null;
      }
    }
    return elements;
  }

  getMessages(modal) {
    return {
      errorMessage: modal?.dataset.errorMessage || "Failed to load product. Please try again.",
      goToProduct: modal?.dataset.goToProduct || "Go to product page"
    };
  }

  /**
   * Apply a state to the modal's visibility classes.
   *   "loading" → skeleton visible
   *   "content" → content + header + cta + footer visible
   *   "error"   → only content visible (renderError fills it)
   */
  setModalState(elements, state) {
    const { skeleton, content, headerRow, ctaRow, footer } = elements;

    skeleton.classList.toggle("hidden", state !== "loading");
    content.classList.toggle("hidden", state === "loading");
    footer.classList.toggle("hidden", state !== "content");
    // Header + CTA rows are only populated in the "content" state. The
    // populate* helpers flip them on after the nodes are in place.
    if (state !== "content") {
      headerRow.classList.add("hidden");
      ctaRow.classList.add("hidden");
    }
  }

  renderError(content, message, linkText, url) {
    content.innerHTML = "";
    const container = document.createElement("div");
    container.className = "py-8 text-center";

    const text = document.createElement("p");
    text.className = "text-secondary";
    text.textContent = message;

    const link = document.createElement("a");
    link.href = url;
    link.className = "text-primary mt-2 inline-block underline";
    link.textContent = linkText;

    container.append(text, link);
    content.appendChild(container);
  }

  dispatchContentLoaded() {
    window.dispatchEvent(new CustomEvent("content:loaded"));
  }

  /**
   * Move qty + actions out of the scroll area into the sticky CTA
   * footer. ORIGINAL nodes (not clones) so Zid's SDK bindings survive.
   * Called AFTER setModalState("content") but BEFORE dispatching
   * `content:loaded` so the SDK's initial bind sees final positions.
   */
  populateCtaRow(elements) {
    const { content, ctaRow } = elements;
    ctaRow.innerHTML = "";

    const qty = content.querySelector("[data-quantity-wrapper]");
    const actions = content.querySelector("[data-product-actions]");

    if (qty) ctaRow.appendChild(qty);
    if (actions) ctaRow.appendChild(actions);

    ctaRow.classList.toggle("hidden", !qty && !actions);
  }

  /**
   * Move thumbnail + header block (title, rating, price) out of
   * #product-main-section into the sticky .qv3-header-row above the
   * scrollable content. See `populateCtaRow` for why we move originals.
   */
  populateHeaderRow(elements) {
    const { content, headerRow } = elements;
    headerRow.innerHTML = "";

    const gallery = content.querySelector(".product-gallery-column");
    const header = content.querySelector("#header");

    if (gallery) headerRow.appendChild(gallery);
    if (header) headerRow.appendChild(header);

    headerRow.classList.toggle("hidden", !gallery && !header);
  }

  // ─────────────────────────────────────────────────────────────
  // Open / close
  // ─────────────────────────────────────────────────────────────

  async open(productSlug, productUrl, anchor) {
    const elements = this.getElements();
    if (!elements) return;

    const { dialog, modal, content, productLink } = elements;
    const baseUrl = productUrl || `/p/${productSlug}`;
    const messages = this.getMessages(modal);

    // Lock the background page scroll while the popover is open. Guard on the
    // dialog's open state so re-opening from another card doesn't double-lock.
    if (!dialog.hasAttribute("open")) lockBodyScroll();

    // Remember what had focus so we can restore it on close (a11y).
    this.previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    this.currentAnchor = anchor || null;

    const cached = this.cacheGet(baseUrl);
    if (cached) {
      if (cached.productObj) window.productObj = cached.productObj;
      // Stash on the modal so variants.js resolves this product's variants
      // even after window.productObj is reused by another quick-view.
      modal.__qvProductObj = cached.productObj || null;
      await this.loadSdkScript();

      content.innerHTML = cached.html;
      productLink.href = baseUrl;
      this.setModalState(elements, "content");
      this.populateHeaderRow(elements);
      this.populateCtaRow(elements);
      dialog.show();
      this.attachPopoverListeners();
      this.scheduleReposition();
      requestAnimationFrame(() => {
        this.focusPanel(elements);
        this.dispatchContentLoaded();
      });
      return;
    }

    content.innerHTML = "";
    this.setModalState(elements, "loading");
    dialog.show();
    this.attachPopoverListeners();
    this.scheduleReposition();

    try {
      const response = await fetch(this.buildFetchUrl(baseUrl));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const sectionHtml = this.extractProductSection(html);
      const productObj = this.extractProductObj(html);

      if (!sectionHtml) throw new Error("Product section not found");

      if (!this.sdkScriptUrl) this.sdkScriptUrl = this.extractSdkScriptUrl(html);
      if (productObj) window.productObj = productObj;
      modal.__qvProductObj = productObj || null;

      await this.loadSdkScript();
      this.cacheSet(baseUrl, sectionHtml, productObj);

      content.innerHTML = sectionHtml;
      productLink.href = baseUrl;
      this.setModalState(elements, "content");
      this.populateHeaderRow(elements);
      this.populateCtaRow(elements);

      this.scheduleReposition();
      requestAnimationFrame(() => {
        this.focusPanel(elements);
        this.dispatchContentLoaded();
      });
    } catch (err) {
      console.error("[QuickView] Failed to load product:", err);
      this.setModalState(elements, "error");
      this.renderError(content, messages.errorMessage, messages.goToProduct, baseUrl);
      this.scheduleReposition();
    }
  }

  close() {
    const dialog = document.getElementById(ELEMENTS.dialog);
    if (dialog?.hasAttribute("open")) {
      dialog.hide();
      unlockBodyScroll();
    }

    this.detachPopoverListeners();
    this.cancelReposition();
    this.currentAnchor = null;

    // Return focus to the element that had it before the popover opened
    // (typically the trigger button on the product card).
    if (this.previouslyFocused && document.contains(this.previouslyFocused)) {
      try { this.previouslyFocused.focus({ preventScroll: true }); } catch {}
    }
    this.previouslyFocused = null;
  }

  /** Move focus into the panel after open so keyboard users can interact. */
  focusPanel(elements) {
    // Prefer the close button — always present, small focus ring, and
    // ESC/Enter still works from there.
    const target = elements.modal.querySelector(".qv3-close")
      || elements.modal.querySelector("[data-add-to-cart-form]")
      || elements.modal.querySelector("[data-notify-me-btn]");
    if (target instanceof HTMLElement) {
      try { target.focus({ preventScroll: true }); } catch {}
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Positioning (anchored compact card)
  // ─────────────────────────────────────────────────────────────

  /**
   * Position the panel near the current anchor.
   * - Prefers below the anchor; flips above when there's more room there.
   * - Clamps horizontally to the viewport with a small gutter.
   * - Arrow tracks the anchor's horizontal center even when clamped.
   * - On mobile, defers to the CSS bottom-sheet.
   * Falls back to viewport-center when there's no anchor.
   */
  positionPopover() {
    const panel = document.querySelector("#product-quick-view-modal .qv3-panel");
    if (!panel) return;

    // Centered modal on every viewport — the CSS owns centering
    // (inset:0 + margin:auto). Clear any leftover anchored-position vars.
    panel.style.removeProperty("--qv3-top");
    panel.style.removeProperty("--qv3-left");
    panel.style.removeProperty("--qv3-arrow-left");
    panel.removeAttribute("data-flipped");
  }

  /** rAF-coalesced wrapper around positionPopover. Call this from
   *  any event handler (scroll, resize, initial-open) so we never run
   *  more than once per frame. */
  scheduleReposition() {
    if (this.repositionRaf) return;
    this.repositionRaf = requestAnimationFrame(() => {
      this.repositionRaf = 0;
      this.positionPopover();
    });
  }

  cancelReposition() {
    if (this.repositionRaf) {
      cancelAnimationFrame(this.repositionRaf);
      this.repositionRaf = 0;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Popover event listeners
  // ─────────────────────────────────────────────────────────────

  attachPopoverListeners() {
    // `capture: true` on click so we beat stopPropagation in child UIs
    // (variant dropdowns, color swatches, etc.).
    document.addEventListener("click", this.handleOutsideClick, { capture: true });
    document.addEventListener("click", this.handleBuyNowClick);
    document.addEventListener("keydown", this.handleKeydown);
    window.addEventListener("resize", this.handleReposition);
    window.addEventListener("scroll", this.handleReposition, { passive: true });
  }

  detachPopoverListeners() {
    document.removeEventListener("click", this.handleOutsideClick, { capture: true });
    document.removeEventListener("click", this.handleBuyNowClick);
    document.removeEventListener("keydown", this.handleKeydown);
    window.removeEventListener("resize", this.handleReposition);
    window.removeEventListener("scroll", this.handleReposition);
  }

  handleOutsideClick(event) {
    const panel = document.querySelector("#product-quick-view-modal .qv3-panel");
    if (!panel) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    // Inside the popover → leave it alone.
    if (panel.contains(target)) return;
    // Clicking a quick-view trigger re-opens; let that handler run.
    if (target.closest("[data-open-quick-view]")) return;
    this.close();
  }

  /**
   * Buy Now pressed INSIDE the quick view → dismiss the popover so Zid's
   * checkout / login dialog isn't covered by our overlay. The popover panel
   * sits at z-index:50 with a full-screen backdrop, so a guest's "Login"
   * screen would otherwise open *underneath* it. We only hide our own UI —
   * the injected form#product-form stays in the DOM, so `zidProductBuyNow()`
   * (which the button fires on the same click) still completes.
   */
  handleBuyNowClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest(".product-buy-now-btn");
    if (!btn) return;
    const modal = document.getElementById(ELEMENTS.modal);
    if (!modal || !modal.contains(btn)) return;
    // Defer to the next tick so the button's own buyNow handler runs first,
    // then dismiss the popover AND hard-release our scroll lock so Zid's
    // checkout / login dialog opens on top and the page isn't left frozen
    // (unscrollable) after that dialog is closed.
    setTimeout(() => {
      this.close();
      forceUnlockBodyScroll();
    }, 0);
  }

  /** ESC closes. `dialog.show()` (non-modal) doesn't handle this natively. */
  handleKeydown(event) {
    if (event.key === "Escape") {
      const dialog = document.getElementById(ELEMENTS.dialog);
      if (dialog?.hasAttribute("open")) {
        event.preventDefault();
        this.close();
      }
    }
  }

  handleReposition() {
    this.scheduleReposition();
  }

  // ─────────────────────────────────────────────────────────────
  // Global event handlers
  // ─────────────────────────────────────────────────────────────

  setupCartListener() {
    window.addEventListener("cart-updated", this.handleCartUpdated);
  }

  handleCartUpdated() {
    this.close();
  }

  // ─────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────

  init() {
    this.setupPrefetchListeners();
    this.setupCartListener();
  }

  destroy() {
    document.removeEventListener("mouseover", this.handleMouseOver);
    document.removeEventListener("mouseout", this.handleMouseOut);
    window.removeEventListener("cart-updated", this.handleCartUpdated);

    this.detachPopoverListeners();
    this.cancelReposition();
    this.cancelPrefetch();
    this.cacheClear();
    this.currentHoveredCard = null;
    this.currentAnchor = null;
    this.previouslyFocused = null;
  }
}

// ─────────────────────────────────────────────────────────────
// Global instance + legacy shim
// ─────────────────────────────────────────────────────────────

const quickViewManager = new QuickViewManager();

window.quickViewManager = quickViewManager;

// Legacy callers use `openQuickViewModal(productId, slug, url, anchor?)`.
// productId is unused — kept only for signature compatibility.
window.openQuickViewModal = function (_productId, productSlug, productUrl, anchor) {
  quickViewManager.open(productSlug, productUrl, anchor);
};

// ─────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────

export function init() {
  quickViewManager.init();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { quickViewManager };
export default QuickViewManager;
