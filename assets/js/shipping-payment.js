/**
 * Shipping & Payment Page JavaScript
 * Handles:
 * - Cities dialog (responsive - bottom sheet on mobile, dialog on desktop)
 * - Copy to clipboard functionality
 *
 * Note: Accordion behavior is handled by el-disclosure component
 */

document.addEventListener("DOMContentLoaded", () => {
  initCitiesDialog();
  initCopyButtons();
});

/**
 * Cities Dialog (Responsive)
 */
function initCitiesDialog() {
  const shippingMethodsData = document.getElementById("shipping-methods-data");
  if (!shippingMethodsData) return;

  let shippingMethods = [];
  try {
    shippingMethods = JSON.parse(shippingMethodsData.textContent);
  } catch (e) {
    console.error("Failed to parse shipping methods data:", e);
    return;
  }

  // Dialog elements
  const dialog = document.getElementById("cities-dialog");
  const dialogTitle = document.querySelector("[data-cities-dialog-title]");
  const dialogContainer = document.querySelector("[data-cities-list-container]");
  const dialogSearch = document.querySelector("[data-cities-search]");
  const dialogEmpty = document.querySelector("[data-cities-empty]");

  let currentCities = [];

  // Trigger buttons (both desktop and mobile use same dialog now)
  document.querySelectorAll("[data-cities-trigger], [data-cities-trigger-mobile]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const methodId = btn.dataset.methodId;
      const methodName = btn.dataset.methodName;
      openCitiesDialog(methodId, methodName);
    });
  });

  function openCitiesDialog(methodId, methodName) {
    const method = shippingMethods.find((m) => String(m.id) === String(methodId));
    if (!method || !method.delivery_option_cities) return;

    currentCities = method.delivery_option_cities;

    if (dialogTitle) dialogTitle.textContent = methodName;
    if (dialogSearch) dialogSearch.value = "";
    renderCities(dialogContainer, dialogEmpty, currentCities, "");
    dialog?.showModal?.() || dialog?.setAttribute?.("open", "");
  }

  function renderCities(container, emptyEl, cities, searchTerm = "") {
    if (!container) return;

    // Group cities by country
    const grouped = {};
    cities.forEach((city) => {
      const countryName = city.country?.name || city.country_name || "Other";
      if (!grouped[countryName]) {
        grouped[countryName] = [];
      }
      grouped[countryName].push(city);
    });

    // Filter by search term
    const filteredGroups = {};
    let hasResults = false;

    Object.entries(grouped).forEach(([country, citiesList]) => {
      const filtered = citiesList.filter((city) => {
        const cityName = city.name || city.city_name || "";
        return (
          cityName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          country.toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
      if (filtered.length > 0) {
        filteredGroups[country] = filtered;
        hasResults = true;
      }
    });

    // Clear existing content (except empty message)
    Array.from(container.children).forEach((child) => {
      if (!child.hasAttribute("data-cities-empty")) {
        child.remove();
      }
    });

    if (!hasResults) {
      if (emptyEl) emptyEl.classList.remove("hidden");
      return;
    }

    if (emptyEl) emptyEl.classList.add("hidden");

    const countryKeys = Object.keys(filteredGroups);
    const isSingleCountry = countryKeys.length === 1;

    // Render grouped cities
    countryKeys.forEach((country) => {
      const citiesList = filteredGroups[country];
      const cityCount = citiesList.length;

      const sectionEl = document.createElement("div");
      sectionEl.setAttribute("data-country-section", "");

      if (isSingleCountry) {
        // Single country: no border, simple layout
        sectionEl.className = "py-4";

        // Header (plain text)
        const headerEl = document.createElement("div");
        headerEl.className = "mb-3 flex items-center gap-2";
        headerEl.innerHTML = `
          <span class="text-foreground text-sm font-semibold">${country}</span>
          <span class="text-muted-foreground text-xs">(${cityCount} cities)</span>
        `;

        // Tags wrapper
        const tagsWrapper = document.createElement("div");
        tagsWrapper.className = "flex flex-wrap gap-2";

        citiesList.forEach((city) => {
          const cityName = city.name || city.city_name || "";
          const tagEl = document.createElement("span");
          tagEl.className = "badge badge-filled";
          tagEl.textContent = cityName;
          tagsWrapper.appendChild(tagEl);
        });

        sectionEl.appendChild(headerEl);
        sectionEl.appendChild(tagsWrapper);
      } else {
        // Multiple countries: bordered accordion sections
        sectionEl.className = "py-2";

        const accordionEl = document.createElement("div");
        accordionEl.className = "border-input rounded border p-3";

        // Country header (collapsible trigger)
        const triggerEl = document.createElement("button");
        triggerEl.type = "button";
        triggerEl.className = "flex w-full items-center justify-between";
        triggerEl.setAttribute("data-country-trigger", "");
        triggerEl.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="text-foreground text-sm font-semibold">${country}</span>
            <span class="text-muted-foreground text-xs">(${cityCount} cities)</span>
          </div>
          <span class="text-foreground flex size-10 shrink-0 items-center justify-center rounded bg-white/10 backdrop-blur-sm">
            <svg class="size-6 transition-transform duration-200 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" data-country-icon>
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </span>
        `;

        // Divider
        const dividerEl = document.createElement("div");
        dividerEl.className = "border-border-light mt-3 border-t";

        // Cities container with tags
        const contentEl = document.createElement("div");
        contentEl.className = "pt-3";
        contentEl.setAttribute("data-country-content", "");

        const tagsWrapper = document.createElement("div");
        tagsWrapper.className = "flex flex-wrap gap-2";

        citiesList.forEach((city) => {
          const cityName = city.name || city.city_name || "";
          const tagEl = document.createElement("span");
          tagEl.className = "badge badge-filled";
          tagEl.textContent = cityName;
          tagsWrapper.appendChild(tagEl);
        });

        contentEl.appendChild(tagsWrapper);

        // Toggle cities visibility on country click
        triggerEl.addEventListener("click", () => {
          const isOpen = !contentEl.classList.contains("hidden");
          contentEl.classList.toggle("hidden", isOpen);
          dividerEl.classList.toggle("hidden", isOpen);
          const icon = triggerEl.querySelector("[data-country-icon]");
          icon?.classList.toggle("rotate-180", !isOpen);
        });

        accordionEl.appendChild(triggerEl);
        accordionEl.appendChild(dividerEl);
        accordionEl.appendChild(contentEl);
        sectionEl.appendChild(accordionEl);
      }

      container.insertBefore(sectionEl, emptyEl);
    });
  }

  // Search functionality
  if (dialogSearch) {
    dialogSearch.addEventListener("input", (e) => {
      renderCities(dialogContainer, dialogEmpty, currentCities, e.target.value);
    });
  }
}

/**
 * Copy to Clipboard Functionality
 */
function initCopyButtons() {
  const copyButtons = document.querySelectorAll("[data-copy-btn]");

  copyButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const value = btn.dataset.copyValue;
      if (!value) return;

      try {
        await navigator.clipboard.writeText(value);

        // Show success feedback
        const originalSvg = btn.innerHTML;
        btn.innerHTML = `
          <svg class="size-4 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        `;

        // Revert after 2 seconds
        setTimeout(() => {
          btn.innerHTML = originalSvg;
        }, 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    });
  });
}
