/**
 * Time Ago Utility
 * Converts dates to relative time strings (e.g., "2 days ago")
 * Uses data attributes for localization
 */

(function () {
  // Get localized labels from data attribute on body or use defaults
  function getLabels() {
    const labelsEl = document.querySelector("[data-time-ago-labels]");
    if (labelsEl) {
      try {
        return JSON.parse(labelsEl.dataset.timeAgoLabels);
      } catch (e) {
        console.warn("Failed to parse time-ago labels:", e);
      }
    }

    // Default English labels
    return {
      year: "year",
      years: "years",
      month: "month",
      months: "months",
      week: "week",
      weeks: "weeks",
      day: "day",
      days: "days",
      hour: "hour",
      hours: "hours",
      minute: "minute",
      minutes: "minutes",
      ago: "%s ago",
      justNow: "Just now"
    };
  }

  function formatTimeAgo(date) {
    const labels = getLabels();
    const now = new Date();
    const past = new Date(date);
    const diffInSeconds = Math.floor((now - past) / 1000);

    const intervals = [
      { label: labels.year, labelPlural: labels.years, seconds: 31536000 },
      { label: labels.month, labelPlural: labels.months, seconds: 2592000 },
      { label: labels.week, labelPlural: labels.weeks, seconds: 604800 },
      { label: labels.day, labelPlural: labels.days, seconds: 86400 },
      { label: labels.hour, labelPlural: labels.hours, seconds: 3600 },
      { label: labels.minute, labelPlural: labels.minutes, seconds: 60 }
    ];

    for (const interval of intervals) {
      const count = Math.floor(diffInSeconds / interval.seconds);
      if (count >= 1) {
        const label = count === 1 ? interval.label : interval.labelPlural;
        return labels.ago.replace("%s", count + " " + label);
      }
    }

    return labels.justNow;
  }

  function updateTimeAgoElements() {
    const elements = document.querySelectorAll("[data-time-ago-date]");
    elements.forEach(function (el) {
      const date = el.getAttribute("data-time-ago-date");
      if (date) {
        el.textContent = formatTimeAgo(date);
      }
    });
  }

  // Run on page load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateTimeAgoElements);
  } else {
    updateTimeAgoElements();
  }

  // Update every minute
  setInterval(updateTimeAgoElements, 60000);

  // Expose for dynamic content
  window.updateTimeAgoElements = updateTimeAgoElements;
})();
