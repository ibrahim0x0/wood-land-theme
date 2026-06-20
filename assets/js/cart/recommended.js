/**
 * Shared helpers for the cart's "recommended products" carousel.
 *
 * Both the cart drawer and the cart page's recommended strip load the same
 * product data via the Zid SDK with the same strategy options. The rendering
 * differs (the drawer has a variant-menu popover, the strip does not) so
 * this module only owns the data-loading layer and small URL helpers.
 */

export function slugFromUrl(url) {
  try {
    const path = new URL(url, window.location.origin).pathname;
    const m = path.match(/\/(?:products|p)\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  } catch {
    return "";
  }
}

// The platform serves recommended products from a CDN host; rewrite to the
// current origin so preview and live environments both work.
export function rewriteUrl(url) {
  try {
    const u = new URL(url);
    u.hostname = window.location.hostname;
    u.protocol = window.location.protocol;
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Load recommended products via the Zid SDK according to the strategy.
 * @param {object} opts
 * @param {string} [opts.strategy] - "latest" | "best_sellers" | "featured" | "manual"
 * @param {number} [opts.count]
 * @param {string} [opts.manual] - newline-separated URLs/slugs/IDs
 * @param {string} [opts.category]
 */
export async function loadRecommendedProducts({ strategy = "latest", count = 8, manual = "", category = "" } = {}) {
  if (!window.zid?.products?.list) return [];

  let products = [];

  if (strategy === "manual" && manual.trim()) {
    const lines = manual.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const resolve = async (line) => {
      const slug = line.includes("/") ? slugFromUrl(line) : "";
      const idOrSlug = slug || (line.includes(" ") ? "" : line);
      if (idOrSlug) {
        try {
          const r = await window.zid.products.get(idOrSlug, { showErrorNotification: false });
          const p = r?.product ?? r;
          if (p?.id) return p;
        } catch {}
      }
      try {
        const r = await window.zid.products.list({ q: line, page_size: 1 }, { showErrorNotification: false });
        const first = r?.results?.[0];
        if (first?.id) return first;
      } catch {}
      return null;
    };
    const results = await Promise.all(lines.slice(0, count).map(resolve));
    products = results.filter(Boolean);
  } else {
    const params = {
      page_size: count,
      sort_by:
        strategy === "best_sellers"
          ? "popularity_order"
          : strategy === "featured"
            ? "display_order"
            : "created_at",
      order: "desc"
    };
    if (category) params.categories = category;
    if (strategy === "featured") params.on_sale = true;
    const r = await window.zid.products.list(params, { showErrorNotification: false });
    products = r?.results ?? [];
  }

  // Drop products the customer can't buy. We treat `in_stock === false`
  // as authoritative; if that field is missing, fall back to the
  // finite-stock + quantity check. The view-button fallback inside
  // `renderRecommended` still catches anything that slips through
  // (e.g. stock that drops to 0 between this fetch and a later render).
  const inStock = products.filter((p) => {
    if (p?.in_stock === false) return false;
    if (p?.is_infinite === false && Number(p?.quantity ?? 0) <= 0) return false;
    return true;
  });

  return inStock.slice(0, count);
}
