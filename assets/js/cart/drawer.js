/**
 * Cart Drawer
 *
 * The slide-in drawer triggered from the header. Renders the cart contents,
 * coupon/loyalty/shipping bar, and recommended products. Reads Jinja-supplied
 * configuration from `[data-cart-drawer]` data attributes and translations
 * from a `<script type="application/json" data-cart-drawer-i18n>` block.
 *
 * Auto-initializes on DOMContentLoaded if a `#cart-drawer-dialog` is present.
 */

import { loadRecommendedProducts, rewriteUrl, slugFromUrl } from "./recommended.js";
import { cartErrorMessage } from "./toast.js";
import { enableDragScroll } from "../lib/carousel.js";
import { lockBodyScroll, unlockBodyScroll } from "../lib/scroll-lock.js";

function initCartDrawer() {
  const dialog = document.getElementById("cart-drawer-dialog");
  if (!dialog) return;

  const drawer = dialog.querySelector("[data-cart-drawer]");
  if (!drawer) return;

  const loading = dialog.querySelector("[data-drawer-loading]");
  const empty = dialog.querySelector("[data-drawer-empty]");
  const list = dialog.querySelector("[data-drawer-items]");
  const footer = dialog.querySelector("[data-drawer-footer]");
  const countEl = dialog.querySelector("[data-drawer-count]");
  const shipBox = dialog.querySelector("[data-drawer-shipping]");
  const shipMsg = dialog.querySelector("[data-drawer-shipping-msg]");
  const shipFill = dialog.querySelector("[data-drawer-shipping-fill]");
  const breakEl = dialog.querySelector("[data-drawer-breakdown]");
  const checkoutBtn = dialog.querySelector("[data-drawer-checkout]");
  const recommendedEl = dialog.querySelector("[data-drawer-recommended]");
  const recommendedTrack = dialog.querySelector("[data-recommended-track]");
  const recommendedDots = dialog.querySelector("[data-recommended-dots]");
  const recommendedHint = dialog.querySelector("[data-recommended-hint]");
  const recommendedCount = Number(recommendedEl?.dataset?.recommendedCount) || 8;
  const recommendedCategory = recommendedEl?.dataset?.recommendedCategory || "";
  const recommendedManual = (recommendedEl?.dataset?.recommendedManual || "").trim();
  const recommendedStrategy = drawer.dataset.recommendedStrategy || "latest";
  let recommendedLoaded = false;

  // ─── Config from data attrs (Jinja-supplied) ───
  const confirmStyle = drawer.dataset.confirmStyle || "glass";
  const storeCurrency = drawer.dataset.storeCurrency || "USD";
  const loyaltyPreviewEnabled = drawer.dataset.loyaltyPreview === "true";
  const shippingEnabled = drawer.dataset.shippingEnabled === "true";
  const shippingThresholdManual = Number(drawer.dataset.shippingThreshold) || 0;
  const shippingMsgBelow = drawer.dataset.shippingMsgBelow ?? "";
  const shippingMsgAbove = drawer.dataset.shippingMsgAbove ?? "";
  const onlyLeftTpl = drawer.dataset.onlyLeft ?? "Only {n} left!";
  const autoOpen = drawer.dataset.autoOpen === "true";
  const clearCartLabel = drawer.dataset.clearCartLabel ?? "";
  const clearCartConfirmMsg = drawer.dataset.clearCartConfirm ?? "";

  // ─── i18n from JSON script block ───
  const i18nNode = document.querySelector('script[data-cart-drawer-i18n]');
  const i18n = (() => {
    try { return JSON.parse(i18nNode?.textContent || "{}"); }
    catch { return {}; }
  })();
  const T = {
    ...i18n,
    removeOldVariant: (label) =>
      (i18n.removeOldVariantTpl || 'Remove the old "{label}" from your cart?')
        .replace("{label}", String(label ?? ""))
  };
  const T_ATTACHED_FILE = i18n.attachedFile || "Attached file";
  const T_POINTS_EARN = i18n.pointsEarn || "You'll earn";
  const T_POINTS_UNIT = i18n.pointsUnit || "points";
  const T_REMOVE = i18n.remove || "Remove";
  const T_DECREASE_QTY = i18n.decreaseQty || "Decrease quantity";
  const T_INCREASE_QTY = i18n.increaseQty || "Increase quantity";

  // ─── HTML-escape helper ───
  // Values from Zid include merchant- and customer-supplied content (product
  // names, custom fields, file URLs), so every `${…}` below goes through this.
  const esc = (v) => String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  // Decode HTML entities a merchant may have stored literally in a product
  // name (e.g. "&nbsp;") so they don't render as raw text after esc(). The
  // result is still passed through esc() before insertion, so it stays safe.
  const decodeEntities = (v) => {
    const el = document.createElement("textarea");
    el.innerHTML = String(v ?? "");
    return el.value;
  };

  const SVG_BAG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12.1228 7.75V4C12.1228 2.27411 10.7237 0.875 8.9978 0.875C7.27191 0.875 5.8728 2.27411 5.8728 4V7.75M15.3362 6.08936L16.3888 16.0894C16.4471 16.6429 16.013 17.125 15.4564 17.125H2.53916C1.98257 17.125 1.54855 16.6429 1.60681 16.0894L2.65945 6.08936C2.70967 5.61222 3.11202 5.25 3.59179 5.25H14.4038C14.8836 5.25 15.2859 5.61222 15.3362 6.08936Z"/></svg>';
  const SVG_EYE =
    '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const SVG_CHECK =
    '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const SVG_SPIN =
    '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation: drawer-spin 700ms linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

  // ─── Recommended products rendering ───
  // Icon-only primary action for recommended products — the compact card
  // can't afford a text label next to the price. Accessible name comes
  // from `aria-label` (`T.quickAdd` is the translated "Quick add" string).
  const buildAddBtn = (productId) =>
    `<button type="button" data-rec-add="${esc(productId)}" class="rec-card__btn rec-card__btn--icon" aria-label="${esc(T.quickAdd)}" title="${esc(T.quickAdd)}">${SVG_BAG}</button>`;
  const buildQuickViewBtn = (url) =>
    `<button type="button" class="rec-card__qv" data-rec-quick-view data-product-url="${esc(url)}" aria-label="${esc(T.view)}" title="${esc(T.view)}">${SVG_EYE}</button>`;
  // "Add with options" glyph: the cart bag with a + badge punched into its
  // bottom corner (the mask cuts a clean hole for the badge). Rendered once per
  // variant card, so the mask id is keyed to the product id to stay unique in
  // the DOM. Sized 15px to match the plain add-to-cart bag / eye icons.
  const bagPlusIcon = (uid) => {
    const m = `rec-bag-cut-${esc(uid)}`;
    return `<svg width="15" height="15" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><mask id="${m}"><rect width="100%" height="100%" fill="white"/><circle cx="14.5" cy="14.5" r="4.6" fill="black"/></mask></defs><g mask="url(#${m})"><path d="M12.1228 7.75V4C12.1228 2.27411 10.7237 0.875 8.9978 0.875C7.27191 0.875 5.8728 2.27411 5.8728 4V7.75M15.3362 6.08936L16.3888 16.0894C16.4471 16.6429 16.013 17.125 15.4564 17.125H2.53916C1.98257 17.125 1.54855 16.6429 1.60681 16.0894L2.65945 6.08936C2.70967 5.61222 3.11202 5.25 3.59179 5.25H14.4038C14.8836 5.25 15.2859 5.61222 15.3362 6.08936Z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g><path d="M14.5 12V17M12 14.5H17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  };
  // Foot CTA for in-stock products WITH variants: icon-only button (the
  // bag-plus glyph above) that opens quick-view so an option can be picked —
  // giving variant cards a visible add affordance in the foot, not just the
  // small eye overlay. Reuses the [data-rec-quick-view] handler + rec-card__btn
  // styling, matching the plain add-to-cart button's icon-only treatment.
  const buildChooseBtn = (url, uid) =>
    `<button type="button" data-rec-quick-view data-product-url="${esc(url)}" class="rec-card__btn rec-card__btn--icon" aria-label="${esc(T.view)}" title="${esc(T.view)}">${bagPlusIcon(uid)}</button>`;

  const renderPrice = (p) => {
    const sale = p.formatted_sale_price;
    const reg = p.formatted_price;
    if (sale && reg && sale !== reg) {
      return `
        <span class="rec-card__prices">
          <span class="rec-card__price-original">${esc(reg)}</span>
          <span class="rec-card__price rec-card__price--sale">${esc(sale)}</span>
        </span>
      `;
    }
    const single = sale || reg || "";
    return single ? `<span class="rec-card__price">${esc(single)}</span>` : "<span></span>";
  };

  const renderRecommended = (products) => {
    if (!recommendedTrack) return;
    recommendedTrack.innerHTML = products
      .map((p) => {
        const imgObj = p.main_image?.image ?? p.images?.[0]?.image ?? {};
        const img = imgObj.full_size ?? imgObj.large ?? imgObj.medium ?? imgObj.small ?? "";
        const url = p.html_url ?? "#";
        const name = decodeEntities(p.name);
        const hasOptions = !!p.has_options;
        // Treat finite-stock products with quantity ≤ 0 as OOS in case
        // `in_stock` is missing from the SDK payload. For OOS items we
        // show a "view" (quick-view) button instead of "add" — clicking
        // it opens the popover where the merchant can sign up for
        // notify-me, matching what the variants branch already does.
        const isOOS = p.in_stock === false || (p.is_infinite === false && Number(p.quantity ?? 0) <= 0);
        const useQuickView = hasOptions || isOOS;
        // Foot button (sits next to the price):
        //   simple in-stock        → add-to-cart bag (adds directly)
        //   in-stock WITH variants → bag that opens quick-view to pick an option
        //   out-of-stock           → no foot button (eye overlay handles notify-me)
        const footAdd =
          !useQuickView
            ? `<div class="rec-card__actions">${buildAddBtn(p.id)}</div>`
            : hasOptions && !isOOS
              ? `<div class="rec-card__actions">${buildChooseBtn(url, p.id)}</div>`
              : "";
        return `
          <div class="rec-card">
            <a href="${esc(url)}" class="rec-card__media">
              ${img ? `<img src="${esc(img)}" alt="${esc(name)}" loading="lazy"/>` : ""}
            </a>
            ${buildQuickViewBtn(url)}
            <div class="rec-card__body">
              <a href="${esc(url)}" class="rec-card__title" title="${esc(name)}">${esc(name)}</a>
              <div class="rec-card__foot">
                ${renderPrice(p)}
                ${footAdd}
              </div>
            </div>
          </div>
        `;
      })
      .join("");
    setupRecCarousel();
  };

  // Free-scroll dots + swipe hint for the recommended strip (matches the
  // product rows). Page-based dots; the active dot tracks the scroll. Built
  // once after the cards render.
  const recIsRTL = document.documentElement.dir === "rtl";
  let recDots = [];
  const setupRecCarousel = () => {
    const track = recommendedTrack;
    if (!track) return;
    const pageCount = () => Math.max(1, Math.round(track.scrollWidth / (track.clientWidth || 1)));
    const build = () => {
      if (!recommendedDots) return;
      const n = pageCount();
      recommendedDots.style.display = n <= 1 ? "none" : "";
      if (n === recDots.length) return;
      recommendedDots.innerHTML = "";
      recDots = [];
      for (let i = 0; i < n; i++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "carousel-dot";
        b.setAttribute("data-active", String(i === 0));
        b.addEventListener("click", () =>
          track.scrollTo({ left: (recIsRTL ? -1 : 1) * i * track.clientWidth, behavior: "smooth" })
        );
        recommendedDots.appendChild(b);
        recDots.push(b);
      }
    };
    const update = () => {
      if (recommendedHint) recommendedHint.classList.toggle("is-hidden", track.scrollWidth - track.clientWidth <= 0);
      if (!recDots.length) return;
      const active = Math.round(Math.abs(track.scrollLeft) / (track.clientWidth || 1));
      recDots.forEach((d, i) => d.setAttribute("data-active", String(i === active)));
    };
    build();
    update();
    enableDragScroll(track); // desktop mouse drag-to-scroll
    let raf = 0;
    track.addEventListener(
      "scroll",
      () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); },
      { passive: true }
    );
    window.addEventListener("resize", () => { build(); update(); });
  };

  // ─── Cart variant "Edit" → opens quick-view, offers to remove old on add ───
  let pendingVariantRemove = null; // { itemId, label }

  list.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-cart-edit-variant]");
    if (!editBtn) return;
    e.preventDefault();
    const url = editBtn.dataset.productUrl;
    const line = editBtn.closest("[data-drawer-line]");
    const itemId = line?.dataset?.cartItemId;
    const variantLabel =
      line?.querySelector("[data-variant-display]")?.textContent?.trim() ||
      line?.querySelector(".drawer-variants__values")?.textContent?.trim() ||
      "";
    if (!url) return;
    pendingVariantRemove = itemId ? { itemId, label: variantLabel } : null;
    const slug = slugFromUrl(url);
    if (window.quickViewManager) {
      window.quickViewManager.open(slug, url);
    } else {
      window.location.href = url;
    }
  });

  window.addEventListener("cart:updated", (e) => {
    if (e.detail?.action === "add") {
      try { window.quickViewManager?.close(); } catch {}
    }
  });

  window.addEventListener("cart:updated", (e) => {
    if (!pendingVariantRemove?.itemId) return;
    if (e.detail?.action !== "add") return;

    const { itemId: oldId, label: oldLabel } = pendingVariantRemove;
    pendingVariantRemove = null;

    const title = T.newVariantAdded;
    const subtitle = T.removeOldVariant(oldLabel);
    try { dialog.close(); } catch {}

    const overlay = document.createElement("div");
    overlay.className = `variant-confirm-overlay variant-confirm-overlay--${confirmStyle}`;
    overlay.setAttribute("popover", "manual");
    overlay.innerHTML = `
      <div class="variant-confirm">
        <div class="variant-confirm__icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </div>
        <h3 class="variant-confirm__title">${esc(title)}</h3>
        <p class="variant-confirm__subtitle">${esc(subtitle)}</p>
        <div class="variant-confirm__actions">
          <button type="button" class="drawer-checkout-btn variant-confirm__btn" data-confirm-remove="${esc(oldId)}">
            ${esc(T.yesRemoveOld)}
          </button>
          <button type="button" class="drawer-continue-btn variant-confirm__btn" data-confirm-keep>
            ${esc(T.noKeepBoth)}
          </button>
        </div>
      </div>
    `;

    const closeConfirm = () => {
      overlay.classList.add("is-leaving");
      setTimeout(() => {
        try { overlay.hidePopover(); } catch {}
        overlay.remove();
      }, 250);
    };
    overlay.querySelector(".variant-confirm")?.addEventListener("click", (ev) => ev.stopPropagation());
    overlay.querySelector("[data-confirm-remove]")?.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const removeId = ev.target.closest("[data-confirm-remove]").dataset.confirmRemove;
      closeConfirm();
      try {
        await window.zid.cart.removeProduct({ product_id: removeId }, { showErrorNotification: false });
        window.dispatchEvent(new CustomEvent("cart:updated", { detail: { action: "remove", silent: true } }));
        window.showToast?.({ title: T.oldVariantRemoved, variant: "remove" });
      } catch {}
    });
    overlay.querySelector("[data-confirm-keep]")?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      closeConfirm();
    });
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) closeConfirm();
    });
    document.body.appendChild(overlay);
    try { overlay.showPopover(); } catch {}
    requestAnimationFrame(() => overlay.classList.add("is-visible"));
  });

  // ─── Recommended quick-view ───
  recommendedTrack?.addEventListener("click", (e) => {
    const qvBtn = e.target.closest("[data-rec-quick-view]");
    if (!qvBtn) return;
    e.preventDefault();
    const rawUrl = qvBtn.dataset.productUrl;
    if (!rawUrl) return;
    const url = rewriteUrl(rawUrl);
    const slug = slugFromUrl(url);
    if (window.quickViewManager) {
      window.quickViewManager.open(slug, url);
    } else {
      window.location.href = url;
    }
  });

  // ─── Recommended variant picker (popover) ───
  const closeAllRecMenus = () => {
    for (const m of document.querySelectorAll("[data-rec-variant-menu]")) {
      try { if (m.matches(":popover-open")) m.hidePopover(); } catch {}
      m.hidden = true;
    }
  };
  const positionRecMenu = (menu, trigger) => {
    const r = trigger.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.top = "auto";
    menu.style.bottom = `${window.innerHeight - r.top + 6}px`;
    menu.style.transform = "none";
    menu.style.insetInlineStart = `${document.documentElement.dir === "rtl" ? window.innerWidth - r.right : r.left}px`;
    menu.style.minWidth = `${Math.max(r.width, 140)}px`;
    menu.style.transformOrigin = "bottom center";
  };
  const buildViewBtnInner = () =>
    `<span>${esc(T.view)}</span><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;

  recommendedTrack?.addEventListener("click", async (e) => {
    const trigger = e.target.closest("[data-rec-variant-trigger]");
    if (trigger) {
      e.preventDefault();
      e.stopPropagation();
      const wrap = trigger.closest(".rec-card__variant-wrap");
      const menu = wrap?.querySelector("[data-rec-variant-menu]");
      const parentId = trigger.dataset.parentId;
      const fallback = trigger.dataset.fallbackUrl;
      if (!menu || !parentId) return;
      const wasOpen = !menu.hidden;
      closeAllRecMenus();
      if (wasOpen) return;
      if (!menu.dataset.loaded) {
        menu.innerHTML = `<li class="drawer-variants__option" style="opacity:.6;cursor:default">…</li>`;
      }
      positionRecMenu(menu, trigger);
      menu.hidden = false;
      try { menu.showPopover(); } catch {}
      if (!menu.dataset.loaded) {
        try {
          const siblings = await fetchSiblings(parentId);
          if (siblings.length === 0) {
            closeAllRecMenus();
            if (fallback) window.location.href = fallback;
            return;
          }
          const seen = new Set();
          const items = [];
          for (const s of siblings) {
            const id = s.id ?? s.product_id;
            if (id == null) continue;
            const norm = normalizeId(id);
            if (seen.has(norm)) continue;
            seen.add(norm);
            const fullName = s.name ?? s.title ?? "";
            const idx = fullName.indexOf(" - ");
            const label = (idx > 0 ? fullName.slice(idx + 3) : fullName).trim();
            items.push(`<li class="drawer-variants__option" role="option" data-rec-variant-option data-product-id="${esc(id)}"><span>${esc(label)}</span></li>`);
          }
          menu.innerHTML = items.join("");
          menu.dataset.loaded = "1";
          positionRecMenu(menu, trigger);
        } catch {
          closeAllRecMenus();
          if (fallback) window.location.href = fallback;
        }
      }
      return;
    }

    const opt = e.target.closest("[data-rec-variant-option]");
    if (opt) {
      e.preventDefault();
      e.stopPropagation();
      const productId = opt.dataset.productId;
      if (!productId) return;
      closeAllRecMenus();
      let triggerBtn = null;
      for (const t of recommendedTrack.querySelectorAll("[data-rec-variant-trigger]")) {
        const m = t.closest(".rec-card__variant-wrap")?.querySelector("[data-rec-variant-menu]");
        if (m && m.contains(opt)) {
          triggerBtn = t;
          break;
        }
      }
      if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.classList.add("is-busy");
        triggerBtn.innerHTML = `${SVG_SPIN}<span>${esc(T.quickAdd)}</span>`;
      }
      try {
        await window.zid.cart.addProduct({ product_id: productId, quantity: 1 }, { showErrorNotification: false });
        window.dispatchEvent(new CustomEvent("cart:updated", { detail: { action: "add", productId } }));
        if (triggerBtn) {
          triggerBtn.classList.remove("is-busy");
          triggerBtn.classList.add("is-success");
          triggerBtn.innerHTML = `${SVG_CHECK}<span>${esc(T.added)}</span>`;
          setTimeout(() => {
            triggerBtn.classList.remove("is-success");
            triggerBtn.disabled = false;
            triggerBtn.innerHTML = buildViewBtnInner();
          }, 1400);
        }
      } catch (err) {
        window.showToast?.({ title: cartErrorMessage(err) || T.couldNotAdd, variant: "remove" });
        if (triggerBtn) {
          triggerBtn.classList.remove("is-busy");
          triggerBtn.disabled = false;
          triggerBtn.innerHTML = buildViewBtnInner();
        }
      }
    }
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-rec-variant-trigger]") || e.target.closest("[data-rec-variant-menu]")) return;
    closeAllRecMenus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllRecMenus();
  });
  window.addEventListener("scroll", closeAllRecMenus, { passive: true, capture: true });

  // Quick-add handler (delegated). Icon-only button — state changes just
  // swap the SVG (spinner → check → plus) so the compact 32px circle stays
  // compact. Accessible name is handled by `aria-label` on the button.
  recommendedTrack?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-rec-add]");
    if (!btn) return;
    e.preventDefault();
    const productId = btn.dataset.recAdd;
    if (!productId) return;
    btn.disabled = true;
    btn.classList.add("is-busy");
    btn.innerHTML = SVG_SPIN;
    try {
      await window.zid.cart.addProduct({ product_id: productId, quantity: 1 }, { showErrorNotification: false });
      window.dispatchEvent(new CustomEvent("cart:updated", { detail: { action: "add", productId } }));
      btn.classList.remove("is-busy");
      btn.classList.add("is-success");
      btn.innerHTML = SVG_CHECK;
      setTimeout(() => {
        btn.classList.remove("is-success");
        btn.disabled = false;
        btn.innerHTML = SVG_BAG;
      }, 1400);
    } catch (err) {
      window.showToast?.({ title: cartErrorMessage(err) || T.couldNotAdd, variant: "remove" });
      btn.classList.remove("is-busy");
      btn.disabled = false;
      btn.innerHTML = SVG_BAG;
    }
  });

  const loadRecommended = async () => {
    if (recommendedLoaded || !recommendedEl) return;
    recommendedLoaded = true;
    try {
      const products = await loadRecommendedProducts({
        strategy: recommendedStrategy,
        count: recommendedCount,
        manual: recommendedManual,
        category: recommendedCategory
      });
      if (products.length === 0) {
        recommendedEl.classList.add("hidden");
        return;
      }
      renderRecommended(products);
      // Defer sibling fetches with a concurrency cap.
      const needsSiblings = products.filter((p) => p?.has_options && p?.id);
      const CONCURRENCY = 2;
      let cursor = 0;
      const worker = async () => {
        while (cursor < needsSiblings.length) {
          const idx = cursor++;
          try { await fetchSiblings(needsSiblings[idx].id); } catch {}
        }
      };
      for (let i = 0; i < Math.min(CONCURRENCY, needsSiblings.length); i++) worker();
    } catch {
      recommendedEl.classList.add("hidden");
    }
  };

  // ─── Coupon elements ───
  const couponForm = dialog.querySelector("[data-drawer-coupon-form]");
  const couponInput = dialog.querySelector("[data-drawer-coupon-input]");
  const couponBtn = dialog.querySelector("[data-drawer-coupon-btn]");
  const couponApplied = dialog.querySelector("[data-drawer-coupon-applied]");
  const couponCodeEl = dialog.querySelector("[data-drawer-coupon-code]");
  const couponPercentEl = dialog.querySelector("[data-drawer-coupon-percent]");
  const couponRemove = dialog.querySelector("[data-drawer-coupon-remove]");

  // Resolve the currency code the cart's numeric values are denominated in.
  // Prefer the cart object's own currency (what the server-formatted value_string
  // rows use) over the Zid SDK's session/default and the Jinja-injected fallback,
  // so client-computed amounts (savings, remaining-for-free-shipping) match the
  // server-rendered totals instead of quietly switching to the session currency.
  const resolveCurrency = (cart) =>
    cart?.currency?.cart_currency?.code ||
    cart?.currency?.code ||
    window.zid?.store?.currency ||
    storeCurrency;

  const fmt = (n, cart) => {
    const code = resolveCurrency(cart);
    // Prefer a symbol the cart server provides (Zid exposes "د.ك." / "ر.س." /
    // "US$" directly on the currency object) so we don't rely on ICU having
    // a localized symbol for every <locale, currency> pair.
    const serverSymbol =
      cart?.currency?.cart_currency?.symbol ||
      cart?.currency?.symbol ||
      "";
    const value = Math.max(0, Number(n) || 0);
    const locale = document.documentElement.lang || "ar";

    // Use the currency's natural fraction-digit count (KWD=3, SAR=2, USD=2, …)
    // so computed amounts (savings, free-ship remaining) carry the same
    // precision as the server-formatted prices. Rounding to whole numbers made
    // per-item savings (e.g. 2 + 1) disagree with the summed total (4).
    let decimals = 2;
    try {
      const opt = new Intl.NumberFormat(locale, { style: "currency", currency: code }).resolvedOptions();
      if (typeof opt.maximumFractionDigits === "number") decimals = opt.maximumFractionDigits;
    } catch {}

    if (serverSymbol) {
      try {
        const formatted = new Intl.NumberFormat(locale, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        }).format(value);
        return `${formatted} ${serverSymbol}`;
      } catch {
        return `${value.toFixed(decimals)} ${serverSymbol}`;
      }
    }

    // Fall back to Intl currency formatting. `narrowSymbol` gives the native
    // symbol when ICU has one and the plain ISO code otherwise — better than
    // the default "symbol" display which prefers "US$" / "KWD" for non-local
    // currencies in Arabic locales.
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: code,
        currencyDisplay: "narrowSymbol"
      }).format(value);
    } catch {
      return `${value.toFixed(decimals)} ${code}`;
    }
  };

  // Zid's server `value_string` sometimes prints the ISO code ("KWD") instead
  // of the localized symbol ("د.ك."), which reads wrong in an RTL/Arabic UI.
  // Swap the code for the symbol while keeping the exact formatted decimals.
  const localizeCurrency = (s, cart) => {
    if (!s) return s;
    const code = resolveCurrency(cart);
    const symbol =
      cart?.currency?.cart_currency?.symbol || cart?.currency?.symbol || "";
    return code && symbol && symbol !== code ? String(s).replace(code, symbol) : s;
  };

  const subtotalFromCart = (cart) =>
    Number(cart?.products_subtotal ?? cart?.total?.value ?? cart?.total_value ?? 0);
  const subtotalString = (cart) =>
    cart?.total?.value_string ??
    cart?.totals?.find?.((t) => t.code === "sub_totals")?.value_string ??
    fmt(subtotalFromCart(cart), cart);

  const shipTruck = dialog.querySelector("[data-drawer-shipping-truck]");
  const updateShippingBar = (cart) => {
    if (!shippingEnabled || !shipBox) return;
    const rule = cart?.free_shipping_rule;
    if (!rule || !rule.code) {
      shipBox.hidden = true;
      return;
    }
    const cond = rule.subtotal_condition || {};
    const status = cond.status || "";
    let pct = Number(cond.products_subtotal_percentage_from_min ?? 0);
    let remainingStr = cond.remaining ?? "";

    if (shippingThresholdManual > 0 || (!pct && !remainingStr)) {
      const threshold = shippingThresholdManual > 0 ? shippingThresholdManual : Number(cond.min ?? 0);
      if (threshold > 0) {
        const subtotal = subtotalFromCart(cart);
        const remaining = Math.max(0, threshold - subtotal);
        pct = Math.min(100, Math.round((subtotal / threshold) * 100));
        if (!remainingStr) remainingStr = fmt(remaining, cart);
      }
    }

    const isApplied = status === "applied" || pct >= 100;
    const finalPct = isApplied ? 100 : Math.max(0, Math.min(100, pct));

    // Swap the message icon (truck → check) via a state class on the bar.
    shipBox.classList.toggle("is-unlocked", isApplied);

    if (shipFill) shipFill.style.width = `${finalPct}%`;
    if (shipTruck) shipTruck.style.insetInlineStart = `calc(${finalPct}% - 12px)`;

    if (shipMsg) {
      if (isApplied) {
        shipMsg.textContent = shippingMsgAbove;
      } else if (status === "min_not_reached" || remainingStr) {
        shipMsg.textContent = shippingMsgBelow.replace("{amount}", remainingStr);
      } else {
        shipMsg.textContent = shippingMsgBelow.replace("{amount}", fmt(0, cart));
      }
    }
    shipBox.hidden = false;
  };

  const isImageUrl = (v) => typeof v === "string" && v.length > 4 && (v.includes("/") || v.includes("."));
  const pickImage = (item) => {
    const first = item.images?.[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      for (const v of Object.values(first)) if (isImageUrl(v)) return v;
    }
    return "";
  };

  const stockWarning = (item) => {
    const left = Number(item.original_product_quantity);
    if (Number.isFinite(left) && left > 0 && left <= 5) {
      return `<span class="drawer-stock-low">⚠ ${esc(onlyLeftTpl.replace("{n}", left))}</span>`;
    }
    return "";
  };

  const priceBlock = (item) => {
    const total = localizeCurrency(item.total_string ?? item.price_string ?? "", lastCart);
    const qty = Number(item.quantity ?? 1);
    // `price_string` is the per-piece unit price; `total_string` is the
    // line total. When they're identical (qty = 1) the per-unit row is
    // redundant; only show it when qty > 1 so the customer sees how
    // the line total broke down.
    const unit = localizeCurrency(item.price_string ?? "", lastCart);
    const unitLine =
      qty > 1 && unit && unit !== total
        ? `<span class="drawer-price-unit text-xs opacity-70">${esc(unit)} × ${qty}</span>`
        : "";
    const hasDiscount =
      (item.gross_sale_price != null && item.gross_price != null && item.gross_sale_price !== item.gross_price) ||
      (item.undiscounted_gross_unit_price != null && item.gross_unit_price != null && item.undiscounted_gross_unit_price !== item.gross_unit_price) ||
      (item.price_before != null && item.price != null && item.price_before !== item.price);

    // Per-line savings chip — shown only when the line is actually
    // discounted. Numeric diff (unit_before − unit_now) × qty, formatted
    // through `fmt` so the currency follows the cart's locale.
    let savingsChip = "";
    if (hasDiscount) {
      const unitBefore = Number(
        item.undiscounted_gross_unit_price ?? item.price_before ?? item.gross_price ?? 0
      );
      const unitNow = Number(
        item.gross_unit_price ?? item.gross_sale_price ?? item.price ?? 0
      );
      const savings = (unitBefore - unitNow) * qty;
      if (Number.isFinite(savings) && savings > 0) {
        // `savingsLbl` is already in the i18n dictionary ("You saved" /
        // "وفرت") — reuse it instead of inventing a new key.
        savingsChip = `<span class="drawer-price-savings text-[0.6875rem] font-semibold">${esc(T.savingsLbl || "You saved")} ${esc(fmt(savings, lastCart))}</span>`;
      }
    }

    if (hasDiscount) {
      const original = localizeCurrency(item.price_before_string ?? item.gross_price_string ?? "", lastCart);
      // Pack `unit × qty` and the struck-through original line total
      // into one row so they read as the breakdown of the discount,
      // with the bold red current total below them and the savings
      // chip as the visual conclusion underneath.
      const breakdownRow =
        unitLine || original
          ? `<div class="flex items-center gap-2">
              ${unitLine}
              ${original ? `<span class="drawer-price-original">${esc(original)}</span>` : ""}
            </div>`
          : "";
      return `
        <div class="text-sm flex flex-col items-end leading-tight">
          ${breakdownRow}
          <span class="drawer-price-sale">${esc(total)}</span>
          ${savingsChip}
        </div>`;
    }
    return `
      <div class="text-sm flex flex-col items-end leading-tight">
        ${unitLine}
        <span class="font-semibold">${esc(total)}</span>
      </div>`;
  };

  const renderCustomFields = (item) => {
    const fields = Array.isArray(item.custom_fields) ? item.custom_fields : [];
    if (fields.length === 0) return "";
    const rows = [];
    const groups = new Map();
    for (const f of fields) {
      if (!f) continue;
      const g = f.group_name || "";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(f);
    }
    const safeUrl = (u) => {
      const s = String(u ?? "").trim();
      return /^https?:\/\//i.test(s) ? s : "";
    };
    for (const [groupName, fs] of groups.entries()) {
      if (groupName) rows.push(`<div class="drawer-cf__group">${esc(groupName)}</div>`);
      for (const f of fs) {
        const label = f.name ?? "";
        let value = "";
        let isHtml = false;
        const t = String(f.type ?? "").toUpperCase();
        if (t === "FILE" || t === "IMAGE") {
          const url = safeUrl(f.value || f.file_url || "");
          if (url) {
            const isImg = t === "IMAGE" || /\.(jpe?g|png|webp|gif|svg|avif)/i.test(url);
            value = isImg
              ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="drawer-cf__file"><img src="${esc(url)}" alt="${esc(label)}"/>${esc(T_ATTACHED_FILE)}</a>`
              : `<a href="${esc(url)}" target="_blank" rel="noopener" class="drawer-cf__file"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>${esc(T_ATTACHED_FILE)}</a>`;
            isHtml = true;
          }
        } else if (t === "CHECKBOX") {
          value = f.value ? "✓" : "✗";
        } else {
          value = f.value ?? "";
        }
        if (label || value) {
          const valueHtml = isHtml ? value : esc(value);
          rows.push(`<div class="drawer-cf__row">${label ? `<span class="drawer-cf__label">${esc(label)}:</span>` : ""}<span class="drawer-cf__value">${valueHtml}</span></div>`);
        }
      }
    }
    return rows.length > 0 ? `<div class="drawer-cf">${rows.join("")}</div>` : "";
  };

  const itemErrorBlock = (item) => {
    const msg = item.error_message;
    const unavailable = item.is_original_product_available === false || item.is_original_quantity_finished === true;
    if (!msg && !unavailable) return "";
    const clean =
      (msg || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || T.unavailable;
    return `<div class="drawer-item-error">${esc(clean)}</div>`;
  };

  const extractVariants = (item) => {
    const out = [];
    const seen = new Set();
    const push = (label, value) => {
      if (value == null || value === "") return;
      const key = `${label || ""}=${value}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ label: label ? String(label).trim() : "", value: String(value).trim() });
    };

    for (const arr of [item.options, item.product_options, item.attributes, item.variant_attributes, item.selected_options]) {
      if (Array.isArray(arr)) {
        for (const o of arr) {
          if (typeof o !== "object" || !o) continue;
          push(o.name ?? o.label ?? o.title ?? o.key, o.value ?? o.text ?? o.option_value);
        }
      }
    }
    if (out.length === 0 && item.parent_name && item.name && item.parent_name !== item.name) {
      push("", item.name);
    }
    if (out.length === 0 && item.parent_id && item.name && / - /.test(item.name)) {
      const idx = item.name.indexOf(" - ");
      if (idx > 0) {
        const variantPart = item.name.slice(idx + 3).trim();
        for (const v of variantPart.split(" - ")) {
          const trimmed = v.trim();
          if (trimmed) push("", trimmed);
        }
      }
    }
    return out;
  };

  const getDisplayName = (item) => {
    let n = item.name ?? "";
    if (item.parent_name && item.parent_name !== item.name) n = item.parent_name;
    else if (item.parent_id && item.name && / - /.test(item.name)) {
      const idx = item.name.indexOf(" - ");
      if (idx > 0) n = item.name.slice(0, idx).trim();
    }
    return decodeEntities(n);
  };

  const renderItem = (item) => {
    const name = getDisplayName(item);
    const url = item.url ?? "#";
    const img = pickImage(item);
    const qty = item.quantity ?? 1;
    const maxStock = Number(item.original_product_quantity) || 0; // 0 = unlimited
    const variants = extractVariants(item);
    const isVariant = !!item.parent_id;

    let variantsHtml = "";
    if (isVariant) {
      const currentLabel =
        variants.length > 0
          ? variants.map((v) => (v.label ? `${v.label}: ${v.value}` : v.value)).join(" · ")
          : item.name ?? "";

      const rewrittenUrl = (() => {
        try {
          const u = new URL(item.url ?? "");
          u.hostname = window.location.hostname;
          u.protocol = window.location.protocol;
          return u.toString();
        } catch {
          return item.url ?? "#";
        }
      })();

      variantsHtml = `
        <div class="drawer-variants" data-drawer-variants>
          <div class="drawer-variants__values" data-variant-display>${esc(currentLabel)}</div>
          <button type="button" class="drawer-variants__edit-btn" data-cart-edit-variant data-product-url="${esc(rewrittenUrl)}">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
            ${esc(T.edit)}
          </button>
        </div>
      `;
    } else if (variants.length > 0) {
      variantsHtml = `
        <div class="drawer-variants__values">
          ${variants
            .map((v) =>
              v.label
                ? `<span><span class="opacity-70">${esc(v.label)}:</span> <span class="font-medium">${esc(v.value)}</span></span>`
                : `<span class="font-medium">${esc(v.value)}</span>`
            )
            .join('<span class="opacity-40 mx-1">·</span>')}
        </div>
      `;
    }
    return `
      <li class="flex gap-3" data-drawer-line data-cart-item-id="${esc(item.id)}" data-max-stock="${Number(maxStock) || 0}">
        <a href="${esc(url)}" class="block aspect-square w-12 shrink-0 overflow-hidden rounded bg-secondary">
          ${img ? `<img src="${esc(img)}" alt="" class="size-full object-cover" loading="lazy"/>` : ""}
        </a>
        <div class="flex flex-1 flex-col gap-1.5 min-w-0">
          <div class="flex items-start justify-between gap-2">
            <a href="${esc(url)}" class="text-sm font-medium transition-colors hover:text-primary line-clamp-2">${esc(name)}</a>
            <button type="button" data-drawer-remove class="text-muted hover:text-destructive transition shrink-0" aria-label="${esc(T_REMOVE)}">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
          ${variantsHtml}
          ${renderCustomFields(item)}
          ${itemErrorBlock(item)}
          ${stockWarning(item)}
          <div class="flex items-center justify-between gap-2 mt-auto">
            <div class="drawer-qty">
              <button type="button" data-drawer-qty="-1" class="drawer-qty__btn" aria-label="${esc(T_DECREASE_QTY)}">−</button>
              <span class="drawer-qty__value" data-drawer-qty-value>${Number(qty) || 1}</span>
              <button type="button" data-drawer-qty="1" class="drawer-qty__btn" aria-label="${esc(T_INCREASE_QTY)}" ${maxStock > 0 && qty >= maxStock ? "disabled" : ""}>+</button>
            </div>
            ${priceBlock(item)}
          </div>
        </div>
      </li>
    `;
  };

  // ─── Premium price summary ───
  const renderBreakdown = (cart) => {
    if (!breakEl) return;
    if (!cart?.products?.length) {
      breakEl.innerHTML = "";
      return;
    }

    const totals = cart?.totals ?? [];
    const productsCount = cart?.products_count ?? cart?.products?.length ?? 0;
    const subRow = totals.find((t) => t.code === "sub_totals");
    let subtotalNum = Number(subRow?.value ?? NaN);
    if (!Number.isFinite(subtotalNum)) {
      subtotalNum = cart.products.reduce((acc, p) => {
        const u = Number(p.undiscounted_gross_total ?? p.gross_price * (p.quantity ?? 1) ?? 0);
        return acc + (Number.isFinite(u) ? u : 0);
      }, 0);
    }
    const subtotalStr = subRow?.value_string
      ? localizeCurrency(subRow.value_string, cart)
      : fmt(subtotalNum, cart);

    let savings = 0;
    for (const item of cart.products) {
      const u = Number(item.undiscounted_gross_total ?? item.undiscounted_gross_unit_price * item.quantity ?? 0);
      const d = Number(item.gross_unit_price ?? item.gross_price ?? item.price ?? 0) * (item.quantity ?? 1);
      if (u > d) savings += u - d;
    }
    for (const t of totals) {
      if (!t?.code) continue;
      const code = String(t.code);
      if (!code.includes("discount")) continue;
      if (code === "products_discount") continue;
      const v = Math.abs(Number(t.value ?? 0));
      if (v > 0) savings += v;
    }
    const couponDiscount = Number(cart?.coupon?.discount_amount ?? cart?.coupon?.discount ?? 0);
    if (couponDiscount > 0 && !totals.some((t) => String(t?.code ?? "").includes("discount"))) {
      savings += couponDiscount;
    }
    const savingsStr = savings > 0 ? fmt(savings, cart) : "";

    const rows = [];
    const countNum = Number(productsCount) || 0;

    // Final payable amount (after every discount), and the gross subtotal
    // before discounts (= payable + total savings) so the three rows always
    // reconcile: subtotal − discounts = total.
    const payableNum = Number(cart?.total?.value ?? subtotalNum);
    const grossNum = payableNum + (savings > 0 ? savings : 0);

    // 1) Subtotal (with item count)
    rows.push(`
      <div class="drawer-summary__row">
        <span class="drawer-summary__label">${esc(T.subtotalLbl)}${countNum > 0 ? ` <span class="drawer-summary__count">( ${esc(T.productWord)} ${countNum} )</span>` : ""}</span>
        <span class="drawer-summary__value">${esc(fmt(grossNum, cart))}</span>
      </div>
    `);

    // 2) Total discounts — shown in the destructive colour, only when > 0
    if (savings > 0) {
      rows.push(`
        <div class="drawer-summary__row drawer-summary__row--discount">
          <span class="drawer-summary__label">${esc(T.discountsLbl || T.discountLbl)}</span>
          <span class="drawer-summary__value">- ${esc(fmt(savings, cart))}</span>
        </div>
      `);
    }

    // Total row — the amount actually payable. When a coupon/discount applies,
    // the pre-coupon price is shown struck-through inline, with the net total
    // beside it (no separate subtotal/discount rows). Emphasised; carries the
    // `data-drawer-total` hook + the item count.
    // Savings + loyalty-points are folded into the total row's value stack
    // (no separate boxed callout). `data-drawer-callout` stays on the row so
    // the points JS can reveal it; `data-drawer-points*` hooks are preserved.
    const savedIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>`;
    const pointsIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26z"/></svg>`;
    rows.push(`
      <div class="drawer-summary__row drawer-summary__row--total" data-drawer-callout>
        <span class="drawer-summary__label">${esc(T.totalLbl || T.subtotalLbl)}</span>
        <span class="drawer-summary__value-stack">
          <span class="drawer-summary__value" data-drawer-total>${esc(fmt(payableNum, cart))}</span>
          <span class="drawer-summary__saved drawer-summary__saved--points" data-drawer-points hidden>${pointsIcon} ${esc(T_POINTS_EARN)} <strong data-drawer-points-value></strong> ${esc(T_POINTS_UNIT)}</span>
        </span>
      </div>
    `);

    breakEl.innerHTML = rows.join("");

    try {
      const calloutEl = breakEl.querySelector("[data-drawer-callout]");
      const pointsEl = breakEl.querySelector("[data-drawer-points]");
      const pointsVal = breakEl.querySelector("[data-drawer-points-value]");
      if (loyaltyPreviewEnabled && pointsEl && pointsVal && typeof window.zid?.cart?.getCalculatedPoints === "function") {
        const total = Number(cart?.total?.value ?? subtotalNum ?? 0);
        if (total > 0) {
          Promise.resolve(window.zid.cart.getCalculatedPoints(total))
            .then((res) => {
              const pts = Number(res?.points ?? res?.data?.points ?? res ?? 0);
              if (pts > 0) {
                pointsVal.textContent = pts.toLocaleString(document.documentElement.lang || "ar");
                pointsEl.hidden = false;
                if (calloutEl) calloutEl.hidden = false;
              }
            })
            .catch(() => {});
        }
      }
    } catch {}
  };

  // Resolve a coupon's discount percentage. Prefer a server-supplied percentage
  // (coupons configured as "percentage off" expose type + value); otherwise
  // fall back to computing from the discount amount and the undiscounted
  // subtotal. Returns an integer 1..99, or null if we can't determine one.
  const couponPercent = (cart) => {
    const c = cart?.coupon;
    if (!c) return null;

    const typeStr = String(c.discount_type ?? c.type ?? "").toLowerCase();
    const directPct = Number(
      (typeStr.includes("percent") && (c.discount_value ?? c.value)) ??
        c.percentage ??
        c.discount_percentage ??
        NaN
    );
    if (Number.isFinite(directPct) && directPct > 0 && directPct < 100) {
      return Math.round(directPct);
    }

    const discountAmt = Math.abs(Number(c.discount_amount ?? c.discount ?? 0));
    if (!discountAmt) return null;
    const totals = cart?.totals ?? [];
    const subRow = totals.find((t) => t.code === "sub_totals");
    const subtotal = Number(subRow?.value ?? cart?.products_subtotal ?? 0);
    if (!(subtotal > 0)) return null;
    const pct = Math.round((discountAmt / subtotal) * 100);
    return pct > 0 && pct < 100 ? pct : null;
  };

  const renderCoupon = (cart) => {
    if (!couponForm) return;
    const code = cart?.coupon?.code;
    if (code) {
      couponForm.classList.add("hidden");
      couponApplied.classList.remove("hidden");
      couponApplied.classList.add("flex");
      couponCodeEl.textContent = code;
      if (couponPercentEl) {
        const pct = couponPercent(cart);
        if (pct != null) {
          const sign = document.documentElement.dir === "rtl" ? "" : "−";
          couponPercentEl.textContent = `${sign}${pct}%`;
          couponPercentEl.hidden = false;
          couponPercentEl.classList.remove("hidden");
        } else {
          couponPercentEl.textContent = "";
          couponPercentEl.hidden = true;
          couponPercentEl.classList.add("hidden");
        }
      }
    } else {
      couponForm.classList.remove("hidden");
      couponApplied.classList.add("hidden");
      couponApplied.classList.remove("flex");
    }
  };

  // Latest cart, captured per-render so closure helpers (`priceBlock`'s
  // savings formatter, etc.) can reach the currency code without
  // threading `cart` through every render signature.
  let lastCart = null;
  const render = async () => {
    loading.classList.remove("hidden");
    empty.classList.add("hidden");
    empty.classList.remove("flex");
    list.classList.add("hidden");
    footer.classList.add("hidden");

    try {
      closeAllVariantMenus();
      closeAllRecMenus();
      const cart = await window.zid?.cart?.get?.();
      lastCart = cart;
      const products = cart?.products ?? [];
      loading.classList.add("hidden");

      countEl.textContent = products.length > 0 ? `(${Number(cart?.products_count ?? products.length) || 0})` : "";

      if (products.length === 0) {
        empty.classList.remove("hidden");
        empty.classList.add("flex");
        if (shipBox) shipBox.hidden = true;
        recommendedEl?.classList.add("hidden");
        return;
      }
      recommendedEl?.classList.remove("hidden");
      loadRecommended();
      prefetchVariants(cart);

      list.innerHTML = products.map(renderItem).join("");
      for (const li of list.querySelectorAll("[data-drawer-line]")) {
        li.classList.add("is-entering");
        requestAnimationFrame(() => requestAnimationFrame(() => li.classList.remove("is-entering")));
      }
      list.classList.remove("hidden");

      footer.classList.remove("hidden");

      const problems = [];
      for (const item of products) {
        if (item.is_original_product_available === false || item.is_original_quantity_finished === true) {
          problems.push(`"${item.name}" — ${T.noLongerAvailable}`);
        } else if (item.is_product_price_updated === true) {
          problems.push(`"${item.name}" — ${T.priceChanged}`);
        } else if (item.is_requested_quantity_enough === false) {
          problems.push(`"${item.name}" — ${T.qtyNotAvailable}`);
        }
      }
      if (problems.length > 0) {
        const title = T.cartNotice;
        window.showToast?.({
          title: `${title}: ${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1})` : ""}`,
          variant: "remove"
        });
      }
      try { renderBreakdown(cart); } catch (e) { console.error("[CartDrawer] renderBreakdown failed:", e); }
      try { renderCoupon(cart); } catch (e) { console.error("[CartDrawer] renderCoupon failed:", e); }
      updateShippingBar(cart);
    } catch (err) {
      console.error("[CartDrawer] render failed:", err);
      loading.classList.add("hidden");
      empty.classList.remove("hidden");
      empty.classList.add("flex");
    }
  };

  // ─── Debounced quantity updates ───
  const pendingQty = new Map();
  const qtyTimers = new Map();
  const qtyBeforeUpdate = new Map();

  const flushQty = async (itemId) => {
    qtyTimers.delete(itemId);
    const newQty = pendingQty.get(itemId);
    pendingQty.delete(itemId);
    if (newQty == null) return;
    const line = list.querySelector(`[data-drawer-line][data-cart-item-id="${itemId}"]`);
    try {
      line?.classList.add("is-busy");
      showSpinner(line);
      await window.zid.cart.updateProduct(
        { product_id: itemId, quantity: newQty },
        { showErrorNotification: false }
      );
      qtyBeforeUpdate.delete(itemId);
      window.dispatchEvent(new CustomEvent("cart:updated", { detail: { action: "update", quantity: newQty } }));
    } catch (err) {
      window.showToast?.({ title: cartErrorMessage(err) || T.couldNotChange, variant: "remove" });
      const prev = qtyBeforeUpdate.get(itemId);
      qtyBeforeUpdate.delete(itemId);
      if (line && prev != null) {
        const valEl = line.querySelector("[data-drawer-qty-value]");
        if (valEl) valEl.textContent = String(prev);
        const maxStock = Number(line.dataset.maxStock) || 0;
        const plusBtn = line.querySelector('[data-drawer-qty="1"]');
        if (plusBtn) plusBtn.disabled = maxStock > 0 && prev >= maxStock;
      }
      line?.classList.remove("is-busy");
      hideSpinner(line);
    }
  };

  const showSpinner = (line) => {
    if (!line || line.querySelector(".drawer-spinner")) return;
    const s = document.createElement("div");
    s.className = "drawer-spinner";
    s.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
    line.appendChild(s);
  };
  const hideSpinner = (line) => line?.querySelector(".drawer-spinner")?.remove();

  // ─── Variant siblings cache + fetcher ───
  const variantsCache = new Map();
  const variantsInFlight = new Map();

  const fetchSiblings = (parentId) => {
    if (variantsCache.has(parentId)) return Promise.resolve(variantsCache.get(parentId));
    if (variantsInFlight.has(parentId)) return variantsInFlight.get(parentId);

    const tryParams = [{ parent_id: parentId }, { parent: parentId }, { product_parent_id: parentId }];
    const promise = (async () => {
      const attempts = tryParams.map((params) =>
        window.zid.products
          .list({ ...params, page_size: 50 }, { showErrorNotification: false })
          .then((r) => {
            const items = r?.results ?? [];
            return items.filter((p) => String(p.parent_id ?? p.parent ?? "") === String(parentId));
          })
          .catch(() => [])
      );
      const results = await Promise.all(attempts);
      const matched = results.find((arr) => arr.length > 0) ?? [];
      if (matched.length > 0) {
        variantsCache.set(parentId, matched);
        return matched;
      }
      try {
        const r = await window.zid.products.get?.(parentId, { showErrorNotification: false });
        const variants = r?.variants ?? r?.product?.variants ?? [];
        if (Array.isArray(variants) && variants.length > 0) {
          variantsCache.set(parentId, variants);
          return variants;
        }
      } catch {}
      variantsCache.set(parentId, []);
      return [];
    })();

    variantsInFlight.set(parentId, promise);
    promise.finally(() => variantsInFlight.delete(parentId));
    return promise;
  };

  // See drawer-drawer.js history: Zid returns the same UUID in dashed and
  // hyphen-stripped form in different fields; stripping before compare is safe
  // because UUID non-hyphen positions never contain hyphens.
  const normalizeId = (id) => String(id ?? "").replace(/-/g, "").toLowerCase();

  const checkSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  const populateMenu = (menu, siblings, currentProductId) => {
    if (!menu || !Array.isArray(siblings)) return;
    const currentItem = menu.querySelector("[data-variant-option].is-current");
    const currentLabel = currentItem?.querySelector("span")?.textContent ?? "";
    const currentNorm = normalizeId(currentProductId);

    const seenIds = new Set();
    const seenLabels = new Set();
    const items = [];
    let foundCurrent = false;

    for (const p of siblings) {
      const id = p.id ?? p.product_id;
      if (id == null) continue;
      const norm = normalizeId(id);
      if (seenIds.has(norm)) continue;
      seenIds.add(norm);

      const isCurrent = norm === currentNorm;
      if (isCurrent) foundCurrent = true;

      const fullName = p.name ?? p.title ?? "";
      const idx = fullName.lastIndexOf(" - ");
      const label = (idx > 0 ? fullName.slice(idx + 3) : fullName).trim();

      if (seenLabels.has(label) && !isCurrent) continue;
      seenLabels.add(label);

      const useId = isCurrent ? currentProductId : id;
      items.push({ id: useId, label, isCurrent });
    }

    if (!foundCurrent) {
      items.unshift({ id: currentProductId, label: currentLabel, isCurrent: true });
    }
    if (items.length <= 1) return;

    menu.innerHTML = items
      .map(
        (it) => `
      <li class="drawer-variants__option ${it.isCurrent ? "is-current" : ""}" role="option" aria-selected="${it.isCurrent ? "true" : "false"}" data-variant-option data-product-id="${esc(it.id)}">
        <span>${esc(it.label)}</span>
        ${it.isCurrent ? checkSvg : ""}
      </li>
    `
      )
      .join("");
  };

  const prefetchVariants = async (cart) => {
    const groupsByParent = new Map();
    for (const item of cart?.products ?? []) {
      if (!item.parent_id) continue;
      if (!groupsByParent.has(item.parent_id)) groupsByParent.set(item.parent_id, []);
      groupsByParent.get(item.parent_id).push(item);
    }
    const entries = [...groupsByParent.entries()];
    const CONCURRENCY = 2;
    let cursor = 0;
    const worker = async () => {
      while (cursor < entries.length) {
        const [parentId, items] = entries[cursor++];
        try {
          const siblings = await fetchSiblings(parentId);
          if (!siblings?.length) continue;
          for (const item of items) {
            const wrap = list.querySelector(`[data-variant-select-wrap][data-current-product-id="${item.product_id}"]`);
            const menu = wrap?.querySelector("[data-variant-menu]");
            if (menu) populateMenu(menu, siblings, item.product_id);
          }
        } catch {}
      }
    };
    for (let i = 0; i < Math.min(CONCURRENCY, entries.length); i++) worker();
  };

  // ─── Targeted footer/totals refresh ───
  const refreshTotals = async () => {
    try {
      const cart = await window.zid?.cart?.get?.();
      if (!cart) return;
      countEl.textContent = `(${Number(cart?.products_count ?? cart?.products?.length ?? 0) || 0})`;
      renderBreakdown(cart);
      renderCoupon(cart);
      updateShippingBar(cart);
      for (const el of document.querySelectorAll("[data-cart-badge]")) {
        const c = cart?.products_count ?? 0;
        el.textContent = c;
        el.hidden = c === 0;
      }
      return cart;
    } catch {}
  };

  // ─── Custom variant menu (popover top-layer) ───
  const closeAllVariantMenus = () => {
    for (const m of document.querySelectorAll("[data-variant-menu]")) {
      try { if (m.matches(":popover-open")) m.hidePopover(); } catch {}
      m.hidden = true;
    }
    for (const t of document.querySelectorAll("[data-variant-trigger]")) {
      t.setAttribute("aria-expanded", "false");
    }
  };

  const positionMenu = (menu, trigger) => {
    const r = trigger.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.insetInlineStart = `${document.documentElement.dir === "rtl" ? window.innerWidth - r.right : r.left}px`;
    menu.style.minWidth = `${r.width}px`;
  };

  list.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-variant-trigger]");
    if (!trigger) return;
    e.preventDefault();
    e.stopPropagation();
    const wrap = trigger.closest("[data-variant-select-wrap]");
    const menu = wrap?.querySelector("[data-variant-menu]");
    if (!menu) return;
    const wasOpen = !menu.hidden;
    closeAllVariantMenus();
    if (!wasOpen) {
      positionMenu(menu, trigger);
      menu.hidden = false;
      try { menu.showPopover(); } catch {}
      trigger.setAttribute("aria-expanded", "true");
    }
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-variant-trigger]") || e.target.closest("[data-variant-menu]")) return;
    closeAllVariantMenus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllVariantMenus();
  });
  window.addEventListener("scroll", closeAllVariantMenus, { passive: true, capture: true });

  // Option pick → swap variants
  list.addEventListener("click", async (e) => {
    const opt = e.target.closest("[data-variant-option]");
    if (!opt) return;
    e.preventDefault();
    e.stopPropagation();
    const wrap = opt.closest("[data-variant-select-wrap]");
    const line = opt.closest("[data-drawer-line]");
    if (!wrap || !line) return;
    const newProductId = opt.dataset.productId;
    const newLabel = opt.querySelector("span")?.textContent ?? "";
    const currentProductId = wrap.dataset.currentProductId;
    const oldItemId = line.dataset.cartItemId;
    const parentId = wrap.dataset.parentId;
    const qty = Number(wrap.dataset.currentQty) || 1;
    closeAllVariantMenus();
    if (!newProductId || normalizeId(newProductId) === normalizeId(currentProductId)) return;

    const display = wrap.querySelector("[data-variant-display]");
    if (display) display.textContent = newLabel;

    line.classList.add("is-busy");
    showSpinner(line);

    try {
      // Add the new variant FIRST so a failed add doesn't destroy the cart item.
      await window.zid.cart.addProduct({ product_id: newProductId, quantity: qty }, { showErrorNotification: false });
      try {
        await window.zid.cart.removeProduct({ product_id: oldItemId }, { showErrorNotification: false });
      } catch {
        window.showToast?.({ title: T.variantChanged, variant: "update" });
      }

      const cart = await refreshTotals();
      const newItem =
        cart?.products?.find((p) => p.parent_id === parentId && normalizeId(p.product_id) === normalizeId(newProductId)) ??
        cart?.products?.find((p) => p.parent_id === parentId);

      if (newItem) {
        const tmp = document.createElement("div");
        tmp.innerHTML = renderItem(newItem).trim();
        const newLine = tmp.firstElementChild;
        line.replaceWith(newLine);
        const cached = variantsCache.get(parentId);
        if (cached) {
          const newMenu = newLine.querySelector("[data-variant-menu]");
          if (newMenu) populateMenu(newMenu, cached, newItem.product_id);
        }
        window.showToast?.({ title: T.variantChanged, variant: "update" });
      } else {
        window.dispatchEvent(new CustomEvent("cart:updated", { detail: { action: "update", source: "variant-swap" } }));
      }
    } catch (err) {
      window.showToast?.({ title: cartErrorMessage(err) || T.couldNotChange, variant: "remove" });
      line.classList.remove("is-busy");
      hideSpinner(line);
      const display2 = wrap.querySelector("[data-variant-display]");
      const currentItem = wrap.querySelector("[data-variant-option].is-current span");
      if (display2 && currentItem) display2.textContent = currentItem.textContent;
    }
  });

  // ─── Event delegation for line actions ───
  list.addEventListener("click", async (e) => {
    const line = e.target.closest("[data-drawer-line]");
    if (!line) return;
    const itemId = line.dataset.cartItemId;
    if (!itemId) return;

    const removeBtn = e.target.closest("[data-drawer-remove]");
    const qtyBtn = e.target.closest("[data-drawer-qty]");

    if (removeBtn) {
      line.classList.add("is-busy");
      showSpinner(line);
      try {
        await window.zid.cart.removeProduct({ product_id: itemId }, { showErrorNotification: false });
        line.classList.add("is-leaving");
        setTimeout(
          () => window.dispatchEvent(new CustomEvent("cart:updated", { detail: { action: "remove" } })),
          320
        );
      } catch (err) {
        window.showToast?.({ title: cartErrorMessage(err) || T.couldNotChange, variant: "remove" });
        line.classList.remove("is-busy");
        hideSpinner(line);
      }
    } else if (qtyBtn) {
      const delta = Number(qtyBtn.dataset.drawerQty);
      const valEl = line.querySelector("[data-drawer-qty-value]");
      const current = Number(pendingQty.get(itemId) ?? valEl.textContent) || 1;
      const maxStock = Number(line.dataset.maxStock) || 0;
      let newQty = current + delta;

      if (maxStock > 0 && newQty > maxStock) newQty = maxStock;

      if (newQty <= 0) {
        if (qtyTimers.has(itemId)) {
          clearTimeout(qtyTimers.get(itemId));
          qtyTimers.delete(itemId);
        }
        pendingQty.delete(itemId);
        line.classList.add("is-busy");
        showSpinner(line);
        try {
          await window.zid.cart.removeProduct({ product_id: itemId }, { showErrorNotification: false });
          line.classList.add("is-leaving");
          setTimeout(
            () => window.dispatchEvent(new CustomEvent("cart:updated", { detail: { action: "remove" } })),
            320
          );
        } catch (err) {
          window.showToast?.({ title: cartErrorMessage(err) || T.couldNotChange, variant: "remove" });
          line.classList.remove("is-busy");
          hideSpinner(line);
        }
        return;
      }

      if (newQty === current) return;
      if (!qtyBeforeUpdate.has(itemId)) qtyBeforeUpdate.set(itemId, current);
      valEl.textContent = newQty;
      const plusBtn = line.querySelector('[data-drawer-qty="1"]');
      if (plusBtn) plusBtn.disabled = maxStock > 0 && newQty >= maxStock;
      pendingQty.set(itemId, newQty);
      if (qtyTimers.has(itemId)) clearTimeout(qtyTimers.get(itemId));
      qtyTimers.set(itemId, setTimeout(() => flushQty(itemId), 350));
    }
  });

  // ─── Coupon handlers ───
  couponForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = couponInput.value.trim();
    if (!code) return;
    couponBtn.disabled = true;
    try {
      await window.zid.cart.applyCoupon({ coupon_code: code }, { showErrorNotification: false });
      couponInput.value = "";
      window.showToast?.({ title: T.couponApplied, variant: "add" });
      window.dispatchEvent(new CustomEvent("cart:updated", { detail: { action: "update", source: "coupon", silent: true } }));
    } catch (err) {
      window.showToast?.({ title: couponErrorMessage(err), variant: "remove" });
    } finally {
      couponBtn.disabled = false;
    }
  });

  couponRemove?.addEventListener("click", async () => {
    couponRemove.disabled = true;
    try {
      await window.zid.cart.removeCoupons({ showErrorNotification: false });
      window.showToast?.({ title: T.couponRemoved, variant: "remove" });
      window.dispatchEvent(
        new CustomEvent("cart:updated", { detail: { action: "update", source: "coupon-remove", silent: true } })
      );
    } catch (err) {
      window.showToast?.({ title: couponErrorMessage(err), variant: "remove" });
    } finally {
      couponRemove.disabled = false;
    }
  });

  // Coupon-specific: translate the "cannot be used" SDK message to a
  // friendlier single string in both English and Arabic.
  const couponErrorMessage = (err) => {
    const raw = cartErrorMessage(err);
    if (!raw) return T.couponFailed;
    const norm = raw.replace(/\s+/g, " ").trim();
    const cannotBeUsed =
      /(الكوبون|الكود|كوبون|كود).{0,5}(لا\s*يمكن|لايمكن).{0,5}(استخدامه|استخدام)/.test(norm) ||
      /coupon.{0,5}cannot.{0,5}be\s*used/i.test(norm);
    return cannotBeUsed ? T.couponUnavailable : norm;
  };

  // ─── Checkout: prefetch on hover, auto-close on click ───
  checkoutBtn?.addEventListener(
    "mouseenter",
    () => {
      if (checkoutBtn.dataset.prefetched) return;
      checkoutBtn.dataset.prefetched = "1";
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.href = checkoutBtn.href;
      document.head.appendChild(link);
    },
    { once: true }
  );

  checkoutBtn?.addEventListener("click", () => {
    setTimeout(() => {
      try { dialog.close(); } catch {}
    }, 100);
  });

  // ─── Clear cart button ───
  const confirmClearCart = () =>
    new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = `variant-confirm-overlay variant-confirm-overlay--${confirmStyle}`;
      overlay.setAttribute("popover", "manual");
      overlay.innerHTML = `
        <div class="variant-confirm">
          <div class="variant-confirm__icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </div>
          <h3 class="variant-confirm__title">${esc(clearCartLabel)}</h3>
          <p class="variant-confirm__subtitle">${esc(clearCartConfirmMsg)}</p>
          <div class="variant-confirm__actions">
            <button type="button" class="drawer-checkout-btn variant-confirm__btn" data-confirm-yes>${esc(clearCartLabel)}</button>
            <button type="button" class="drawer-continue-btn variant-confirm__btn" data-confirm-no>${esc(T.noKeepBoth)}</button>
          </div>
        </div>
      `;
      const cleanup = (answer) => {
        overlay.classList.add("is-leaving");
        setTimeout(() => {
          try { overlay.hidePopover(); } catch {}
          overlay.remove();
          resolve(answer);
        }, 250);
      };
      overlay.querySelector(".variant-confirm")?.addEventListener("click", (ev) => ev.stopPropagation());
      overlay.querySelector("[data-confirm-yes]")?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        cleanup(true);
      });
      overlay.querySelector("[data-confirm-no]")?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        cleanup(false);
      });
      overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay) cleanup(false);
      });
      document.body.appendChild(overlay);
      try { overlay.showPopover(); } catch {}
      requestAnimationFrame(() => overlay.classList.add("is-visible"));
    });

  dialog.querySelector("[data-drawer-clear-cart]")?.addEventListener("click", async () => {
    if (!(await confirmClearCart())) return;
    try {
      if (typeof window.zid?.cart?.empty === "function") {
        await window.zid.cart.empty({ showErrorNotification: false });
      } else {
        const c = await window.zid.cart.get();
        for (const it of c?.products ?? []) {
          await window.zid.cart.removeProduct({ product_id: it.id }, { showErrorNotification: false });
        }
      }
      window.dispatchEvent(new CustomEvent("cart:updated", { detail: { action: "remove", source: "clear" } }));
      window.showToast?.({ title: clearCartLabel, variant: "remove" });
    } catch (err) {
      window.showToast?.({ title: cartErrorMessage(err) || clearCartLabel, variant: "remove" });
    }
  });

  // ─── Body scroll lock ───
  // Shared, ref-counted helper (assets/js/lib/scroll-lock.js) so the drawer
  // and the quick-view popover can both lock without clobbering each other.

  // ─── Backdrop tap to close ───
  // Tapping outside the drawer panel (i.e., on the dimmed backdrop)
  // should dismiss — universal mobile expectation. `click` only fires
  // on press-and-release without movement, so swipes that drift off
  // the panel during scrolling won't accidentally close.
  dialog.addEventListener("click", (e) => {
    const panel = dialog.querySelector("[data-cart-drawer]");
    if (!panel) return;
    if (!panel.contains(e.target)) {
      try { dialog.close(); } catch {}
    }
  });

  // ─── Lifecycle ───
  dialog.addEventListener("toggle", async (e) => {
    if (e.newState === "open") {
      lockBodyScroll();
      render();
      try {
        const cart = await window.zid?.cart?.get?.();
        if (cart) window.zidTracking?.sendGaCartDetailViewedEvent?.({ cart });
      } catch {}
    }
    if (e.newState !== "open") {
      unlockBodyScroll();
      pendingVariantRemove = null;
    }
  });

  // Coalesce bursts of cart:updated events into a single render.
  let renderScheduled = false;
  const scheduleRender = () => {
    if (renderScheduled) return;
    renderScheduled = true;
    queueMicrotask(() => {
      renderScheduled = false;
      render();
    });
  };
  window.addEventListener("cart:updated", (e) => {
    scheduleRender();
    if (autoOpen && e.detail?.action === "add" && !dialog.open) {
      try { dialog.showModal(); } catch {}
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCartDrawer);
} else {
  initCartDrawer();
}
