/**
 * Cart Badge Module
 *
 * Updates cart count badge in header/nav and pulses it when an item is added.
 */

/**
 * Play a one-shot pulse animation on all badges (on add to cart).
 */
function pulseBadges() {
  document.querySelectorAll("[data-cart-badge]").forEach((el) => {
    // Retrigger by removing+reading layout before re-adding the class.
    el.classList.remove("is-pulsing");
    // eslint-disable-next-line no-unused-expressions
    void el.offsetWidth;
    el.classList.add("is-pulsing");
  });
}

/**
 * Update all cart badges on the page
 * @param {Object} cart - Optional cart data (if not provided, will fetch)
 */
export async function refreshBadge(cart) {
  try {
    if (!window.zid) return;

    // Use provided cart data or fetch if not provided
    const cartData = cart || (await window.zid.cart.get());
    const count = cartData?.cart_items_quantity ?? cartData?.products_count ?? 0;

    document.querySelectorAll("[data-cart-badge]").forEach((el) => {
      el.textContent = count;
      el.hidden = count === 0;
    });
  } catch (err) {
    console.error("[Cart] Refresh badge failed:", err);
  }
}

// Pulse on add-to-cart — gives visual confirmation that the click landed even
// when the cart drawer isn't auto-opening.
if (typeof window !== "undefined") {
  window.addEventListener("cart:updated", (e) => {
    if (e.detail?.action === "add") pulseBadges();
  });
}
