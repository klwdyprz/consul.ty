const fetchDashboardData = () => db.studentDashboard();

function renderUser(user) {
  document.getElementById("user-name").textContent = user.name;

  if (user.avatar_url) {
    const img = document.createElement("img");
    img.src = user.avatar_url;
    img.alt = "";
    document.getElementById("user-avatar").replaceChildren(img);
  }
}

function renderAppointment(upcoming) {
  const tiles = {
    month: document.getElementById("appt-month"),
    day: document.getElementById("appt-day"),
    year: document.getElementById("appt-year"),
  };
  const heading = document.getElementById("appointment-heading");

  if (!upcoming) {
    heading.textContent = "You have no upcoming appointment";
    return;
  }

  // Split the string instead of using new Date() to avoid timezone shifts.
  const [year, month, day] = upcoming.date.split("-");
  tiles.month.textContent = month;
  tiles.day.textContent = day;
  tiles.year.textContent = year.slice(-2);
  Object.values(tiles).forEach((tile) => tile.classList.remove("is-empty"));
}

function renderCounts(counts) {
  const max = Math.max(counts.submitted, counts.solved, counts.pending, 1);

  ["submitted", "solved", "pending"].forEach((key) => {
    const value = counts[key];
    const fill = document.getElementById(`bar-${key}`);

    fill.style.width = `${(value / max) * 100}%`;
    fill.parentElement.setAttribute("aria-valuenow", value);
    fill.parentElement.setAttribute("aria-valuemax", max);
    document.getElementById(`count-${key}`).textContent = value;
  });
}

function renderAnnouncement(announcement) {
  const banner = document.getElementById("dashboard-announcement");
  if (!announcement) return;
  banner.querySelector("#announcement-text").textContent = announcement;
  banner.hidden = false;
}

/* Consultations dropdown + sliding nav pill */
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

/* Place the pill without animating, then turn the slide on */
document.fonts.ready.then(() => {
  movePill(currentNavItem);
  requestAnimationFrame(() => nav.classList.add("is-ready"));
});
window.addEventListener("resize", () => {
  movePill(dropdownToggle.getAttribute("aria-expanded") === "true" ? dropdownToggle : currentNavItem);
});

fetchDashboardData().then((data) => {
  if (!data) return;
  renderUser(data.user);
  renderAppointment(data.upcoming);
  renderCounts(data.counts);
  renderAnnouncement(data.announcement);
}).catch((error) => {
  console.error("Couldn't load the student dashboard.", error);
});