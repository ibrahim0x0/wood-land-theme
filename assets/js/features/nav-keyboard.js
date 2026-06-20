/**
 * Keyboard navigation for header dropdowns.
 *
 * Targets any element with `[role="menu"]`, `el-menu`, or `[data-menu-tree]`.
 * Supported keys while focus is inside such a menu:
 *   ArrowDown / ArrowRight  → next focusable item (wraps)
 *   ArrowUp   / ArrowLeft   → previous focusable item (wraps)
 *   Home                    → first item
 *   End                     → last item
 *   Escape                  → close the owning dropdown and return focus to
 *                             the trigger if we can find it
 *
 * Direction keys are RTL-aware: in RTL pages, ArrowRight means "previous"
 * and ArrowLeft means "next" so it feels natural for Arabic readers.
 */

const MENU_SELECTOR = 'el-menu, [role="menu"]';
const ITEM_SELECTOR = 'a[href], button:not([disabled]), [role="menuitem"]:not([disabled])';

function isRtl() {
  return document.documentElement.dir === "rtl";
}

function focusableItems(menu) {
  return Array.from(menu.querySelectorAll(ITEM_SELECTOR)).filter(
    (el) => !el.hidden && el.offsetParent !== null
  );
}

function focusOffset(items, currentIndex, delta) {
  if (!items.length) return null;
  const next = (currentIndex + delta + items.length) % items.length;
  items[next]?.focus();
  return items[next];
}

function closeOwningDropdown(menu) {
  // Prefer the native popover / dialog APIs when available.
  try {
    if (menu.matches?.(":popover-open")) {
      menu.hidePopover?.();
      return;
    }
  } catch {}
  // Fall back to finding a parent `el-dropdown` / `details` and toggling it.
  const details = menu.closest("details[open]");
  if (details) {
    details.open = false;
    const summary = details.querySelector(":scope > summary");
    summary?.focus();
    return;
  }
  const dropdown = menu.closest("el-dropdown");
  if (dropdown && typeof dropdown.hide === "function") {
    dropdown.hide();
  }
}

document.addEventListener("keydown", (e) => {
  const menu = e.target.closest(MENU_SELECTOR);
  if (!menu) return;

  const items = focusableItems(menu);
  if (items.length === 0) return;
  const currentIndex = items.indexOf(document.activeElement);

  const rtl = isRtl();
  const next = rtl ? "ArrowLeft" : "ArrowRight";
  const prev = rtl ? "ArrowRight" : "ArrowLeft";

  switch (e.key) {
    case "ArrowDown":
    case next:
      e.preventDefault();
      focusOffset(items, currentIndex < 0 ? -1 : currentIndex, 1);
      break;
    case "ArrowUp":
    case prev:
      e.preventDefault();
      focusOffset(items, currentIndex < 0 ? 0 : currentIndex, -1);
      break;
    case "Home":
      e.preventDefault();
      items[0]?.focus();
      break;
    case "End":
      e.preventDefault();
      items[items.length - 1]?.focus();
      break;
    case "Escape":
      e.preventDefault();
      closeOwningDropdown(menu);
      break;
  }
});
