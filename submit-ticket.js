/* ---------- Nav: consultations dropdown + sliding pill ---------- */
const nav = document.querySelector(".dash-nav");
const navToggle = document.querySelector(".dash-dropdown-toggle");
const navMenu = document.getElementById("consultations-menu");

function movePill() {
  const navBox = nav.getBoundingClientRect();
  const box = navToggle.getBoundingClientRect();
  nav.style.setProperty("--pill-x", `${box.left - navBox.left - nav.clientLeft}px`);
  nav.style.setProperty("--pill-w", `${box.width}px`);
}

function setNavMenu(open) {
  navToggle.setAttribute("aria-expanded", String(open));
  navMenu.hidden = !open;
}

navToggle.addEventListener("click", () => setNavMenu(navToggle.getAttribute("aria-expanded") !== "true"));
document.addEventListener("click", (e) => { if (!e.target.closest(".dash-dropdown")) setNavMenu(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") setNavMenu(false); });
window.addEventListener("resize", movePill);
document.fonts.ready.then(() => {
  movePill();
  requestAnimationFrame(() => nav.classList.add("is-ready"));
});

/* ---------- Custom selects ---------- */
const selects = [...document.querySelectorAll("[data-select]")];

selects.forEach((root) => {
  const toggle = root.querySelector(".select-toggle");
  const menu = root.querySelector(".select-menu");
  const value = root.querySelector(".select-value");
  const input = root.querySelector('input[type="hidden"]');
  let options = [...menu.querySelectorAll("[role=option]")];
  let focused = -1;

  function setFocus(i) {
    if (!options.length) return;
    focused = (i + options.length) % options.length;
    options.forEach((o, n) => o.classList.toggle("is-focused", n === focused));
    options[focused].scrollIntoView({ block: "nearest" });
  }

  function open(state) {
    if (state) selects.forEach((s) => s !== root && s.dispatchEvent(new Event("close")));
    toggle.setAttribute("aria-expanded", String(state));
    menu.hidden = !state;
    if (state) setFocus(Math.max(options.findIndex((o) => o.getAttribute("aria-selected") === "true"), 0));
  }

  function choose(option) {
    options.forEach((o) => o.setAttribute("aria-selected", String(o === option)));
    value.textContent = option.textContent;
    value.classList.remove("is-placeholder");
    input.value = option.dataset.value;
    root.classList.remove("is-invalid");
    root.querySelector(".field-error").hidden = true;
    root.dispatchEvent(new CustomEvent("selected"));
    open(false);
    toggle.focus();
  }

  toggle.addEventListener("click", () => open(menu.hidden));
  function bindOptions() {
    options = [...menu.querySelectorAll("[role=option]")];
    options.forEach((o) => o.addEventListener("click", () => choose(o)));
  }
  root.addEventListener("refresh", bindOptions);
  bindOptions();
  root.addEventListener("close", () => open(false));

  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { open(false); toggle.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); menu.hidden ? open(true) : setFocus(focused + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); menu.hidden ? open(true) : setFocus(focused - 1); }
    else if ((e.key === "Enter" || e.key === " ") && !menu.hidden && focused > -1) {
      e.preventDefault(); choose(options[focused]);
    }
  });

  document.addEventListener("click", (e) => { if (!root.contains(e.target)) open(false); });
});

/* ---------- File attachments ---------- */
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const fileList = document.getElementById("file-list");
const MAX_FILES = 5;
const MAX_MB = 10;
let files = [];

function renderFiles() {
  fileList.replaceChildren(
    ...files.map((file, i) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => { files.splice(i, 1); renderFiles(); });
      li.append(name, remove);
      return li;
    }),
  );
}

function addFiles(list) {
  for (const file of list) {
    if (files.length >= MAX_FILES) { alert(`You can attach up to ${MAX_FILES} files.`); break; }
    if (file.size > MAX_MB * 1024 * 1024) { alert(`${file.name} is over ${MAX_MB} MB.`); continue; }
    files.push(file);
  }
  renderFiles();
}

document.getElementById("attach-btn").addEventListener("click", () => fileInput.click());
dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener("change", () => { addFiles(fileInput.files); fileInput.value = ""; });

["dragenter", "dragover"].forEach((t) =>
  dropzone.addEventListener(t, (e) => { e.preventDefault(); dropzone.classList.add("is-over"); }));
["dragleave", "drop"].forEach((t) =>
  dropzone.addEventListener(t, (e) => { e.preventDefault(); dropzone.classList.remove("is-over"); }));
dropzone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

/* ---------- Submit ---------- */
const form = document.getElementById("ticket-form");
const statusEl = document.getElementById("ticket-status");

function check(wrapper, ok) {
  wrapper.classList.toggle("is-invalid", !ok);
  wrapper.querySelector(".field-error").hidden = ok;
  return ok;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const results = [
    check(selects[0], !!form.professor.value),
    check(form.subject_code.parentElement, !!form.subject_code.value.trim()),
    check(form.section.parentElement, !!form.section.value.trim()),
    check(selects[1], !!form.category.value),
    check(form.description.parentElement, !!form.description.value.trim()),
  ];
  if (results.includes(false)) {
    document.querySelector(".is-invalid")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const btn = form.querySelector(".ticket-submit");
  btn.disabled = true;
  statusEl.hidden = false;

  try {
    const id = await db.submitTicket({
      professor: form.professor.value,
      subject_code: form.subject_code.value.trim(),
      section: form.section.value.trim(),
      category: form.category.value,
      description: form.description.value.trim(),
    }, files);
    if (!id) return; // not logged in, db redirected to login
    statusEl.textContent = "Ticket submitted!";
    setTimeout(() => (window.location.href = "dashboard.html"), 1200);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't submit your ticket. Try again.";
    btn.disabled = false;
  }
});


/* ---------- Step-by-step reveal ---------- */
const step2 = document.getElementById("step-2");
const step3 = document.getElementById("step-3");
const submitBtn = document.getElementById("ticket-submit");

function reveal(...els) {
  const fresh = els.filter((el) => el.hidden);
  fresh.forEach((el) => { el.hidden = false; el.classList.add("is-reveal"); });
  if (fresh.length) fresh[0].scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// 1) professor picked -> subject code + section
selects[0].addEventListener("selected", () => reveal(step2));

// 2) both filled -> category, description, attachments, submit
function checkStep2() {
  if (form.subject_code.value.trim() && form.section.value.trim()) reveal(step3, submitBtn);
}
form.subject_code.addEventListener("input", checkStep2);
form.section.addEventListener("input", checkStep2);

/* ---------- Load professors from the database ---------- */
db.listProfessors()
  .then((professors) => {
    const menu = document.getElementById("professor-list");

    if (!professors.length) {
      const empty = document.createElement("li");
      empty.textContent = "No professors available yet.";
      empty.style.cursor = "default";
      menu.replaceChildren(empty);
      return;
    }

    menu.replaceChildren(
      ...professors.map((p) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.dataset.value = p.id;
        li.textContent = p.name;
        return li;
      }),
    );
    selects[0].dispatchEvent(new Event("refresh"));
  })
  .catch((error) => console.error("Couldn't load professors.", error));
