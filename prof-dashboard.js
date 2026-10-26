const fetchDashboardData = () => db.profDashboard();

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

  if (!upcoming) {
    document.getElementById("appointment-heading").textContent = "You have no upcoming appointment";
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
  const keys = ["solved", "pending", "onsite"];
  const max = Math.max(...keys.map((k) => counts[k]), 1);

  keys.forEach((key) => {
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

fetchDashboardData().then((data) => {
  if (!data) return;
  renderUser(data.user);
  renderAppointment(data.upcoming);
  renderCounts(data.counts);
  renderAnnouncement(data.announcement);
}).catch((error) => {
  console.error("Couldn't load the professor dashboard.", error);
});
