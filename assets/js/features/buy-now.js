/**
 * Buy Now Module
 *
 * Wires up the Buy Now button on the product page using Zid's
 * documented `window.zid.cart.buyNow(...)` API. See:
 *   https://docs.zid.dev/themes-developer-guide/features/checkout-as-a-popup
 *
 * The platform include `vitrin:checkout/checkout_dialog.jinja`
 * (rendered by `components/products/checkout-dialog-init.jinja`)
 * loads the SDK, initializes the `checkout_dialog` Kit Component,
 * and exposes `window.zid.cart.buyNow({ form_id }, opts)` plus
 * `window.checkout_dialog = { open, close }`.
 *
 * This module just defines `window.zidProductBuyNow` per the docs.
 * The button calls it via inline `onclick="zidProductBuyNow()"`.
 */

window.zidProductBuyNow = async () => {
  const buyNowLoading = (isLoading) => {
    const button = document.querySelector(".product-buy-now-btn");
    const loader = document.querySelector(".buy-now-progress");
    const icon = document.querySelector(".buy-now-icon");

    if (button) {
      button.disabled = isLoading;
      if (isLoading) button.setAttribute("aria-busy", "true");
      else button.removeAttribute("aria-busy");
    }
    if (loader) loader.classList.toggle("d-none", !isLoading);
    if (icon) icon.classList.toggle("d-none", isLoading);
  };

  try {
    buyNowLoading(true);

    await window.zid.cart.buyNow(
      { form_id: "product-form" },
      { showErrorNotification: true }
    );

    buyNowLoading(false);
  } catch (error) {
    // Vitrin shows its own error notification via `showErrorNotification: true`.
    console.error(error);
  }

  buyNowLoading(false);
};
