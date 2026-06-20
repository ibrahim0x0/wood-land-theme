/**
 * Cart Quantity Module
 *
 * Handles quantity input event listeners for cart page.
 * Integrates with qty-input.js component events.
 */

import { cartErrorToast } from "./toast.js";

/**
 * Setup quantity input handlers for cart page
 * Listens for qty:change and qty:remove events from quantity-input component
 * @param {Function} onQuantityChange - Callback when quantity changes
 * @param {Function} onProductRemove - Callback when product should be removed
 */
export function setupQuantityInputHandlers(onQuantityChange, onProductRemove) {
  // Listen for qty:change events from quantity inputs with cart context
  document.addEventListener("qty:change", (e) => {
    const wrapper = e.target.closest("[data-qty-input]");
    if (!wrapper) return;

    // Only handle if this is a cart quantity input (has cart-product-id)
    const cartProductId = wrapper.dataset.cartProductId;
    const productId = wrapper.dataset.productId;
    if (!cartProductId) return;

    const newQty = e.detail.value;

    if (onQuantityChange) {
      onQuantityChange(cartProductId, productId, newQty);
    } else {
      handleCartQuantityChange(cartProductId, productId, newQty);
    }
  });

  // Listen for qty:remove events (delete button clicked at qty=1)
  document.addEventListener("qty:remove", (e) => {
    const wrapper = e.target.closest("[data-qty-input]");
    if (!wrapper) return;

    const cartProductId = wrapper.dataset.cartProductId;
    const productId = wrapper.dataset.productId;
    if (!cartProductId) return;

    if (onProductRemove) {
      onProductRemove(cartProductId, productId);
    } else {
      handleCartProductRemove(cartProductId, productId);
    }
  });
}

/**
 * Handle cart quantity change
 * @param {string} cartProductId - Cart product ID
 * @param {string} productId - Product ID
 * @param {number} quantity - New quantity
 * @param {Function} onSuccess - Optional callback after success
 */
export function handleCartQuantityChange(cartProductId, productId, quantity, onSuccess) {
  // Dispatch loading event
  window.dispatchEvent(
    new CustomEvent("zidcart:loading", {
      detail: { cartProductId, productId, operation: "update", quantity }
    })
  );

  // Use Zid SDK directly for cart updates
  window.zid.cart
    .updateProduct({ product_id: cartProductId, quantity }, { showErrorNotification: false })
    .then(() => {
      if (onSuccess) onSuccess();
    })
    .catch((error) => {
      cartErrorToast(error, "Error updating cart quantity");
      window.dispatchEvent(
        new CustomEvent("zidcart:error", {
          detail: { cartProductId, productId, operation: "update", error: error.message || error }
        })
      );
    });
}

/**
 * Handle cart product remove
 * @param {string} cartProductId - Cart product ID
 * @param {string} productId - Product ID
 * @param {Function} onSuccess - Optional callback after success
 */
export function handleCartProductRemove(cartProductId, productId, onSuccess) {
  // Dispatch loading event
  window.dispatchEvent(
    new CustomEvent("zidcart:loading", {
      detail: { cartProductId, productId, operation: "remove" }
    })
  );

  // Use Zid SDK directly for cart removal
  window.zid.cart
    .removeProduct({ product_id: cartProductId }, { showErrorNotification: false })
    .then(() => {
      if (onSuccess) onSuccess();
    })
    .catch((error) => {
      cartErrorToast(error, "Error removing product");
      window.dispatchEvent(
        new CustomEvent("zidcart:error", {
          detail: { cartProductId, productId, operation: "remove", error: error.message || error }
        })
      );
    });
}

/**
 * Update cart product quantity (legacy - for data-action="quantity" buttons)
 * @param {string} cartProductId - Cart product ID
 * @param {string} productId - Product ID
 * @param {number} delta - Quantity change (+1 or -1)
 * @param {Function} onSuccess - Callback after success
 */
export async function updateQuantity(cartProductId, productId, delta, onSuccess) {
  const valueEl = document.querySelector('[data-quantity-value="' + cartProductId + '"]');
  const valueMobileEl = document.querySelector('[data-quantity-value-mobile="' + cartProductId + '"]');

  if (!valueEl) return;

  const currentQty = parseInt(valueEl.textContent, 10) || 1;
  const newQty = Math.max(0, currentQty + delta);

  // Update display immediately for better UX
  if (valueEl) valueEl.textContent = newQty;
  if (valueMobileEl) valueMobileEl.textContent = newQty;

  try {
    if (newQty === 0) {
      // Remove product from cart
      await window.zid.cart.removeProduct({ product_id: cartProductId }, { showErrorNotification: false });
    } else {
      // Update quantity
      await window.zid.cart.updateProduct(
        { product_id: cartProductId, quantity: newQty },
        { showErrorNotification: false }
      );
    }

    if (onSuccess) onSuccess();
  } catch (error) {
    cartErrorToast(error, "Error updating cart");
    // Revert the display on error
    if (valueEl) valueEl.textContent = currentQty;
    if (valueMobileEl) valueMobileEl.textContent = currentQty;
  }
}
