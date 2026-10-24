/* Landing page: Students / Faculty tabs */
const landingToggle = document.querySelector(".landing-toggle");
const landingTabs = document.querySelectorAll(".landing-tab");

landingTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    landingToggle.style.setProperty("--tab-index", [...landingTabs].indexOf(tab));
    landingTabs.forEach((other) => {
      const isActive = other === tab;
      other.classList.toggle("is-active", isActive);
      other.setAttribute("aria-selected", String(isActive));
      document.getElementById(other.getAttribute("aria-controls")).hidden = !isActive;
    });
  });
});

/* Create account: password match check */
const signupForm = document.querySelector(".signup-card");

if (signupForm) {
  const passwordInput = document.getElementById("signup-password");
  const confirmPasswordInput = document.getElementById("signup-confirm-password");
  const passwordMatchError = document.getElementById("password-match-error");

  function validatePasswordMatch() {
    const passwordsDoNotMatch =
      confirmPasswordInput.value !== "" &&
      passwordInput.value !== confirmPasswordInput.value;

    confirmPasswordInput.setCustomValidity(
      passwordsDoNotMatch ? "Passwords do not match." : "",
    );
    confirmPasswordInput.setAttribute("aria-invalid", String(passwordsDoNotMatch));
    passwordMatchError.hidden = !passwordsDoNotMatch;
  }

  passwordInput.addEventListener("input", validatePasswordMatch);
  confirmPasswordInput.addEventListener("input", validatePasswordMatch);
  signupForm.addEventListener("submit", validatePasswordMatch);
}