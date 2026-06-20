/**
 * Body scroll lock (ref-counted).
 *
 * Native `<dialog>.showModal()` blocks scroll on Chrome/Firefox, but iOS
 * Safari still rubber-band-scrolls the page underneath. The `position: fixed`
 * + negative-top trick is the only bulletproof way to lock scroll on iOS while
 * preserving the scroll position so the page doesn't jump to the top on close.
 *
 * Ref-counted so overlapping owners (e.g. the cart drawer + quick view) don't
 * clobber each other: the styles are applied on the first lock and restored
 * only on the last unlock.
 */

let lockCount = 0;
let savedScrollY = 0;

export function lockBodyScroll() {
  if (lockCount === 0) {
    savedScrollY = window.scrollY || window.pageYOffset || 0;
    const body = document.body;
    body.dataset.scrollLocked = "1";
    body.style.position = "fixed";
    body.style.top = `-${savedScrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
  }
  lockCount++;
}

export function unlockBodyScroll() {
  if (lockCount === 0) return;
  lockCount--;
  if (lockCount > 0) return;
  const body = document.body;
  delete body.dataset.scrollLocked;
  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.style.width = "";
  body.style.overflow = "";
  // Restore the scroll position from when the lock was first acquired.
  window.scrollTo(0, savedScrollY);
}

/**
 * Hard-clear the lock regardless of ref-count. Used when we hand control off to
 * a 3rd-party overlay (e.g. Zid's Buy Now checkout / login dialog) that manages
 * its own scroll: any leftover `position: fixed` from our lock would otherwise
 * leave the page frozen / unscrollable after that dialog is dismissed.
 */
export function forceUnlockBodyScroll() {
  lockCount = 0;
  const body = document.body;
  delete body.dataset.scrollLocked;
  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.style.width = "";
  body.style.overflow = "";
  window.scrollTo(0, savedScrollY);
}
