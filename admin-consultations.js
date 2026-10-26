function pad(n) {
  return String(n).padStart(2, "0");
}

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function parseStamp(stamp) {
  const [date, time = "00:00"] = stamp.split(/[ T]/);
  const [year, month, day] = date.split("-");
  const [hour, minute] = time.split(":");
  return { year, month, day, hour: Number(hour), minute };
}

function formatDate(stamp) {
  const { year, month, day } = parseStamp(stamp);
  return `${month}/${day}/${year.slice(-2)}`;
}

function formatTime(stamp) {
  const { hour, minute } = parseStamp(stamp);
  return `${hour % 12 || 12}:${minute}${hour >= 12 ? "pm" : "am"}`;
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

const DOWNLOAD_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"></path><path d="M4 15v4h16v-4"></path></svg>';

let tickets = [];
const list = document.getElementById("admin-list");
const search = document.getElementById("admin-search");
const exportNote = document.getElementById("export-note");

function matches(ticket, query) {
  if (!query) return true;
  return [ticket.student.name, ticket.professor.name, ticket.category, ticket.code, ticket.text]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

/* ---------- Export: the whole in-app chat as a .txt file ---------- */
function transcript(ticket, messages) {
  const lines = [
    "Consul.ty consultation export",
    `Consultation ID: ${ticket.code}`,
    `Category: ${ticket.category}`,
    `Student: ${ticket.student.name}`,
    `Professor: ${ticket.professor.name}`,
    `Exported: ${formatDate(new Date().toISOString())} ${formatTime(new Date().toISOString())}`,
    "",
    "----------------------------------------",
    "",
  ];

  messages.forEach((m) => {
    lines.push(`[${formatDate(m.created_at)} ${formatTime(m.created_at)}] ${m.from} (${m.role})`);
    lines.push(m.body, "");
    if (m.files.length) lines.push(`Attachments: ${m.files.join(", ")}`, "");
  });

  return lines.join("\n");
}

function download(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportTicket(ticket, button) {
  button.disabled = true;
  exportNote.hidden = true;
  try {
    const messages = await db.adminThread(ticket);
    download(`consultation-${ticket.code}.txt`, transcript(ticket, messages));
  } catch (error) {
    console.error("Export failed.", error);
    exportNote.textContent = "Couldn't export that conversation. Try again.";
    exportNote.hidden = false;
  }
  button.disabled = false;
}

/* ---------- Render ---------- */
function render() {
  list.replaceChildren();
  const query = search.value.trim().toLowerCase();
  const found = tickets.filter((t) => matches(t, query)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  if (!found.length) {
    list.append(make("li", "tk-empty", tickets.length ? "No consultations match your search." : "No consultations yet."));
    return;
  }

  found.forEach((ticket) => {
    const avatar = make("span", "tk-avatar");
    setAvatar(avatar, ticket.student.avatar_url);

    const top = make("div", "ad-item-top");
    top.append(make("strong", "", ticket.student.name), make("time", "", formatTime(ticket.updated_at)));

    const body = make("div");
    body.append(
      top,
      make("span", "ad-item-cat", ticket.category),
      make("span", "ad-item-prev", ticket.preview),
      make("p", "ad-item-meta", `Consultation ID: ${ticket.code} · To ${ticket.professor.name}`),
    );

    const button = make("button", "ad-export");
    button.type = "button";
    button.innerHTML = `${DOWNLOAD_ICON}Export`;
    button.setAttribute("aria-label", `Export consultation ${ticket.code}`);
    button.addEventListener("click", () => exportTicket(ticket, button));

    const item = make("li", "ad-item");
    item.append(avatar, body, button);
    list.append(item);
  });
}

search.addEventListener("input", render);

db.adminTickets()
  .then((data) => {
    if (!data) return;
    tickets = data.tickets;
    document.getElementById("user-name").textContent = data.user.name;
    setAvatar(document.getElementById("user-avatar"), data.user.avatar_url);
    render();
  })
  .catch((error) => {
    console.error("Couldn't load consultations.", error);
    list.replaceChildren(make("li", "tk-empty", "Couldn't load consultations."));
  });
