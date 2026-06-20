/**
 * Search Module
 *
 * Live-search dialog with vertical results list, recent-search memory
 * (localStorage), and keyboard navigation (↑/↓/Enter/Escape).
 */

const RECENT_KEY = "zid-theme:recent-searches";
const RECENT_MAX = 5;

class SearchManager {
  constructor() {
    this.dialog = null;
    this.input = null;
    this.clearBtn = null;
    this.kbdHint = null;
    this.resultsContainer = null;
    this.productsContainer = null;
    this.loadingContainer = null;
    this.emptyContainer = null;
    this.emptyQuery = null;
    this.idleContainer = null;
    this.recentSection = null;
    this.recentContainer = null;
    this.clearRecentBtn = null;
    this.searchAllLink = null;
    this.searchAllText = null;

    this.debounceTimeout = null;
    this.debounceDelay = 250;
    this.minQueryLength = 2;
    this.maxResults = 8;

    this.currentProducts = [];
    this.activeIndex = -1;
  }

  init() {
    this.dialog = document.getElementById("search-dialog-wrapper");
    this.input = document.querySelector("[data-search-input]");
    this.clearBtn = document.querySelector("[data-search-clear]");
    this.kbdHint = document.querySelector("[data-search-kbd]");
    this.resultsContainer = document.querySelector("[data-search-results]");
    this.productsContainer = document.querySelector("[data-search-products]");
    this.loadingContainer = document.querySelector("[data-search-loading]");
    this.emptyContainer = document.querySelector("[data-search-empty]");
    this.emptyQuery = document.querySelector("[data-search-empty-query]");
    this.idleContainer = document.querySelector("[data-search-idle]");
    this.recentSection = document.querySelector("[data-search-recent-section]");
    this.recentContainer = document.querySelector("[data-search-recent]");
    this.clearRecentBtn = document.querySelector("[data-search-clear-recent]");
    this.searchAllLink = document.querySelector("[data-search-all-link]");
    this.searchAllText = document.querySelector("[data-search-all-text]");

    if (!this.input) return;

    this.renderRecent();
    this.bindEvents();
  }

