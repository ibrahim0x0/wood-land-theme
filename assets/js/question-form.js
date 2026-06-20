/**
 * Product Question Form Handler
 * Handles form validation and submission for product questions
 */

class QuestionForm {
  constructor() {
    this.form = document.getElementById("question-form");

    if (!this.form) {
      return;
    }

    this.productId = this.form.dataset.productId;
    this.emailInput = this.form.querySelector('[name="question_email"]');
    this.nameInput = this.form.querySelector('[name="question_name"]');
    this.questionTextarea = this.form.querySelector('[name="question_text"]');
    this.isAnonymousCheckbox = this.form.querySelector('[name="is_anonymous"]');
    this.submitBtn = document.getElementById("submit-question-btn");
    this.questionError = document.getElementById("question-error");
    this.emailError = document.getElementById("email-error");
    this.nameError = document.getElementById("name-error");

    // Localized messages from data attributes
    this.messages = {
      sending: this.form.dataset.sendingText || "Sending...",
      successMessage: this.form.dataset.successMessage || "Your question has been sent successfully.",
      successTitle: this.form.dataset.successTitle || "Success",
      errorMessage: this.form.dataset.errorMessage || "Failed to send your question.",
      errorTitle: this.form.dataset.errorTitle || "Error"
    };

    // Email validation regex
    this.emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;

    this.init();
  }

  init() {
    // Pre-fill customer data if logged in
    this.fillCustomerData();

    // Handle form submission
    this.form.addEventListener("submit", (e) => this.handleSubmit(e));
  }

  /**
   * Pre-fill customer data if user is logged in
   */
  fillCustomerData() {
    if (window.customer && window.customer.name && window.customer.email) {
      if (!this.nameInput.value) {
        this.nameInput.value = window.customer.name;
      }
      if (!this.emailInput.value) {
        this.emailInput.value = window.customer.email;
      }
    }
  }

  /**
   * Show error for a field
   * @param {HTMLElement} input - The input element
   * @param {string} errorType - Type of error ('required' or 'invalid')
   */
  showError(input, errorType) {
    // Add error styling to input
    input.classList.add("!border-destructive", "border-2");

    // Show appropriate error message
    if (input === this.questionTextarea && this.questionError) {
      this.questionError.classList.remove("hidden");
    }
    if (input === this.emailInput && this.emailError && errorType === "invalid") {
      this.emailError.classList.remove("hidden");
    }
    if (input === this.nameInput && this.nameError && errorType === "required") {
      this.nameError.classList.remove("hidden");
    }
  }

  /**
   * Hide error for a field
   * @param {HTMLElement} input - The input element
   */
  hideError(input) {
    // Remove error styling
    input.classList.remove("!border-destructive", "border-2");

    // Hide error messages
    if (input === this.questionTextarea && this.questionError) {
      this.questionError.classList.add("hidden");
    }
    if (input === this.emailInput && this.emailError) {
      this.emailError.classList.add("hidden");
    }
    if (input === this.nameInput && this.nameError) {
      this.nameError.classList.add("hidden");
    }
  }

  /**
   * Show inline message on the form
   * @param {string} message - Message to show
   * @param {string} type - Type: 'success' or 'error'
   */
  showNotification(message, type) {
    const messageEl = document.getElementById("question-form-message");
    if (!messageEl) return;

    // Set message and styling
    messageEl.textContent = message;
    messageEl.classList.remove("hidden", "bg-success/10", "text-success", "bg-destructive/10", "text-destructive");

    if (type === "success") {
      messageEl.classList.add("bg-success/10", "text-success");
    } else {
      messageEl.classList.add("bg-destructive/10", "text-destructive");
    }

    // Auto-hide after 5 seconds for success
    if (type === "success") {
      setTimeout(() => {
        messageEl.classList.add("hidden");
      }, 5000);
    }
  }

  /**
   * Validate all form inputs
   * @returns {boolean} - True if valid, false otherwise
   */
  validateForm() {
    let isValid = true;

    // Clear previous errors
    this.hideError(this.emailInput);
    this.hideError(this.nameInput);
    this.hideError(this.questionTextarea);

    // Validate name
    if (!this.nameInput.value.trim()) {
      this.showError(this.nameInput, "required");
      isValid = false;
    }

    // Validate email
    if (!this.emailInput.value.trim()) {
      this.showError(this.emailInput, "required");
      isValid = false;
    } else if (!this.emailRegex.test(this.emailInput.value.trim())) {
      this.showError(this.emailInput, "invalid");
      isValid = false;
    }

    // Validate question
    if (!this.questionTextarea.value.trim()) {
      this.showError(this.questionTextarea, "required");
      isValid = false;
    }

    return isValid;
  }

  /**
   * Handle form submission
   * @param {Event} e - The submit event
   */
  async handleSubmit(e) {
    e.preventDefault();

    if (!this.validateForm()) {
      return;
    }

    // Store original content and disable submit button
    const originalContent = this.submitBtn.innerHTML;
    this.submitBtn.disabled = true;
    this.submitBtn.innerHTML = `<span class="inline-flex items-center gap-2"><svg class="size-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>${this.messages.sending}</span>`;

    try {
      await zid.products.createQuestion(this.productId, {
        question: this.questionTextarea.value.trim(),
        name: this.nameInput.value.trim(),
        email: this.emailInput.value.trim(),
        is_anonymous: this.isAnonymousCheckbox.checked
      });

      // Success - show notification
      this.showNotification(this.messages.successMessage, "success");

      // Reset form
      this.form.reset();
      this.fillCustomerData(); // Re-fill customer data after reset
    } catch (error) {
      console.error("Failed to submit question:", error);
      this.showNotification(this.messages.errorMessage, "error");
    } finally {
      // Re-enable submit button
      this.submitBtn.disabled = false;
      this.submitBtn.innerHTML = originalContent;
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new QuestionForm();
  });
} else {
  new QuestionForm();
}
