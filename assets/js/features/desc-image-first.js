/**
 * Description image-first
 *
 * When the merchant enables "Show description image first" (Product Page
 * settings), any <img> embedded in the product description is moved to the top
 * of the description block. Useful when the merchant's description text comes
 * before an illustrative image but they want the image to lead.
 *
 * Opt-in: only runs on `[data-product-description][data-desc-image-first]`,
 * which the template renders only when the setting is on. Product page only
 * (the quick view hides the description).
 */

function reorderDescriptionImages() {
  document
    .querySelectorAll("[data-product-description][data-desc-image-first]")
    .forEach((box) => {
      if (box.dataset.descImageOrdered === "1") return;
      const imgs = Array.from(box.querySelectorAll("img"));
      if (!imgs.length) return;
      box.dataset.descImageOrdered = "1";

      // Move the images (in document order) to the front of the description.
      // appendChild() pulls each <img> out of its current paragraph.
      const frag = document.createDocumentFragment();
      imgs.forEach((img) => frag.appendChild(img));
      box.insertBefore(frag, box.firstChild);

      // Drop any paragraph left empty after its image was pulled out.
      box.querySelectorAll("p").forEach((p) => {
        if (!p.textContent.trim() && p.children.length === 0) p.remove();
      });
    });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", reorderDescriptionImages);
} else {
  reorderDescriptionImages();
}
