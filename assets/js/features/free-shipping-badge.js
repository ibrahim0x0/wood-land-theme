/**
 * Free-shipping badge
 *
 * A product card has no numeric price server-side (only formatted strings) and
 * no access to the store's shipping rule, so the badge is rendered hidden and
 * revealed here when the product's own price meets the free-shipping minimum.
 *
 * Threshold source (in priority order):
 *   1. The CURRENT cart's free-shipping rule — `window.zid.cart.get()` returns
 *      the cart for the active session/region, so `free_shipping_rule
 *      .subtotal_condition.min` is already in the right currency + threshold for
 *      whoever is viewing. This is what makes it correct for multi-region.
 *   2. The manual per-theme setting (data-fs-threshold) as a fallback when the
 *      cart doesn't expose a rule.
 */

// Region-aware threshold read from the cart (null until/unless found).
let ruleThreshold = null;

// Pull a number out of a formatted price like "1,250.000 د.ك" / "75.00 ر.س".
// Keeps digits + separators, treats "," as a thousands separator (SAR/KWD/AED
// all use "." for decimals), drops the currency symbol/letters/spaces.
function parsePrice(str) {
  if (!str) return NaN;
  const cleaned = String(str).replace(/[^\d.,]/g, "").replace(/,/g, "");
  return cleaned ? parseFloat(cleaned) : NaN;
}

function thresholdFor(badge) {
  if (ruleThreshold != null && ruleThreshold > 0) return ruleThreshold;
  return parseFloat(badge.dataset.fsThreshold || "0");
}

function evaluate(badge) {
  const threshold = thresholdFor(badge);
  const price = parsePrice(badge.dataset.fsPrice);
  const qualifies =
    threshold > 0 && Number.isFinite(price) && price >= threshold;
  badge.classList.toggle("hidden", !qualifies);
}

export function init(root = document) {
  (root || document)
    .querySelectorAll("[data-free-shipping-badge]")
    .forEach(evaluate);
}

// Read the free-shipping minimum from the current (region-aware) cart.
async function readCartThreshold() {
  if (typeof window.zid?.cart?.get !== "function") return undefined; // SDK not ready
  try {
    const res = await window.zid.cart.get();
    const cart = res?.cart ?? res?.data?.cart ?? res?.data ?? res;
    const rule = cart?.free_shipping_rule;
    const min = Number(rule?.subtotal_condition?.min ?? rule?.min ?? NaN);
    return Number.isFinite(min) && min > 0 ? min : null;
  } catch {
    return null;
  }
}

function syncRuleThreshold(attempt = 0) {
  readCartThreshold().then((min) => {
    if (min === undefined) {
      // SDK not ready yet — retry a few times while it loads.
      if (attempt < 10) setTimeout(() => syncRuleThreshold(attempt + 1), 500);
      return;
    }
    if (min && min !== ruleThreshold) {
      ruleThreshold = min;
      init();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    init();
    syncRuleThreshold();
  });
} else {
  init();
  syncRuleThreshold();
}

// Re-read the rule when the cart changes (the threshold/region can update), and
// re-evaluate when new cards are injected (AJAX filter, load-more, quick-view).
window.addEventListener("cart:updated", () => syncRuleThreshold());
window.addEventListener("content:loaded", () => init());
window.addEventListener("products:updated", () => init());
window.addEventListener("products-updated", () => init());

export default init;
