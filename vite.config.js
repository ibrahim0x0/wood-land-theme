import { defineConfig } from "vite";
import { resolve } from "path";

// Build config - pass ENTRY env var to build specific bundle
const entry = process.env.ENTRY || "main";

const entries = {
  main: {
    entry: resolve(__dirname, "assets/js/main.js"),
    name: "VitrinTheme",
    fileName: "theme"
  },
  cart: {
    entry: resolve(__dirname, "assets/js/cart/controller.js"),
    name: "CartController",
    fileName: "cart-controller"
  },
  // Listing-only bundle (price slider / noUiSlider). Loaded via a <script> in
  // products.jinja + category.jinja so noUiSlider stays off every other page.
  listing: {
    entry: resolve(__dirname, "assets/js/listing.js"),
    name: "VitrinListing",
    fileName: "theme-listing"
  }
};

const config = entries[entry] || entries.main;

export default defineConfig({
  // Some deps (e.g. embla-carousel-wheel-gestures → wheel-gestures) reference
  // `process.env.NODE_ENV` for dev-only warnings. In an IIFE browser bundle
  // `process` doesn't exist, so without this the reference throws
  // `ReferenceError: process is not defined` and the whole bundle aborts
  // (carousels never init). Statically replace it at build time.
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production")
  },
  build: {
    outDir: "assets/dist",
    emptyOutDir: entry === "main", // Only empty on main build
    sourcemap: process.env.NODE_ENV !== "production",
    minify: process.env.NODE_ENV === "production",

    // Library mode - outputs a single IIFE bundle for browser <script> tag
    lib: {
      entry: config.entry,
      name: config.name,
      formats: ["iife"],
      fileName: () => `${config.fileName}.js`
    }
  }
});
