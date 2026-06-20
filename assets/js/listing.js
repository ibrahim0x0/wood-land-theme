/**
 * Listing-page entry bundle (Vite `listing` entry → assets/dist/theme-listing.js).
 *
 * Bundles ONLY the price-range slider, which pulls in noUiSlider — the single
 * heaviest feature dependency in the theme. By shipping it from a separate
 * template-loaded <script> (mirroring the existing cart-controller entry), the
 * noUiSlider payload lands ONLY on the product-listing templates that actually
 * render a price filter (templates/products.jinja + templates/category.jinja).
 * Home, PDP, cart, reviews, and questions no longer download it.
 *
 * Deliberately NOT included here: features/product-filter.js. It defines
 * `window.productFilter`, which the shared pagination partial's per-page
 * <el-select> calls via inline onchange on the reviews and questions pages too
 * (components/products/pagination.jinja) — so it has to stay in the global
 * main.js / theme.js bundle. price-slider.js self-initializes on
 * DOMContentLoaded and only ever runs noUiSlider.create() when a
 * [data-price-slider] element is present, so loading it here is inert on any
 * page without a price filter.
 */
import "./features/price-slider.js";
