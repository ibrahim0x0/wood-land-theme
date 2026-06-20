/**
 * Recommended products strip — cart page carousel.
 *
 * Reads its config from `data-*` attrs on `[data-cart-rec-strip]` and pulls
 * the product list through `loadRecommendedProducts`, which is the same
 * helper the cart drawer uses so both stay in sync.
 */

import { loadRecommendedProducts, rewriteUrl, slugFromUrl } from "./recommended.js";
import { cartErrorToast } from "./toast.js";
import { enableDragScroll } from "../lib/carousel.js";

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Decode entities a merchant stored literally in a name (e.g. "&nbsp;") so
// they don't render as raw text after esc(). Result is still esc()'d on use.
const decodeEntities = (v) => {
  const el = document.createElement("textarea");
  el.innerHTML = String(v ?? "");
  return el.value;
};

async function waitForZid(maxAttempts = 25) {
  for (let i = 0; i < maxAttempts; i++) {
    if (window.zid?.products?.list) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return !!window.zid?.products?.list;
}

function renderCard(p, labels) {
  const imgObj = p.main_image?.image ?? p.images?.[0]?.image ?? {};
  const img = imgObj.full_size ?? imgObj.large ?? imgObj.medium ?? imgObj.small ?? "";
  const url = p.html_url ?? "#";
  const localUrl = rewriteUrl(url);
  const name = decodeEntities(p.name);
  const sale = p.formatted_sale_price;
  const reg = p.formatted_price;
  const hasDiscount = sale && reg && sale !== reg;
  const priceHtml = hasDiscount
    ? `<div><span class="cart-rec-strip__price-original">${esc(reg)}</span> <span class="cart-rec-strip__price cart-rec-strip__price-sale">${esc(sale)}</span></div>`
    : `<span class="cart-rec-strip__price">${esc(reg || "")}</span>`;
  const hasOptions = !!p.has_options;
  const btnLabel = hasOptions ? labels.chooseOption : labels.add;
  const btn = hasOptions
    ? `<button type="button" class="cart-rec-strip__btn" data-rec-strip-qv data-product-url="${esc(localUrl)}">${esc(btnLabel)}</button>`
    : `<button type="button" class="cart-rec-strip__btn" data-rec-strip-add="${esc(p.id)}">
         <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
         ${esc(btnLabel)}
       </button>`;
  return `
    <div class="cart-rec-strip__card">
      <a href="${esc(url)}" class="cart-rec-strip__img">
        ${img ? `<img src="${esc(img)}" alt="${esc(name)}" loading="lazy"/>` : ""}
      </a>
      <div class="cart-rec-strip__body">
        <a href="${esc(url)}" class="cart-rec-strip__name">${esc(name)}</a>
        ${priceHtml}
        ${btn}
      </div>
    </div>
  `;
}

// Free-scroll dots + swipe hint for the strip, built after the cards render.
// Page-based dots (one per viewport-width); active dot tracks the scroll.
function setupRecCarousel(strip, track) {
  const dotsContainer = strip.querySelector("[data-cart-rec-dots]");
  const hint = strip.querySelector("[data-cart-rec-hint]");
  const isRTL = document.documentElement.dir === "rtl";
  let dots = [];
  const pageCount = () => Math.max(1, Math.round(track.scrollWidth / (track.clientWidth || 1)));
  const build = () => {
    if (!dotsContainer) return;
    const n = pageCount();
    dotsContainer.style.display = n <= 1 ? "none" : "";
    if (n === dots.length) return;
    dotsContainer.innerHTML = "";
    dots = [];
    for (let i = 0; i < n; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "carousel-dot";
      b.setAttribute("data-active", String(i === 0));
      b.setAttribute("aria-label", String(i + 1));
      b.addEventListener("click", () =>
        track.scrollTo({ left: (isRTL ? -1 : 1) * i * track.clientWidth, behavior: "smooth" })
      );
      dotsContainer.appendChild(b);
      dots.push(b);
    }
  };
  const update = () => {
    if (hint) hint.classList.toggle("is-hidden", track.scrollWidth - track.clientWidth <= 0);
    if (!dots.length) return;
    const active = Math.round(Math.abs(track.scrollLeft) / (track.clientWidth || 1));
    dots.forEach((d, i) => d.setAttribute("data-active", String(i === active)));
  };
  build();
  update();
  enableDragScroll(track); // desktop mouse drag-to-scroll
  let raf = 0;
  track.addEventListener(
    "scroll",
    () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); });
    },
    { passive: true }
  );
  window.addEventListener("resize", () => { build(); update(); });
}

async function initStrip(strip) {
  if (strip.dataset.loaded === "1") return;
  strip.dataset.loaded = "1";
  const track = strip.querySelector("[data-cart-rec-track]");
  if (!track) return;
  const labels = {
    add: strip.dataset.labelAdd || "Add",
    added: strip.dataset.labelAdded || "Added",
    chooseOption: strip.dataset.labelChooseOption || "Choose option"
  };

  const hasSdk = await waitForZid();
  if (!hasSdk) {
    strip.hidden = true;
    return;
  }

  try {
    const products = await loadRecommendedProducts({
      strategy: strip.dataset.strategy || "latest",
      count: Number(strip.dataset.count) || 8,
      manual: (strip.dataset.manual || "").trim(),
      category: strip.dataset.category || ""
    });
    if (products.length === 0) {
      strip.hidden = true;
      return;
    }
    track.innerHTML = products.map((p) => renderCard(p, labels)).join("");
    setupRecCarousel(strip, track);
  } catch {
    strip.hidden = true;
    return;
  }

  const plusSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  const resetBtn = (btn) => {
    btn.disabled = false;
    btn.innerHTML = `${plusSvg}${esc(labels.add)}`;
  };

  track.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-rec-strip-add]");
    if (!btn) return;
    e.preventDefault();
    const id = btn.dataset.recStripAdd;
    btn.disabled = true;
    btn.textContent = "…";
    try {
      await window.zid.cart.addProduct({ product_id: id, quantity: 1 }, { showErrorNotification: false });
      window.dispatchEvent(new CustomEvent("cart:updated", { detail: { action: "add", productId: id } }));
      btn.textContent = `✓ ${labels.added}`;
      setTimeout(() => resetBtn(btn), 1400);
    } catch (err) {
      cartErrorToast(err, labels.add);
      resetBtn(btn);
    }
  });

  track.addEventListener("click", (e) => {
    const qvBtn = e.target.closest("[data-rec-strip-qv]");
    if (!qvBtn) return;
    e.preventDefault();
    const url = qvBtn.dataset.productUrl;
    if (!url) return;
    const slug = slugFromUrl(url);
    if (window.quickViewManager) {
      window.quickViewManager.open(slug, url);
    } else {
      window.location.href = url;
    }
  });
}

function initAll() {
  document.querySelectorAll("[data-cart-rec-strip]").forEach(initStrip);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAll);
} else {
  initAll();
}
