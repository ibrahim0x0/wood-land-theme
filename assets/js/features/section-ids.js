/**
 * Section IDs — auto-assign a human-readable id to every `<section>` that
 * carries a `section-<type>` class. Counters are per-type, so the order
 * within one type is independent of other section types on the page:
 *
 *   hero          → id="hero-1"
 *   products      → id="products-1"
 *   carousel      → id="carousel-1"
 *   products      → id="products-2"     ← second products block, regardless
 *                                         of how many other types precede it
 *   video         → id="video-1"
 *
 * Why JS: each section template is rendered independently by Vitrin's
 * `{% template_components %}` tag, so Jinja doesn't have a shared
 * counter across renders. We do the numbering once on DOM ready.
 *
 * Sections that already have a merchant-set `id` are left alone so
 * custom theme edits can pin a specific identifier (e.g., from custom
 * HTML snippets or direct template edits).
 */

const SECTION_CLASS_PATTERN = /^section-([\w-]+)$/;

function extractType(section) {
  for (const cls of section.classList) {
    const match = cls.match(SECTION_CLASS_PATTERN);
    if (match) return match[1];
  }
  return null;
}

function assignSectionIds(root = document) {
  const counters = Object.create(null);
  const sections = root.querySelectorAll('section[class*="section-"]');

  sections.forEach((section) => {
    const type = extractType(section);
    if (!type) return;

    counters[type] = (counters[type] || 0) + 1;

    // Preserve any pre-existing id — merchants or custom template edits
    // might anchor specific behaviour to it.
    if (!section.id) {
      section.id = `${type}-${counters[type]}`;
    }
  });
}

export function init() {
  assignSectionIds();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Re-assign when dynamic content is injected (quick-view modal, AJAX
// pagination, etc.). Counters start from scratch; any section that
// already has an id is left alone so stable anchors survive.
window.addEventListener("content:loaded", init);

export { assignSectionIds };