  bindEvents() {
    this.input.addEventListener("input", () => this.handleInput());

    this.clearBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.clearInput();
      this.input.focus();
    });

    this.clearRecentBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.clearRecent();
    });

    this.input.addEventListener("keydown", (e) => this.handleKeydown(e));

    // Recent / quick-chip clicks — set the input and trigger a search.
    this.recentContainer?.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-recent-query]");
      if (!chip) return;
      e.preventDefault();
      const q = chip.dataset.recentQuery;
      this.input.value = q;
      this.input.focus();
      this.handleInput();
    });

    if (this.dialog) {
      this.dialog.addEventListener("open", () => {
        requestAnimationFrame(() => this.input.focus());
        this.renderRecent();
        this.showIdle();
      });
      this.dialog.addEventListener("close", () => {
        this.clearInput();
        this.hideAllStates();
        this.showIdle();
      });
    }
  }

  handleInput() {
    const query = this.input.value.trim();

    if (this.clearBtn) this.clearBtn.classList.toggle("hidden", query.length === 0);
    if (this.kbdHint) this.kbdHint.classList.toggle("hidden", query.length > 0);

    this.updateSearchAllLink(query);

    clearTimeout(this.debounceTimeout);

    if (query.length < this.minQueryLength) {
      this.hideAllStates();
      this.showIdle();
      return;
    }

    this.debounceTimeout = setTimeout(() => this.search(query), this.debounceDelay);
  }

  handleKeydown(e) {
    const query = this.input.value.trim();

    if (e.key === "Enter") {
      e.preventDefault();
      // If a result is highlighted, navigate there; otherwise fall back to
      // the full results page for the query.
      if (this.activeIndex >= 0 && this.currentProducts[this.activeIndex]) {
        this.rememberQuery(query);
        window.location.href = this.currentProducts[this.activeIndex].url;
        return;
      }
      if (query.length >= this.minQueryLength) {
        this.rememberQuery(query);
        this.navigateToSearch(query);
      }
      return;
    }

    if (!this.currentProducts.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.setActive(Math.min(this.activeIndex + 1, this.currentProducts.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.setActive(Math.max(this.activeIndex - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      this.setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      this.setActive(this.currentProducts.length - 1);
    }
  }

  setActive(index) {
    this.activeIndex = index;
    const rows = this.productsContainer?.querySelectorAll("[data-search-row]") ?? [];
    rows.forEach((r, i) => r.classList.toggle("is-active", i === index));
    rows[index]?.scrollIntoView({ block: "nearest" });
  }

  async search(query) {
    this.showLoading();
    try {
      const response = await window.zid.products.list(
        { page_size: this.maxResults, q: query },
        { showErrorNotification: false }
      );
      const results = response?.results ?? [];
      if (results.length === 0) {
        this.showEmpty(query);
        return;
      }
      const products = results.map((p) => ({
        id: p.id,
        url: p.html_url,
        image: p.main_image?.image?.small || p.images?.[0]?.image?.small || null,
        name: p.name,
        price: p.formatted_price || "",
        salePrice: p.formatted_sale_price || null,
        hasOptions: p.has_options || false,
        badge: this.pickBadge(p)
      }));
      this.showResults(products);
    } catch {
      this.showEmpty(query);
    }
  }

  pickBadge(product) {
    const lang = document.documentElement.lang || "ar";
    if (product.sale_price && product.sale_price < product.price) {
      return { label: lang === "ar" ? "تخفيض" : "SALE", variant: "sale" };
    }
    if (
      product.in_stock === false ||
      (product.is_infinite === false && product.quantity !== null && product.quantity <= 0)
    ) {
      return { label: lang === "ar" ? "نفذ" : "OUT", variant: "out" };
    }
    if (product.badge?.body) {
      const text = product.badge.body[lang] || product.badge.body.ar || product.badge.body.en || "";
      if (text) return { label: text, variant: "custom" };
    }
    return null;
  }

  showResults(products) {
    this.hideAllStates();
    this.currentProducts = products;
    this.activeIndex = -1;

    const html = products
      .map((p, i) => `
        <li data-search-row data-index="${i}" role="option">
          <a href="${this.esc(p.url)}" class="search-dialog__row">
            <div class="search-dialog__thumb">
              ${p.image ? `<img src="${this.esc(p.image)}" alt="" loading="lazy"/>` : ""}
            </div>
            <div class="search-dialog__row-body">
              <h3 class="search-dialog__row-title">${this.esc(p.name)}</h3>
              ${this.renderPrice(p)}
            </div>
            ${p.badge ? `<span class="search-dialog__badge search-dialog__badge--${this.esc(p.badge.variant)}">${this.esc(p.badge.label)}</span>` : ""}
            <svg class="search-dialog__row-chev rtl:rotate-180" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
          </a>
        </li>
      `)
      .join("");

    if (this.productsContainer) this.productsContainer.innerHTML = html;
    this.resultsContainer?.classList.remove("hidden");
    // Remember the query only when the user actually opens a result from it.
    this.productsContainer?.addEventListener("click", this.rememberOnClick, { once: true });
  }

  rememberOnClick = () => {
    const q = this.input.value.trim();
    if (q) this.rememberQuery(q);
  };

  renderPrice(p) {
    if (p.salePrice) {
      return `
        <div class="search-dialog__price">
          <span class="search-dialog__price-sale">${this.esc(p.salePrice)}</span>
          <span class="search-dialog__price-orig">${this.esc(p.price)}</span>
        </div>`;
    }
    return `<div class="search-dialog__price"><span>${this.esc(p.price)}</span></div>`;
  }

  showLoading() {
    this.hideAllStates();
    this.loadingContainer?.classList.remove("hidden");
  }

  showEmpty(query) {
    this.hideAllStates();
    if (this.emptyQuery) this.emptyQuery.textContent = query ? `"${query}"` : "";
    this.emptyContainer?.classList.remove("hidden");
  }

  showIdle() {
    this.idleContainer?.classList.remove("hidden");
  }

  hideAllStates() {
    this.currentProducts = [];
    this.activeIndex = -1;
    this.resultsContainer?.classList.add("hidden");
    this.loadingContainer?.classList.add("hidden");
    this.emptyContainer?.classList.add("hidden");
    this.idleContainer?.classList.add("hidden");
  }

  updateSearchAllLink(query) {
    if (!this.searchAllLink || !this.searchAllText) return;

    if (!query) {
      this.searchAllLink.classList.add("hidden");
      return;
    }
    this.searchAllLink.classList.remove("hidden");

    const base = this.searchAllText.textContent.split("'")[0];
    this.searchAllText.textContent = `${base}'${query}'`;

    const url = new URL(window.location.origin + "/products");
    url.searchParams.set("q", query);
    this.searchAllLink.setAttribute("href", url.toString());
  }

  navigateToSearch(query) {
    const url = new URL(window.location.origin + "/products");
    url.searchParams.set("q", query);
    window.location.href = url.toString();
  }

  clearInput() {
    this.input.value = "";
    this.clearBtn?.classList.add("hidden");
    this.kbdHint?.classList.remove("hidden");
    this.updateSearchAllLink("");
  }

  // ── Recent searches ──────────────────────────────────────────────
  readRecent() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((s) => typeof s === "string") : [];
    } catch {
      return [];
    }
  }

  writeRecent(list) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch {}
  }

  rememberQuery(q) {
    if (!q || q.length < this.minQueryLength) return;
    const list = this.readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase());
    list.unshift(q);
    this.writeRecent(list.slice(0, RECENT_MAX));
  }

  clearRecent() {
    try { localStorage.removeItem(RECENT_KEY); } catch {}
    this.renderRecent();
  }

  renderRecent() {
    if (!this.recentContainer || !this.recentSection) return;
    const list = this.readRecent();
    if (list.length === 0) {
      this.recentSection.classList.add("hidden");
      this.recentContainer.innerHTML = "";
      return;
    }
    this.recentSection.classList.remove("hidden");
    this.recentContainer.innerHTML = list
      .map((q) => `
        <button type="button" class="search-dialog__chip" data-recent-query="${this.esc(q)}">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          ${this.esc(q)}
        </button>
      `)
      .join("");
  }

  esc(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
  }
}

// ── Global instance ──────────────────────────────────────────────────
const searchManager = new SearchManager();
window.searchManager = searchManager;

export function init() {
  searchManager.init();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { searchManager };
export default SearchManager;
