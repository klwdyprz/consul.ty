function pad(n) {
  return String(n).padStart(2, "0");
}

const fetchSchedules = () => db.studentSchedules();

/* ---------- Helpers ---------- */
function formatDate(date) {
  // Split the string instead of using new Date() to avoid timezone shifts.
  const [year, month, day] = date.split("-");
  return `${month}/${day}/${year.slice(-2)}`;
}

function formatTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)}${h >= 12 ? "PM" : "AM"}`;
}

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/* ---------- Render ---------- */
function renderUser(user) {
  document.getElementById("user-name").textContent = user.name;

  if (user.avatar_url) {
    const img = document.createElement("img");
    img.src = user.avatar_url;
    img.alt = "";
    document.getElementById("user-avatar").replaceChildren(img);
  }
}

function renderAppointment(schedules) {
  const now = new Date();
  const nowStamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const next = schedules
    .filter((s) => `${s.date} ${s.start}` >= nowStamp)
    .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))[0];

  if (!next) {
    document.getElementById("appointment-heading").textContent = "You have no upcoming appointment";
    return;
  }

  const [year, month, day] = next.date.split("-");
  const tiles = {
    month: document.getElementById("appt-month"),
    day: document.getElementById("appt-day"),
    year: document.getElementById("appt-year"),
  };
  tiles.month.textContent = month;
  tiles.day.textContent = day;
  tiles.year.textContent = year.slice(-2);
  Object.values(tiles).forEach((tile) => tile.classList.remove("is-empty"));
}

function renderSchedules(schedules) {
  const list = document.getElementById("schedule-list");
  list.replaceChildren();

  if (!schedules.length) {
    list.append(make("li", "sch-empty", "No schedules yet."));
    return;
  }

  [...schedules]
    .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
    .forEach((s) => {
      const item = make("li", "sch-item");
      item.append(
        make("p", "", `Professor: ${s.professor.name}`),
        make("p", "", `Date: ${formatDate(s.date)}`),
        make("p", "", `Time: ${formatTime(s.start)}-${formatTime(s.end)}`),
      );
      list.append(item);
    });
}

/* Consultations dropdown + sliding nav pill (same as dashboard.js) */
const nav = document.querySelector(".dash-nav");
const currentNavItem = nav.querySelector(".is-active");
const dropdownToggle = document.querySelector(".dash-dropdown-toggle");
const dropdownMenu = document.getElementById("consultations-menu");

function movePill(target) {
  const navBox = nav.getBoundingClientRect();
  const box = target.getBoundingClientRect();

  nav.style.setProperty("--pill-x", `${box.left - navBox.left - nav.clientLeft}px`);
  nav.style.setProperty("--pill-w", `${box.width}px`);
}

function setDropdown(open) {
  dropdownToggle.setAttribute("aria-expanded", String(open));
  dropdownMenu.hidden = !open;
  movePill(open ? dropdownToggle : currentNavItem);
}

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

document.fonts.ready.then(() => {
  movePill(currentNavItem);
  requestAnimationFrame(() => nav.classList.add("is-ready"));
});
window.addEventListener("resize", () => {
  movePill(dropdownToggle.getAttribute("aria-expanded") === "true" ? dropdownToggle : currentNavItem);
});

fetchSchedules().then((data) => {
  if (!data) return;
  renderUser(data.user);
  renderAppointment(data.schedules);
  renderSchedules(data.schedules);
});