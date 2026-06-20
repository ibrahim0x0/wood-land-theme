/**
 * Cart-wide error toast helper.
 *
 * The Zid SDK accepts a `showErrorNotification` option that renders its own
 * toast on failure. The cart drawer instead shows a custom `window.showToast`
 * so the z-index and styling match the drawer UI — this module lets the rest
 * of the cart modules share that behavior so error UX is consistent across
 * cart-drawer.jinja, the cart page, and product-card interactions.
 */

function deepFindMessage(obj, depth = 0) {
  if (!obj || depth > 5) return null;
  if (typeof obj === "string") {
    const s = obj.trim();
    if (s && !/^request failed|status code \d/i.test(s)) return s;
    return null;
  }
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const r = deepFindMessage(v, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof obj === "object") {
    for (const k of ["message", "error", "detail", "description", "title"]) {
      const r = deepFindMessage(obj[k], depth + 1);
      if (r) return r;
    }
    for (const v of Object.values(obj)) {
      const r = deepFindMessage(v, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

export function cartErrorMessage(err) {
  const raw = deepFindMessage(err?.responseData ?? err?.response?.data ?? err?.data ?? err);
  if (!raw) return null;
  return raw.replace(/\s+/g, " ").trim();
}

export function cartErrorToast(err, fallback) {
  const title = cartErrorMessage(err) || fallback || "";
  if (typeof window !== "undefined" && typeof window.showToast === "function" && title) {
    window.showToast({ title, variant: "remove" });
    return;
  }
  if (title) console.error("[Cart]", title, err);
  else console.error("[Cart]", err);
}
