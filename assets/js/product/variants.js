/**
 * Product Variants Module
 *
 * Handles variant selection UI updates:
 * - Price updates
 * - Product info (SKU, weight, badges)
 * - Stock status
 * - Gallery image updates
 *
 * Platform Callback (MUST KEEP):
 * - window.productOptionsChanged - Called by platform after variant API
 */

const GALLERY_ID = "product-gallery";
const QUICK_VIEW_MODAL_ID = "product-quick-view-modal";

// ─────────────────────────────────────────────────────────────
// Update scope
// ─────────────────────────────────────────────────────────────
//
// The same product markup (#product-id, [data-product-price], the options
// container, …) appears twice in the DOM when a quick-view popover is open:
// once on the underlying product page and once inside the modal. A plain
// document.querySelector always returns the FIRST match (the main page), so a
// variant change made in the quick-view would update the main page instead of
// the modal. To avoid that, every update is scoped to a "root" — either the
// quick-view modal or the document — determined by where the change happened.
//
// `currentVariantRoot` is updated by a capture-phase listener (see init) so it
// is correct no matter who triggers the change: our own fallback handlers OR
// the platform's product.js calling window.productOptionsChanged() directly.
let currentVariantRoot = null;

// The main page's product data, captured before any quick-view can overwrite
// window.productObj. Used to resolve variants for the main page.
let mainProductObj = null;

function rootOf(el) {
  if (el && typeof el.closest === "function") {
    const modal = el.closest(`#${QUICK_VIEW_MODAL_ID}`);
    if (modal) return modal;
  }
  return document;
}

function resolveRoot(root) {
  return root || currentVariantRoot || document;
}

// Product data for a given root: the modal stashes its own object on the
// element (see quick-view.js); the main page uses the captured original.
function productObjForRoot(root) {
  if (root && root.id === QUICK_VIEW_MODAL_ID) {
    return root.__qvProductObj || window.productObj || null;
  }
  return mainProductObj || window.productObj || null;
}

// ─────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────

function show(selector, root = document) {
  const el = root.querySelector(selector);
  if (el) {
    el.classList.remove("hidden", "d-none");
    el.style.display = "";
  }
}

function hide(selector, root = document) {
  const el = root.querySelector(selector);
  if (el) {
    el.classList.add("hidden");
    el.style.display = "none";
  }
}

// ─────────────────────────────────────────────────────────────
// Price Updates
// ─────────────────────────────────────────────────────────────

