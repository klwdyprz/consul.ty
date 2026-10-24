const ROLE = document.body.dataset.role === "prof" ? "prof" : "student";
const MAX_PHOTO_MB = 5;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const YEAR_LEVELS = ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year"];

/* span = grid columns taken, cols = the section's grid */
const SECTIONS =
  ROLE === "prof"
    ? [
        {
          id: "personal",
          title: "Personal Information",
          cols: "repeat(4, 1fr)",
          fields: [
            { key: "last_name", label: "Last Name", required: true },
            { key: "first_name", label: "First Name", required: true },
            { key: "middle_initial", label: "Middle Initial", optional: true, max: 3 },
            { key: "suffix", label: "Suffix", optional: true, max: 10 },
            { key: "department", label: "Department", required: true, span: 2 },
            { key: "email", label: "Email Address", type: "email", required: true, span: 2 },
          ],
        },
        { id: "availability", title: "Availability", cols: "1fr 1fr", kind: "availability" },
      ]
    : [
        {
          id: "personal",
          title: "Personal Information",
          cols: "repeat(4, 1fr)",
          fields: [
            { key: "last_name", label: "Last Name", required: true },
            { key: "first_name", label: "First Name", required: true },
            { key: "middle_initial", label: "Middle Initial", optional: true, max: 3 },
            { key: "suffix", label: "Suffix", optional: true, max: 10 },
            { key: "phone", label: "Phone Number", type: "tel", required: true, span: 2 },
            { key: "email", label: "Email Address", type: "email", required: true, span: 2 },
          ],
        },
        {
          id: "academic",
          title: "Academic Information",
          cols: "1.1fr 0.9fr 1.5fr",
          fields: [
            { key: "student_number", label: "Student Number", readonly: true },
            { key: "year_level", label: "Year Level", options: YEAR_LEVELS, required: true },
            { key: "program", label: "Program", required: true },
          ],
        },
      ];

/* ---------- Data ---------- */
const fetchProfile = () => db.getProfile(ROLE);

const saveProfile = (patch) => db.saveProfile(ROLE, patch);

const uploadPhoto = (file) => db.uploadPhoto(ROLE, file);

