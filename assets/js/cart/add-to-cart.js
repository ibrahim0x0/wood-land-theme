/**
 * Add to Cart Module
 *
 * Handles add-to-cart functionality for:
 * - Product cards (simple add with data-add-to-cart)
 * - Product page forms (data-add-to-cart-form)
 * - Variant add (data-add-variant-to-cart)
 * - Buy now (data-buy-now-form)
 *
 * Events:
 * - cart:updated - dispatched after cart changes
 */

import { showSpinner, hideSpinner } from "../utils/loading.js";
import { dispatch } from "../utils/events.js";
import { refreshBadge } from "./badge.js";
import { cartErrorToast } from "./toast.js";

// Track initialized buttons
const initialized = new WeakSet();

/**
 * Wait for Zid SDK to be available
 */
async function waitForZid(maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    if (window.zid) return true;
    await new Promise((r) => setTimeout(r, 100 * Math.min(i + 1, 10)));
  }
  console.error("[Cart] Zid SDK not available");
  return false;
}

/**
 * Simple add to cart (product cards without options)
 */
async function addToCart(btn) {
  const productId = btn.dataset.addToCart;
  if (!productId || btn.disabled) return;

  // Read the inline qty stepper sitting next to this button (if the card
  // has one). Cards without a stepper — e.g. cards in product-only sections
  // that don't include the new layout — fall back to qty=1.
  const card = btn.closest("[data-product-card]");
  const qtyInput = card?.querySelector("[data-quantity-section] [data-qty-value]");
  const quantity = qtyInput ? Math.max(1, parseInt(qtyInput.value, 10) || 1) : 1;

  showSpinner(btn);

  try {
    await window.zid.cart.addProduct({ product_id: productId, quantity }, { showErrorNotification: false });

    dispatch("cart:updated", { productId, action: "add", quantity });
    refreshBadge();

    // Reset the stepper to 1 + restore the base label. Dispatching `input`
    // makes qty-input.js fire `qty:change`, which our label-sync listener
    // (initQtyAddLabelSync) picks up to drop the "(N)" suffix.
    if (qtyInput) {
      qtyInput.value = 1;
      qtyInput.dispatchEvent(new Event("input", { bubbles: true }));
      if (window.initQtyInputs) window.initQtyInputs();
    }
  } catch (err) {
    cartErrorToast(err, "Add to cart failed");
  } finally {
    hideSpinner(btn);
  }
}

/**
 * Wire each product-card qty stepper to update its Add button label.
 * When qty > 1 the label becomes `<base> (<qty>)` so the merchant can
 * see exactly how many will be committed before tapping Add.
 *
 * Idempotent — uses the shared `initialized` WeakSet so re-running on
 * `content:loaded` doesn't double-bind.
 */
function initQtyAddLabelSync() {
  document.querySelectorAll(".product-card__qty-add").forEach((row) => {
    if (initialized.has(row)) return;

    const wrapper = row.querySelector("[data-qty-input]");
    const label = row.querySelector("[data-add-label]");
    if (!wrapper || !label) return;

    initialized.add(row);

    // Capture the base label once. Subsequent updates compose against it
    // so we don't accumulate "(2) (3) (4)" suffixes across renders.
    const baseLabel = label.dataset.baseLabel || label.textContent.trim();
    label.dataset.baseLabel = baseLabel;

    wrapper.addEventListener("qty:change", (e) => {
      const qty = e.detail?.value ?? 1;
      label.textContent = qty > 1 ? `${baseLabel} (${qty})` : baseLabel;
    });
  });
}

/**
 * Form-based add to cart (product page with variants/custom fields)
 * Supports bundle products via window.bundleCartPayload
 */
async function addToCartFromForm(btn) {
  const formId = btn.dataset.addToCartForm;
  if (!formId || btn.disabled) return;

  const originalContent = btn.innerHTML;
  showSpinner(btn, { replaceContent: true });

  try {
    // Check for bundle payload (set by vitrin:bundle-selections:updated event)
    const bundlePayload = window.bundleCartPayload;
    const addProductOptions = bundlePayload ? { ...bundlePayload, form_id: formId } : { form_id: formId };

    await window.zid.cart.addProduct(addProductOptions, { showErrorNotification: false });

    // Show success feedback
    const successIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    const successText = btn.dataset.successText || "Added!";
    btn.innerHTML = `${successIcon} ${successText}`;

    dispatch("cart:updated", { formId, action: "add" });
    refreshBadge();

    setTimeout(() => {
      btn.innerHTML = originalContent;
      btn.disabled = false;
    }, 1500);
  } catch (err) {
    cartErrorToast(err, "Add to cart failed");
    btn.innerHTML = originalContent;
    btn.disabled = false;
  }
}

/**
 * Buy now - adds to cart and triggers checkout
 * Supports bundle products via window.bundleCartPayload
 */
async function buyNowFromForm(btn) {
  const formId = btn.dataset.buyNowForm;
  if (!formId || btn.disabled) return;

  showSpinner(btn, { replaceContent: true });

  try {
    // Check for bundle payload (set by vitrin:bundle-selections:updated event)
    const bundlePayload = window.bundleCartPayload;
    const buyNowOptions = bundlePayload ? { ...bundlePayload, form_id: formId } : { form_id: formId };

    await window.zid.cart.buyNow(buyNowOptions, { showErrorNotification: false });
    // buyNow handles redirect
  } catch (err) {
    cartErrorToast(err, "Buy now failed");
    hideSpinner(btn);
  }
}