export function updatePrice(selectedProduct, root = document) {
  if (!selectedProduct) return;

  const priceEl = root.querySelector("[data-product-price]");
  const priceOldEl = root.querySelector("[data-product-price-old]");
  const discountEl = root.querySelector("[data-product-discount]");

  const hasDiscount = !!selectedProduct.formatted_sale_price;

  if (priceEl) {
    priceEl.textContent = hasDiscount ? selectedProduct.formatted_sale_price : selectedProduct.formatted_price;
  }

  if (priceOldEl) {
    if (hasDiscount) {
      priceOldEl.textContent = selectedProduct.formatted_price;
      priceOldEl.classList.remove("hidden");
    } else {
      priceOldEl.textContent = "";
      priceOldEl.classList.add("hidden");
    }
  }

  if (discountEl) {
    if (hasDiscount && selectedProduct.discount_percentage) {
      discountEl.textContent = `${selectedProduct.discount_percentage}%`;
      discountEl.classList.remove("hidden");
    } else {
      discountEl.textContent = "";
      discountEl.classList.add("hidden");
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Product Info Updates
// ─────────────────────────────────────────────────────────────

export function updateProductInfo(selectedProduct, root = document) {
  if (!selectedProduct) return;

  // Update SKU
  const skuEl = root.querySelector("[data-product-sku]");
  const skuWrapper = root.querySelector("[data-product-sku-wrapper]");
  if (skuEl && skuWrapper) {
    if (selectedProduct.sku) {
      skuEl.textContent = selectedProduct.sku;
      show("[data-product-sku-wrapper]", root);
    } else {
      hide("[data-product-sku-wrapper]", root);
    }
  }

  // Update Weight
  const weightEl = root.querySelector("[data-product-weight]");
  const weightWrapper = root.querySelector("[data-product-weight-wrapper]");
  if (weightEl && weightWrapper) {
    if (selectedProduct.weight?.value) {
      weightEl.textContent = `${selectedProduct.weight.value} ${selectedProduct.weight.unit || ""}`;
      show("[data-product-weight-wrapper]", root);
    } else {
      hide("[data-product-weight-wrapper]", root);
    }
  }

  // (Low-stock and sold-count badges were removed from the PDP markup — the
  //  urgency "Limited quantity" meter covers that now, so no update here.)
}

// ─────────────────────────────────────────────────────────────
// Stock & Quantity Updates
// ─────────────────────────────────────────────────────────────

export function updateStockStatus(selectedProduct, root = document) {
  if (!selectedProduct) return;

  // Update hidden product ID
  const productIdInput = root.querySelector("#product-id");
  if (productIdInput) {
    productIdInput.value = selectedProduct.id;
  }

  const inStockSection = root.querySelector("[data-in-stock]");
  const outOfStockSection = root.querySelector("[data-out-of-stock]");
  const quantityWrapper = root.querySelector("[data-quantity-wrapper]");

  // Update the urgency-block availability pill (متوفر / غير متوفر).
  const statusPill = root.querySelector("#product-stock-status");
  if (statusPill) {
    const available = !!selectedProduct.in_stock;
    statusPill.classList.toggle("product-stock-status--available", available);
    statusPill.classList.toggle("product-stock-status--unavailable", !available);
    const label = statusPill.querySelector(".product-stock-status-label");
    if (label) {
      const next = available ? statusPill.dataset.labelAvailable : statusPill.dataset.labelUnavailable;
      if (next) label.textContent = next;
    }
  }

  if (selectedProduct.in_stock) {
    // Show in-stock elements
    if (inStockSection) show("[data-in-stock]", root);
    if (outOfStockSection) hide("[data-out-of-stock]", root);

    // Update quantity selector
    updateQuantitySelector(selectedProduct, root);
    if (quantityWrapper) show("[data-quantity-wrapper]", root);
  } else {
    // Show out-of-stock elements
    if (inStockSection) hide("[data-in-stock]", root);
    if (outOfStockSection) show("[data-out-of-stock]", root);
    if (quantityWrapper) hide("[data-quantity-wrapper]", root);
  }
}

function updateQuantitySelector(selectedProduct, root = document) {
  const quantityEl = root.querySelector("#product-quantity");
  if (!quantityEl) return;

  let maxQuantity = selectedProduct.is_infinite ? 100 : selectedProduct.quantity;
  maxQuantity = Math.min(maxQuantity, 100);

  if (quantityEl.tagName === "SELECT") {
    // Rebuild select options
    let options = "";
    for (let i = 1; i <= maxQuantity; i++) {
      options += `<option value="${i}"${i === 1 ? " selected" : ""}>${i}</option>`;
    }
    quantityEl.innerHTML = options;
  } else if (quantityEl.tagName === "INPUT" && window.updateQtyMax) {
    // Delegate to qty-input.js
    window.updateQtyMax("product-quantity", maxQuantity);
  }
}

// ─────────────────────────────────────────────────────────────
// Gallery Updates
// ─────────────────────────────────────────────────────────────

/**
 * Update product gallery when variant changes
 * Rebuilds DOM and re-initializes EmblaCarousel
 */
export function updateProductImages(selectedProduct, root = document) {
  if (!selectedProduct) return;

  const media = selectedProduct.media || [];
  const galleryContainer = root.querySelector(
    `.product-gallery[data-gallery-id="${GALLERY_ID}"] .product-gallery__container`
  );
  const thumbsContainer = root.querySelector(
    `.product-gallery-thumbs[data-gallery-id="${GALLERY_ID}"] .product-gallery-thumbs__container`
  );
  const thumbsWrapper = root.querySelector(`.product-gallery-thumbs[data-gallery-id="${GALLERY_ID}"]`);
  const lightboxGallery = root.querySelector("#product-gallery-lightbox");

  if (!galleryContainer) return;

  // Destroy existing carousel instance. The gallery (re)init helpers work by
  // gallery id, which is duplicated when a quick-view is open — so only drive
  // them for the main page. The quick-view manages its own gallery lifecycle
  // via the `content:loaded` event.
  const isMainPage = root === document;
  if (isMainPage && typeof window.destroyProductGallery === "function") {
    window.destroyProductGallery(GALLERY_ID);
  }

  // Only rebuild on the main page. The gallery (re)init helpers are gallery-id
  // based, and that id is duplicated while a quick-view is open — so we can't
  // safely re-create the carousel for the modal. Rebuilding without re-init
  // would leave the modal strip static/non-swipeable, so we skip it entirely
  // and keep the modal's already-initialized gallery intact.
  if (isMainPage && media.length > 0) {
    // Build main gallery slides (with video support)
    galleryContainer.innerHTML = media
      .map((item, index) => {
        const isVideo = item.provider && item.link;
        const imgSrc = item.image?.medium || item.image?.full_size || "";

        if (isVideo) {
          return `
          <div class="product-gallery__slide relative min-w-0 flex-[0_0_calc(100%-8px)]">
            <img
              src="${imgSrc}"
              alt="${selectedProduct.name || ""} - Image ${index + 1}"
              class="aspect-square w-full rounded object-cover"
              ${index > 0 ? 'loading="lazy"' : ""}
            />
            <button
              type="button"
              class="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/20 transition-colors hover:bg-black/30"
              data-video-play
              data-video-src="${item.link}"
              aria-label="Play video"
            >
              <span class="bg-background/90 flex size-16 items-center justify-center rounded-full shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="text-foreground size-8 rtl:rotate-180">
                  <path d="M8 5.14v14l11-7-11-7z" />
                </svg>
              </span>
            </button>
            <div class="absolute inset-0 hidden rounded bg-black" data-video-container>
              <button
                type="button"
                class="bg-background/80 text-foreground absolute end-2 top-2 z-10 flex size-8 items-center justify-center rounded-full"
                data-video-close
                aria-label="Close video"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
              <iframe class="size-full rounded" src="" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
            </div>
          </div>
        `;
        }

        return `
        <div class="product-gallery__slide relative min-w-0 flex-[0_0_calc(100%-8px)]">
          <img
            src="${imgSrc}"
            alt="${selectedProduct.name || ""} - Image ${index + 1}"
            class="aspect-square w-full cursor-zoom-in rounded object-cover"
            data-lightbox-trigger="${index}"
            ${index > 0 ? 'loading="lazy"' : ""}
          />
        </div>
      `;
      })
      .join("");

    // Build hidden lightbox gallery for PhotoSwipe (images only, no videos)
    if (lightboxGallery) {
      lightboxGallery.innerHTML = media
        .filter((item) => !(item.provider && item.link)) // Exclude videos
        .map(
          (item, index) => `
          <a
            href="${item.image?.full_size || item.image?.medium || ""}"
            data-pswp-width="1600"
            data-pswp-height="2133"
          >
            <img
              src="${item.image?.thumbnail || item.image?.medium || ""}"
              alt="${selectedProduct.name || ""} - Image ${index + 1}"
            />
          </a>
        `
        )
        .join("");
    }

    // Build thumbnails (if more than 1 image, with video indicator)
    if (thumbsContainer) {
      if (media.length > 1) {
        thumbsContainer.innerHTML = media
          .map((item, index) => {
            const isVideo = item.provider && item.link;
            const thumbSrc = item.image?.thumbnail || item.image?.medium || "";

            return `
            <button
              class="product-gallery-thumbs__slide hover:border-[#eee] relative w-full overflow-hidden rounded border-1 border-transparent transition-colors"
              data-gallery-id="${GALLERY_ID}"
              type="button"
            >
              <img
                src="${thumbSrc}"
                alt="Thumbnail ${index + 1}"
                class="aspect-square w-full object-cover"
                loading="lazy"
              />
              ${
                isVideo
                  ? `<span class="bg-background/80 absolute inset-0 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="text-foreground size-6 rtl:rotate-180">
                    <path d="M8 5.14v14l11-7-11-7z" />
                  </svg>
                </span>`
                  : ""
              }
            </button>
          `;
          })
          .join("");

        if (thumbsWrapper) thumbsWrapper.classList.remove("hidden");
      } else {
        if (thumbsWrapper) thumbsWrapper.classList.add("hidden");
      }
    }

    // Re-initialize carousel after DOM update (main page only — see above).
    if (isMainPage) {
      requestAnimationFrame(() => {
        if (typeof window.initProductGallery === "function") {
          window.initProductGallery(GALLERY_ID);
        }
      });
    }
  }
}

// Expose for external use
window.updateProductImages = updateProductImages;

// ─────────────────────────────────────────────────────────────
// Main Callback (Called by platform's product.js)
// ─────────────────────────────────────────────────────────────

/**
 * Called by platform's product.js after variant selection changes.
 * @param {Object} selectedProduct - The selected variant data from API
 * @param {Element|Document} [root] - Scope to update. When omitted (e.g. the
 *   platform calls this directly) we fall back to the root recorded by the
 *   capture-phase listener, so quick-view changes update the modal, not the
 *   underlying page.
 */
window.productOptionsChanged = function (selectedProduct, root) {
  const scope = resolveRoot(root);

  if (!selectedProduct) {
    // Variant doesn't exist - show out of stock
    hide("[data-in-stock]", scope);
    show("[data-out-of-stock]", scope);
    hide("[data-quantity-wrapper]", scope);
    return;
  }

  // Update all UI sections
  updatePrice(selectedProduct, scope);
  updateProductInfo(selectedProduct, scope);
  updateStockStatus(selectedProduct, scope);
  updateProductImages(selectedProduct, scope);

  // Dispatch custom event for other scripts
  window.dispatchEvent(
    new CustomEvent("product:variant-changed", {
      detail: { selectedProduct, root: scope }
    })
  );
};

// ─────────────────────────────────────────────────────────────
// Option Click Handlers (provided to the platform's headless markup)
// ─────────────────────────────────────────────────────────────
//
// The vitrin v2 options markup renders each choice with
// `onclick="productOptionListItemClicked(event)"` (and selects with
// `onchange="productOptionSelectChanged(event)"`) but does NOT ship a
// definition for those globals — the headless model expects the theme to
// supply them. We resolve the selected variant from `window.productObj`
// (the full product + variants structure the platform injects on the page),
// so no extra network call is needed, then hand it to productOptionsChanged.

function normValue(v) {
  return v == null ? "" : String(v).replace(/\s+/g, " ").trim();
}

// Read the current selection from every option group as {index, name, value}.
// Handles both list (<li class="active">) and dropdown (<select>) styles.
function readSelectedOptions(root = document) {
  const container = root.querySelector("#product-variants-options");
  if (!container) return [];
  const out = [];
  container.querySelectorAll(".product-options__group").forEach((group) => {
    const index = Number(group.getAttribute("index"));
    const select = group.querySelector(".product-options__select");
    if (select) {
      out.push({ index, name: select.getAttribute("name") || "", value: normValue(select.value) });
      return;
    }
    const ul = group.querySelector(".product-options__list");
    const active = group.querySelector(".product-options__item.active");
    out.push({
      index,
      name: ul ? ul.getAttribute("name") || "" : "",
      value: active ? normValue(active.getAttribute("value")) : "",
    });
  });
  return out;
}

// Pull the display values off a variant's attribute array, tolerating the
// several field names Zid has used across product-object shapes.
function variantAttrValues(variant) {
  const arrays = [variant.attributes, variant.options, variant.variant_attributes, variant.selected_options];
  const vals = [];
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    for (const a of arr) {
      if (!a || typeof a !== "object") continue;
      const raw =
        a.value != null && typeof a.value === "object"
          ? a.value.name ?? a.value.value ?? a.value.text
          : a.value ?? a.text ?? a.option_value ?? a.name;
      const n = normValue(raw);
      if (n) vals.push(n);
    }
  }
  return vals;
}

// Find the variant whose attribute values match every chosen value.
function matchVariant(productObj, selected) {
  const variants = productObj.variants || productObj.products || productObj.children || [];
  const wanted = selected.map((s) => s.value).filter(Boolean);
  if (!Array.isArray(variants) || !wanted.length) return null;
  for (const v of variants) {
    const have = variantAttrValues(v);
    if (wanted.every((w) => have.includes(w))) return v;
  }
  return null;
}

function resolveAndApplySelection(root = document) {
  const productObj = productObjForRoot(root);
  if (!productObj) {
    console.warn("[variants] product data is missing — cannot resolve variant.");
    return;
  }
  const selected = readSelectedOptions(root);
  // Only act once every group has a selection.
  if (!selected.length || selected.some((s) => !s.value)) return;

  const variant = matchVariant(productObj, selected);
  if (variant) {
    productObj.selected_product = variant;
    window.productOptionsChanged(variant, root);
  } else {
    // A complete combination with no matching variant = unavailable.
    console.warn("[variants] no variant matched the selection", selected, productObj);
    window.productOptionsChanged(null, root);
  }
}

// Defer to the platform if it ever provides these globals; otherwise own them.
if (typeof window.productOptionListItemClicked !== "function") {
  window.productOptionListItemClicked = function (event) {
    const li =
      (event && event.currentTarget) ||
      (event && event.target && event.target.closest(".product-options__item"));
    if (!li) return;
    const ul = li.closest(".product-options__list");
    if (ul) {
      ul.querySelectorAll(".product-options__item").forEach((x) => x.classList.remove("active"));
      li.classList.add("active");
    }
    resolveAndApplySelection(rootOf(li));
  };
}

if (typeof window.productOptionSelectChanged !== "function") {
  window.productOptionSelectChanged = function (event) {
    const target = event && event.target;
    resolveAndApplySelection(rootOf(target));
  };
}

// ─────────────────────────────────────────────────────────────
// Quantity Sync with productObj
// ─────────────────────────────────────────────────────────────

function initProductObjSync() {
  // Update productObj.selected_quantity when quantity changes
  // Button handlers are managed by qty-input.js
  document.addEventListener("qty:change", (e) => {
    if (e.detail?.id === "product-quantity" && window.productObj?.selected_product) {
      window.productObj.selected_product.selected_quantity = Number(e.detail.value) || 1;
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────

// Track which root (modal vs main page) the user is interacting with, in the
// capture phase so it is set BEFORE any onclick/onchange handler runs — whether
// that's our fallback above or the platform's product.js. window.productOptionsChanged
// then defaults to this root when called without an explicit one.
function initVariantRootTracking() {
  const record = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".product-options__item, .product-options__select, #product-variants-options")) {
      currentVariantRoot = rootOf(target);
    }
  };
  document.addEventListener("click", record, true);
  document.addEventListener("change", record, true);
}

export function init() {
  // Capture the main page's product data before a quick-view can overwrite
  // window.productObj (quick-view points it at the previewed product).
  if (!mainProductObj) mainProductObj = window.productObj || null;
  initVariantRootTracking();
  initProductObjSync();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// When a quick-view injects the product markup, the price is whatever the
// server pre-rendered (the product's generic/default price) — which may not
// match the variant that's pre-selected in the modal. The platform only calls
// productOptionsChanged() on a *manual* variant change, so the wrong price
// lingered until the shopper changed an option. Resolve the initial selection
// once on open so the correct variant price shows immediately. No-op when the
// product has no options or no complete default selection.
// Ensure every option group has a selection inside the quick-view modal. On the
// full product page the platform's product.js auto-selects a default for each
// group; inside the injected quick-view markup nothing is selected, so the
// variant never resolves and the popup stays on the server's default state —
// which for option-products is the out-of-stock / "notify me" block, even when
// the product is actually in stock. Default to the first choice of each group so
// a variant resolves and the correct in-stock + price + Add-to-cart appear.
function ensureDefaultSelection(root) {
  const container = root.querySelector("#product-variants-options");
  if (!container) return;
  container.querySelectorAll(".product-options__group").forEach((group) => {
    const select = group.querySelector(".product-options__select");
    if (select) {
      if (!normValue(select.value)) {
        const opt = Array.from(select.options || []).find((o) => normValue(o.value));
        if (opt) select.value = opt.value;
      }
      return;
    }
    const ul = group.querySelector(".product-options__list");
    if (!ul) return;
    if (!ul.querySelector(".product-options__item.active")) {
      const first = ul.querySelector(".product-options__item");
      if (first) first.classList.add("active");
    }
  });
}

window.addEventListener("content:loaded", () => {
  const modal = document.getElementById(QUICK_VIEW_MODAL_ID);
  if (!modal) return;
  // Defer a frame so the moved header/CTA nodes (which hold the price element)
  // and window.productObj are in place before we resolve.
  requestAnimationFrame(() => {
    ensureDefaultSelection(modal);
    resolveAndApplySelection(modal);
  });
});
