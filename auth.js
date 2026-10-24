/* Login + Create Account handlers. Needs supabase-js CDN + supabase.js loaded first.
   Wrapped in an IIFE so its names can't clash with script.js on create.html. */
(() => {
  function authMessage(form, text, ok = false) {
    let note = form.querySelector(".auth-note");
    if (!note) {
      note = document.createElement("p");
      note.className = "field-error auth-note";
      note.setAttribute("role", "alert");
      form.querySelector("button[type=submit]").before(note);
    }
    note.style.color = ok ? "#7be0a0" : "";
    note.style.marginTop = "14px";
    note.style.textAlign = "center";
    note.textContent = text;
  }

  /* ---------- Login ---------- */
  const loginForm = document.querySelector(".login-card");

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = loginForm.querySelector("button[type=submit]");
      button.disabled = true;
      authMessage(loginForm, "");

      try {
        const role = await db.signIn(loginForm.elements.username.value.trim(), loginForm.elements.password.value);
        window.location.href = db.HOME[role];
      } catch (error) {
        authMessage(loginForm, error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
        button.disabled = false;
      }
    });
  }

  /* ---------- Create account ---------- */
  const signupForm = document.querySelector(".signup-card");

  if (signupForm) {
    // show / hide password
    signupForm.querySelectorAll(".field-toggle").forEach((toggle) => {
      toggle.addEventListener("click", () => {
        const input = toggle.closest(".field").querySelector("input");
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        toggle.setAttribute("aria-pressed", String(show));
        toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
      });
    });

    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!signupForm.checkValidity()) return; // password-match check lives in script.js

      const f = signupForm.elements;
      const button = signupForm.querySelector("button[type=submit]");
      button.disabled = true;
      authMessage(signupForm, "");

      try {
        const role = await db.signUp(f.email.value.trim(), f.password.value, {
          last_name: f.last_name.value.trim(),
          first_name: f.first_name.value.trim(),
          middle_initial: f.middle_initial.value.trim(),
        });

        if (role) {
          window.location.href = db.HOME[role];
        } else {
          authMessage(signupForm, "Account created. Check your email to confirm it, then sign in.", true);
        }
      } catch (error) {
        authMessage(signupForm, error.message);
        button.disabled = false;
      }
    });
  }
})();