/* ---------- Helpers ---------- */
let profile = {};
let user = {};

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function setAvatar(el, url) {
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    el.replaceChildren(img);
  } else {
    el.replaceChildren();
  }
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function timeLabel(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)}${h >= 12 ? "PM" : "AM"}`;
}

function fullName(p) {
  const mi = p.middle_initial ? ` ${p.middle_initial}` : "";
  const suffix = p.suffix ? ` ${p.suffix}` : "";
  return `${p.first_name || ""}${mi} ${p.last_name || ""}${suffix}`.trim() || "Full Name";
}

const notice = document.getElementById("profile-note");

function say(text, isError = false) {
  notice.textContent = text;
  notice.classList.toggle("is-error", isError);
  notice.hidden = !text;
}

function renderHeader() {
  document.getElementById("user-name").textContent = user.name;
  document.getElementById("pr-name").textContent = fullName(profile);
  setAvatar(document.getElementById("user-avatar"), user.avatar_url);
  setAvatar(document.getElementById("pr-avatar"), user.avatar_url);
}

const PENCIL =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 1-4L16.5 4.5a2 2 0 0 1 3 3L8 19l-4 1Z"></path></svg>';

/* ---------- Sections (view mode <-> edit mode) ---------- */
function fieldBox(field, editing) {
  const box = make("div", "pr-field");
  if (field.span) box.style.gridColumn = `span ${field.span}`;

  const id = `f-${field.key}`;
  const value = profile[field.key] || "";

  if (!editing) {
    box.append(make("span", "pr-label", field.label), make("p", "pr-value", value || "N/A"));
    return box;
  }

  const label = make("label", "pr-label", field.label);
  label.htmlFor = id;
  let input;

  if (field.options) {
    input = document.createElement("select");
    field.options.forEach((option) => {
      const opt = make("option", "", option);
      opt.value = option;
      opt.selected = option === value;
      input.append(opt);
    });
  } else {
    input = document.createElement("input");
    input.type = field.type || "text";
    input.value = value;
    if (field.max) input.maxLength = field.max;
    if (field.readonly) input.readOnly = true;
    input.autocomplete = "off";
  }

  input.id = id;
  input.name = field.key;
  box.append(label, input);
  return box;
}

function availabilityBox(editing) {
  const wrap = document.createDocumentFragment();
  const a = profile.available || { days: [], start: "13:00", end: "15:00" };

  const dayBox = make("div", "pr-field");
  const timeBox = make("div", "pr-field");

  if (!editing) {
    dayBox.append(make("span", "pr-label", "Day"), make("p", "pr-value", a.days.length ? a.days.map((d) => DAY_NAMES[d]).join(", ") : "Not set"));
    timeBox.append(make("span", "pr-label", "Time"), make("p", "pr-value", a.days.length ? `${timeLabel(a.start)}-${timeLabel(a.end)}` : "Not set"));
    wrap.append(dayBox, timeBox);
    return wrap;
  }

  const dayGroup = make("div", "pr-chips");
  dayGroup.setAttribute("role", "group");
  dayGroup.setAttribute("aria-label", "Available days");
  DAY_NAMES.forEach((name, i) => {
    const chip = make("label", "pr-chip");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "days";
    input.value = i;
    input.checked = a.days.includes(i);
    chip.append(input, make("span", "", name.slice(0, 3)));
    dayGroup.append(chip);
  });
  dayBox.append(make("span", "pr-label", "Day"), dayGroup);

  const times = make("div", "pr-time");
  const start = document.createElement("input");
  const end = document.createElement("input");
  [[start, "start", a.start, "Start time"], [end, "end", a.end, "End time"]].forEach(([el, name, val, aria]) => {
    el.type = "time";
    el.name = name;
    el.value = val;
    el.required = true;
    el.setAttribute("aria-label", aria);
  });
  times.append(start, make("span", "", "to"), end);
  timeBox.append(make("span", "pr-label", "Time"), times);

  wrap.append(dayBox, timeBox);
  return wrap;
}

function renderSection(section) {
  const form = make("form", "pr-section");
  form.noValidate = true;
  form.setAttribute("aria-labelledby", `h-${section.id}`);

  const heading = make("h2", "", section.title);
  heading.id = `h-${section.id}`;

  const actions = make("div", "pr-actions");
  const head = make("div", "pr-head");
  head.append(heading, actions);

  const grid = make("div", "pr-grid");
  grid.style.gridTemplateColumns = section.cols;
  const error = make("p", "pr-error");
  error.hidden = true;
  error.setAttribute("role", "alert");

  form.append(head, grid);

  function draw(editing) {
    grid.replaceChildren();
    error.hidden = true;
    actions.replaceChildren();

    if (section.kind === "availability") grid.append(availabilityBox(editing));
    else section.fields.forEach((f) => grid.append(fieldBox(f, editing)));

    if (editing) {
      const cancel = make("button", "pr-btn", "Cancel");
      cancel.type = "button";
      cancel.addEventListener("click", () => draw(false));
      const save = make("button", "pr-btn is-primary", "Save");
      save.type = "submit";
      actions.append(cancel, save);
      grid.append(error);
      const first = grid.querySelector("input:not([readonly]), select");
      if (first) first.focus();
    } else {
      const edit = make("button", "pr-btn");
      edit.type = "button";
      edit.innerHTML = `${PENCIL}Edit`;
      edit.setAttribute("aria-label", `Edit ${section.title.toLowerCase()}`);
      edit.addEventListener("click", () => draw(true));
      actions.append(edit);
    }
  }

  function fail(message, input) {
    error.textContent = message;
    error.hidden = false;
    if (input) {
      input.classList.add("is-invalid");
      input.focus();
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.querySelector(".pr-btn.is-primary")) return;
    form.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
    error.hidden = true;

    const data = new FormData(form);
    let patch = {};

    if (section.kind === "availability") {
      const days = data.getAll("days").map(Number);
      const start = data.get("start");
      const end = data.get("end");
      if (!days.length) return fail("Pick at least one day.", form.querySelector(".pr-chips input"));
      if (!start || !end || timeToMinutes(end) <= timeToMinutes(start)) {
        return fail("End time must be after the start time.", form.querySelector('input[name="end"]'));
      }
      patch = { available: { days, start, end } };
    } else {
      for (const field of section.fields) {
        const input = form.elements[field.key];
        const value = input.value.trim();
        if (field.required && !value) return fail(`${field.label} is required.`, input);
        if (field.type === "email" && value && !/^\S+@\S+\.\S+$/.test(value)) {
          return fail("Enter a valid email address.", input);
        }
        if (field.type === "tel" && value && !/^[0-9+\-\s()]{7,}$/.test(value)) {
          return fail("Enter a valid phone number.", input);
        }
        if (!field.readonly) patch[field.key] = value;
      }
    }

    const save = form.querySelector(".pr-btn.is-primary");
    save.disabled = true;
    const ok = await saveProfile(patch);
    if (!ok) {
      save.disabled = false;
      return fail("Couldn't save your changes. Try again.");
    }

    Object.assign(profile, patch);
    draw(false);
    renderHeader();
    say("Changes saved.");
  });

  draw(false);
  return form;
}

/* ---------- Photo ---------- */
const photoInput = document.getElementById("photo-input");

document.getElementById("photo-btn").addEventListener("click", () => photoInput.click());

photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  photoInput.value = "";
  if (!file) return;

  if (!file.type.startsWith("image/")) return say("Choose an image file (JPG, PNG, or WebP).", true);
  if (file.size > MAX_PHOTO_MB * 1024 * 1024) return say(`Photo must be under ${MAX_PHOTO_MB} MB.`, true);

  say("Uploading photo...");
  const url = await uploadPhoto(file);
  if (!url) return say("Couldn't upload your photo. Try again.", true);

  user.avatar_url = url;
  renderHeader();
  say("Photo updated.");
});

/* ---------- Nav (student only: Consultations dropdown) ---------- */
const dropdownToggle = document.querySelector(".dash-dropdown-toggle");
const dropdownMenu = document.getElementById("consultations-menu");

function setDropdown(open) {
  dropdownToggle.setAttribute("aria-expanded", String(open));
  dropdownMenu.hidden = !open;
}

if (dropdownToggle) {
  dropdownToggle.addEventListener("click", () => {
    setDropdown(dropdownToggle.getAttribute("aria-expanded") !== "true");
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".dash-dropdown")) setDropdown(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setDropdown(false);
      dropdownToggle.focus();
    }
  });
}

/* ---------- Sign out ---------- */
const signOutBtn = make("button", "pr-signout", "Sign Out");
signOutBtn.type = "button";
signOutBtn.addEventListener("click", () => db.signOut());
document.querySelector(".pr-card").append(signOutBtn);

/* ---------- Go ---------- */
fetchProfile().then((data) => {
  if (!data) return;
  user = data.user;
  profile = data.profile;
  renderHeader();
  document.getElementById("pr-sections").replaceChildren(...SECTIONS.map(renderSection));
});
