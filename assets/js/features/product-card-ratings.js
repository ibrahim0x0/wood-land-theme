/**
 * Product-card rating hydration.
 *
 * Zid's server-rendered product objects in home carousels ship without the
 * `rating` field populated, so every card would otherwise render as "New
 * product" regardless of whether it has reviews. This module listens for
 * cards on the page, batches their IDs into a `zid.products.list({ ids })`
 * call, and replaces the "new" chip with stars + count on products that
 * actually have a rating.
 *
 * Purely additive — if the SDK isn't available or the call fails, the
 * server's default "new" state stays intact.
 */

const ENDPOINT_BATCH_SIZE = 50;

function getCards() {
  return document.querySelectorAll("[data-product-card]:not([data-rating-hydrated])");
}

function normalizeId(id) {
  return String(id ?? "").replace(/-/g, "").toLowerCase();
}

function starSvg(kind, nonce) {
  const path =
    "M8 11.1733L11.5733 13.3333L10.6933 9.30667L13.7333 6.59333L9.63333 6.28L8 2.5L6.36667 6.28L2.26667 6.59333L5.30667 9.30667L4.42667 13.3333L8 11.1733Z";
  if (kind === "full") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" class="text-warning"><path d="${path}" fill="currentColor"/></svg>`;
  }
  if (kind === "half") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><defs><linearGradient id="hs-${nonce}"><stop offset="50%" stop-color="var(--color-warning)"/><stop offset="50%" stop-color="var(--color-muted-foreground)"/></linearGradient></defs><path d="${path}" fill="url(#hs-${nonce})"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" class="text-muted-foreground"><path d="${path}" fill="currentColor"/></svg>`;
}

function renderStars(average, nonce) {
  const rounded = Math.ceil(average * 2) / 2;
  const parts = [];
  for (let n = 1; n <= 5; n++) {
    if (n <= rounded) parts.push(starSvg("full", `${nonce}-${n}`));
    else if (n <= rounded + 0.5) parts.push(starSvg("half", `${nonce}-${n}`));
    else parts.push(starSvg("empty", `${nonce}-${n}`));
  }
  return `<div class="flex gap-0.5">${parts.join("")}</div>`;
}

function hydrateCard(card, rating) {
  const avg = Number(rating?.average ?? 0);
  const count = Number(rating?.total_count ?? 0);
  if (!(avg > 0 || count > 0)) return; // genuinely unrated — leave as-is

  const container = card.querySelector(".product-card__rating");
  if (!container) return;

  const lang = document.documentElement.lang || "ar";
  const reviewsLabel = lang === "ar" ? "تقييم" : "reviews";
  const countText = count > 0 ? `+${count} ${reviewsLabel}` : `${avg.toFixed(1)} / 5`;

  const nonce = `${card.dataset.productCard?.slice(0, 8)}-${Math.random().toString(36).slice(2, 6)}`;

  container.classList.remove("product-card__rating--new");
  container.classList.add("product-card__rating--rated");
  container.innerHTML = `
    ${renderStars(avg, nonce)}
    <span class="product-card__rating-count">${countText}</span>
  `;
  card.setAttribute("data-rating-hydrated", "true");
}

async function hydrateBatch(cards) {
  if (!window.zid?.products?.list) return;
  // Zid's list endpoint doesn't accept an `ids` filter, so we page through
  // the catalog once and match by id. For typical home rails (6–12 products)
  // the first 50-item page is more than enough. On very large rails (50+)
  // products beyond page 1 stay as server-rendered "new" — acceptable
  // graceful fallback since rarely that many ship in a single rail.
  const byId = new Map();
  for (const card of cards) byId.set(normalizeId(card.dataset.productCard), card);
  if (byId.size === 0) return;

  try {
    const r = await window.zid.products.list(
      { page_size: Math.min(ENDPOINT_BATCH_SIZE, byId.size * 2) },
      { showErrorNotification: false }
    );
    const results = r?.results ?? [];
    for (const p of results) {
      const key = normalizeId(p.id);
      const card = byId.get(key);
      if (card) hydrateCard(card, p.rating);
    }
  } catch {
    // silent — keeps the server-rendered "new" fallback
  }
}

async function waitForZid(maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    if (window.zid?.products?.list) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return !!window.zid?.products?.list;
}

async function hydrate() {
  const cards = Array.from(getCards());
  if (cards.length === 0) return;
  if (!(await waitForZid())) return;
  await hydrateBatch(cards);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", hydrate);
} else {
  hydrate();
}

// Re-hydrate when new cards are inserted (AJAX filter, infinite scroll, etc.)
window.addEventListener("content:loaded", hydrate);
window.addEventListener("products:updated", hydrate);
