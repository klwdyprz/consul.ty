function pad(n) {
  return String(n).padStart(2, "0");
}

const fetchSchedules = () => db.profSchedules();

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

function renderSchedules(schedules) {
  const list = document.getElementById("schedule-list");
  list.replaceChildren();

  if (!schedules.length) {
    list.append(make("li", "sch-empty", "No schedules yet. Approved on-site consultations will show up here."));
    return;
  }

  [...schedules]
    .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
    .forEach((s) => {
      const left = make("div");
      left.append(
        make("p", "", `Student: ${s.student.name}`),
        make("p", "", `Date: ${formatDate(s.date)}`),
        make("p", "", `Time: ${formatTime(s.start)}-${formatTime(s.end)}`),
      );

      const right = make("div");
      right.append(
        make("p", "", `Section: ${s.section}`),
        make("p", "", `Consultation ID: ${s.ticket_code}`),
      );

      const row = make("div", "pf-sch-row");
      row.append(left, right);

      const item = make("li", "sch-item");
      item.append(row);
      list.append(item);
    });
}

fetchSchedules().then((data) => {
  if (!data) return;
  renderUser(data.user);
  renderSchedules(data.schedules);
});