/**
 * Add variant to cart (product page variant list)
 */
async function addVariantToCart(btn) {
  const variantId = btn.dataset.addVariantToCart;
  if (!variantId || btn.disabled) return;

  const originalContent = btn.innerHTML;
  showSpinner(btn, { replaceContent: true });

  try {
    await window.zid.cart.addProduct({ product_id: variantId, quantity: 1 }, { showErrorNotification: false });

    // Show success feedback
    const successIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    const successText = btn.dataset.successText || "Added!";
    btn.innerHTML = `${successIcon} ${successText}`;

    dispatch("cart:updated", { variantId, action: "add" });
    refreshBadge();

    setTimeout(() => {
      btn.innerHTML = originalContent;
      btn.disabled = false;
    }, 1500);
  } catch (err) {
    cartErrorToast(err, "Add variant to cart failed");
    btn.innerHTML = originalContent;
    btn.disabled = false;
  }
}

/**
 * Open quick view modal for products with options
 */
function openQuickView(btn) {
  const card = btn.closest("[data-product-card]");
  const link = card?.querySelector("a[href]");
  const productUrl = link?.getAttribute("href");

  if (!productUrl) {
    console.error("[Cart] Quick view: Could not find product URL");
    return;
  }

  const slug = productUrl.split("/p/")[1]?.split("?")[0] || "";

  if (window.quickViewManager) {
    // Pass the trigger button as the anchor so the popover (option #6
    // compact floating card) knows where to position itself.
    window.quickViewManager.open(slug, productUrl, btn);
  } else {
    window.location.href = productUrl;
  }
}

/**
 * Initialize all cart buttons
 */
export function initButtons() {
  // Simple add to cart buttons
  document.querySelectorAll("[data-add-to-cart]").forEach((btn) => {
    if (initialized.has(btn)) return;
    initialized.add(btn);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      addToCart(btn);
    });
  });

  // Quick view buttons
  document.querySelectorAll("[data-open-quick-view]").forEach((btn) => {
    if (initialized.has(btn)) return;
    initialized.add(btn);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openQuickView(btn);
    });
  });

  // Form-based add to cart
  document.querySelectorAll("[data-add-to-cart-form]").forEach((btn) => {
    if (initialized.has(btn)) return;
    initialized.add(btn);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      addToCartFromForm(btn);
    });
  });

  // Buy now buttons
  document.querySelectorAll("[data-buy-now-form]").forEach((btn) => {
    if (initialized.has(btn)) return;
    initialized.add(btn);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      buyNowFromForm(btn);
    });
  });

  // Variant add to cart
  document.querySelectorAll("[data-add-variant-to-cart]").forEach((btn) => {
    if (initialized.has(btn)) return;
    initialized.add(btn);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      addVariantToCart(btn);
    });
  });

  // Sync each card's qty stepper to its Add button label so the merchant
  // sees "إضافة (3)" when qty > 1. Cart-page quantity inputs (which carry
  // `data-cart-product-id`) are handled by cart/quantity.js, separate
  // from this row.
  initQtyAddLabelSync();
}

/**
 * Sync cart state with UI on load.
 * The product-card stepper is a local "how much to add" picker — it isn't
 * bound to the cart, so there's no UI sync needed on initial load. Kept
 * as a no-op so existing call sites don't break.
 * @param {Object} _cart - Cart data (unused)
 */
async function syncCartState(_cart) {
  return;
}

/**
 * Initialize bundle selection listener
 * Handles dynamic bundle products from vitrin:products/bundle-products.jinja
 */
function initBundleSelectionListener() {
  window.addEventListener("vitrin:bundle-selections:updated", (event) => {
    const cartData = event?.detail?.data;
    const bundlePayload = cartData?.cartPayload;
    const isValid = cartData?.isSelectionsValid;

    // Store bundle payload globally for add-to-cart
    window.bundleCartPayload = bundlePayload;

    // Enable/disable add-to-cart buttons based on bundle validity
    const addToCartBtns = document.querySelectorAll("[data-add-to-cart-form]");
    const buyNowBtns = document.querySelectorAll("[data-buy-now-form]");

    addToCartBtns.forEach((btn) => {
      btn.disabled = !isValid;
      if (!isValid) {
        btn.classList.add("opacity-50", "cursor-not-allowed");
      } else {
        btn.classList.remove("opacity-50", "cursor-not-allowed");
      }
    });

    buyNowBtns.forEach((btn) => {
      btn.disabled = !isValid;
      if (!isValid) {
        btn.classList.add("opacity-50", "cursor-not-allowed");
      } else {
        btn.classList.remove("opacity-50", "cursor-not-allowed");
      }
    });
  });
}

/**
 * Initialize cart module
 */
export async function initCart() {
  const ready = await waitForZid();
  if (!ready) return;

  initButtons();
  initBundleSelectionListener();

  // Fetch cart once and share with both functions to avoid duplicate API calls
  try {
    const cart = await window.zid.cart.get();
    refreshBadge(cart);
    syncCartState(cart);
  } catch (err) {
    console.error("[Cart] Init cart failed:", err);
  }
}
