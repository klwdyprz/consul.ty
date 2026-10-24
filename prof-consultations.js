const STATUS_LABEL = { solved: "Solved", pending: "Pending", "on-site": "On-site" };

function pad(n) {
  return String(n).padStart(2, "0");
}

const fetchTickets = () => db.profTickets();

/* Resolves to the new message or null */
const sendMessage = (ticketId, text, files) => db.sendMessage(ticketId, text, files, null);

/* Resolves to true/false */
const setStatus = (ticketId, status) => db.profSetStatus(ticketId, status);

/* ---------- Helpers ---------- */
function parseStamp(stamp) {
  // Split the string instead of using new Date() to avoid timezone shifts.
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

function groupLabel(stamp) {
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return stamp.slice(0, 10) === today ? "Today" : formatDate(stamp);
}

function ticketCode(ticket) {
  return ticket.code || String(ticket.id).padStart(6, "0");
}

function minutesLabel(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)}${h >= 12 ? "pm" : "am"}`;
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

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/* ---------- State + elements ---------- */
let tickets = [];
let selectedId = null;
let currentUser = {};

const searchInput = document.getElementById("ticket-search");
const thread = document.getElementById("thread");
const statusBtn = document.getElementById("d-status");
const statusText = document.getElementById("d-status-text");
const statusMenu = document.getElementById("status-menu");
const scheduleLine = document.getElementById("d-schedule");
const scheduleText = document.getElementById("d-schedule-text");
const replyForm = document.getElementById("reply-form");
const replyText = document.getElementById("reply-text");
const replyNote = document.getElementById("reply-note");
const attachInput = document.getElementById("attach-input");

/* The preview in the list = the latest message */
function refreshMeta(ticket) {
  const last = ticket.messages[ticket.messages.length - 1];
  ticket.body = last.body;
  ticket.updated_at = last.created_at;
  ticket.last_sender = last.from === "me" ? "me" : "student";
}

function byRecent(a, b) {
  return b.updated_at.localeCompare(a.updated_at);
}

/* ---------- Render ---------- */
function renderUser(user) {
  currentUser = user;
  document.getElementById("user-name").textContent = user.name;
  setAvatar(document.getElementById("user-avatar"), user.avatar_url);
}

function matchesSearch(ticket, query) {
  if (!query) return true;
  const haystack = [
    ticket.student.name,
    ticket.student.username,
    ticket.category,
    ticketCode(ticket),
    ...ticket.messages.map((m) => m.body),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function renderList() {
  const list = document.getElementById("ticket-list");
  list.replaceChildren();

  if (!tickets.length) {
    list.append(make("p", "tk-empty", "No consultations yet. Student tickets will show up here."));
    return;
  }

  const query = searchInput.value.trim().toLowerCase();
  const sorted = tickets.filter((t) => matchesSearch(t, query)).sort(byRecent);

  if (!sorted.length) {
    list.append(make("p", "tk-empty", "No consultations match your search."));
    return;
  }

  let currentGroup = null;
  let cards = null;

  sorted.forEach((ticket) => {
    const label = groupLabel(ticket.updated_at);

    if (label !== currentGroup) {
      currentGroup = label;
      list.append(make("h2", "tk-group", label));
      cards = make("ul", "tk-cards");
      list.append(cards);
    }

    const item = make("li");
    const card = make("button", "tk-card");
    card.type = "button";
    card.dataset.id = ticket.id;
    card.setAttribute("aria-current", String(ticket.id === selectedId));

    const avatar = make("span", "tk-avatar");
    setAvatar(avatar, ticket.student.avatar_url);

    const top = make("div", "tk-card-top");
    top.append(make("strong", "", ticket.last_sender === "me" ? "Me" : "Student"), make("time", "", formatTime(ticket.updated_at)));

    const text = make("div");
    text.append(
      top,
      make("span", "tk-card-id", `Consultation ID: ${ticketCode(ticket)}`),
      make("span", "tk-card-cat", ticket.category),
      make("span", "tk-card-preview", ticket.body),
    );

    card.append(avatar, text);
    card.addEventListener("click", () => selectTicket(ticket.id));
    item.append(card);
    cards.append(item);
  });
}

async function openFile(file) {
  const win = window.open("", "_blank");
  try {
    const url = await db.attachmentUrl(file.path);
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch (error) {
    if (win) win.close();
    console.error("Couldn't open attachment.", error);
  }
}

function messageEl(message, ticket) {
  const mine = message.from === "me";
  const sender = mine ? { name: "Me", avatar_url: currentUser.avatar_url } : ticket.student;
  const item = make("li", `mail ${mine ? "is-me" : "is-them"}`);

  const avatar = make("span", "tk-avatar mail-avatar");
  setAvatar(avatar, sender.avatar_url);

  const who = make("div", "mail-who");
  who.append(make("strong", "", sender.name));
  if (!mine) who.append(make("small", "", `<${sender.username}>`));

  const when = make("time", "mail-when", `${formatDate(message.created_at)} · ${formatTime(message.created_at)}`);

  const head = make("header", "mail-head");
  head.append(avatar, who, when);
  item.append(head, make("p", "mail-body", message.body));

  if (message.attachments && message.attachments.length) {
    const files = make("div", "mail-files");
    message.attachments.forEach((file) => {
      const btn = make("button", "mail-file", file.name);
      btn.type = "button";
      btn.title = "Open attachment";
      btn.addEventListener("click", () => openFile(file));
      files.append(btn);
    });
    item.append(files);
  }

  return item;
}

function renderThread(ticket, stick) {
  const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120;
  thread.replaceChildren(...ticket.messages.map((m) => messageEl(m, ticket)));
  if (stick || nearBottom) thread.scrollTop = thread.scrollHeight; // land on the newest email
}

/* The status pill is always a dropdown. Picking an option saves it right away. */
function renderStatus(ticket) {
  statusText.textContent = STATUS_LABEL[ticket.status] || "Status";
  statusBtn.classList.toggle("is-pending", ticket.status === "pending");
  statusBtn.classList.toggle("is-onsite", ticket.status === "on-site");
  setStatusMenu(false);
}

function renderDetail(ticket, stick = false) {
  document.getElementById("d-name").textContent = ticket.student.name;
  document.getElementById("d-username").textContent = `<${ticket.student.username}>`;
  document.getElementById("d-date").textContent = formatDate(ticket.created_at);
  document.getElementById("d-time").textContent = formatTime(ticket.created_at);
  document.getElementById("d-id").textContent = `Consultation ID: ${ticketCode(ticket)}`;
  document.getElementById("d-subject").textContent = ticket.category;
  setAvatar(document.getElementById("d-avatar"), ticket.student.avatar_url);

  if (ticket.schedule) {
    const s = ticket.schedule;
    scheduleText.textContent = `${formatDate(s.date)} · ${minutesLabel(s.start)}-${minutesLabel(s.end)}`;
    scheduleLine.hidden = false;
  } else {
    scheduleLine.hidden = true;
  }

  renderStatus(ticket);
  renderThread(ticket, stick);
}

function selectTicket(id) {
  const ticket = tickets.find((t) => t.id === id);
  if (!ticket) return;

  selectedId = id;
  document.getElementById("ticket-detail").hidden = false;
  replyForm.reset();
  document.getElementById("attach-names").textContent = "";
  replyNote.hidden = true;
  renderDetail(ticket, true);

  document.querySelectorAll(".tk-card").forEach((card) => {
    card.setAttribute("aria-current", String(Number(card.dataset.id) === id));
  });
  history.replaceState(null, "", `?id=${id}`);
}

searchInput.addEventListener("input", renderList);

/* ---------- Status dropdown ---------- */
function setStatusMenu(open) {
  statusBtn.setAttribute("aria-expanded", String(open));
  statusMenu.hidden = !open;
}

statusBtn.addEventListener("click", () => setStatusMenu(statusMenu.hidden));

statusMenu.querySelectorAll(".pf-opt").forEach((option) => {
  option.addEventListener("click", async () => {
    const ticket = tickets.find((t) => t.id === selectedId);
    const value = option.dataset.value;
    setStatusMenu(false);
    statusBtn.focus();
    if (!ticket || ticket.status === value) return;

    const previous = ticket.status;
    ticket.status = value;
    renderStatus(ticket);

    const ok = await setStatus(ticket.id, value);
    if (!ok) {
      ticket.status = previous;
      renderStatus(ticket);
      replyNote.textContent = "Couldn't update the status. Try again.";
      replyNote.hidden = false;
      return;
    }
    replyNote.hidden = true;
  });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".pf-status")) setStatusMenu(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !statusMenu.hidden) {
    setStatusMenu(false);
    statusBtn.focus();
  }
});

/* ---------- Message box ---------- */
document.getElementById("attach-btn").addEventListener("click", () => attachInput.click());

attachInput.addEventListener("change", () => {
  document.getElementById("attach-names").textContent = [...attachInput.files].map((f) => f.name).join(", ");
});

// Ctrl/Cmd+Enter sends (plain Enter is a new line, like an email)
replyText.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.isComposing) {
    event.preventDefault();
    replyForm.requestSubmit();
  }
});

/* Add a message once (the live feed can deliver our own message too) */
function addMessage(ticket, message) {
  const existing = ticket.messages.find((m) => m.id === message.id);
  if (!existing) {
    ticket.messages.push(message);
    return;
  }
  (message.attachments || []).forEach((file) => {
    if (!existing.attachments.some((a) => a.path === file.path)) existing.attachments.push(file);
  });
}

replyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const ticket = tickets.find((t) => t.id === selectedId);
  const text = replyText.value.trim();
  if (!ticket || !text) return;

  const files = [...attachInput.files];
  const button = replyForm.querySelector(".tk-send");
  button.disabled = true;
  const sent = await sendMessage(ticket.id, text, files);
  button.disabled = false;

  if (!sent) {
    replyNote.textContent = "Couldn't send your message. Try again.";
    replyNote.hidden = false;
    return;
  }

  addMessage(ticket, sent);
  refreshMeta(ticket);

  replyForm.reset();
  document.getElementById("attach-names").textContent = "";
  replyNote.textContent = sent.attachFailed ? "Sent, but the attachments couldn't be uploaded." : "";
  replyNote.hidden = !sent.attachFailed;

  renderDetail(ticket, true);
  renderList();
});

/* ---------- Live updates ---------- */
async function reloadTickets() {
  const data = await fetchTickets();
  if (!data) return;

  tickets = data.tickets;
  tickets.forEach(refreshMeta);
  renderList();

  const open = tickets.find((t) => t.id === selectedId);
  if (open) renderDetail(open, false);
  else if (tickets.length) selectTicket([...tickets].sort(byRecent)[0].id);
}

function liveMessage(row) {
  const ticket = tickets.find((t) => t.id === row.consultation_id);
  if (!ticket) return;

  addMessage(ticket, {
    id: row.id,
    from: row.sender_role === "professor" ? "me" : "them",
    body: row.body,
    created_at: db.stamp(row.created_at),
    attachments: [],
  });
  refreshMeta(ticket);
  renderList();
  if (ticket.id === selectedId) renderDetail(ticket, false);
}

function liveAttachment(row) {
  const ticket = tickets.find((t) => t.id === row.consultation_id);
  if (!ticket) return;

  const message = row.message_id ? ticket.messages.find((m) => m.id === row.message_id) : ticket.messages[0];
  if (!message || message.attachments.some((a) => a.path === row.path)) return;

  message.attachments.push({ name: row.file_name, path: row.path });
  if (ticket.id === selectedId) renderDetail(ticket, false);
}

function liveTicket(row) {
  const ticket = tickets.find((t) => t.id === row.id);

  // a brand new ticket from a student
  if (!ticket) {
    reloadTickets().catch((error) => console.warn("Couldn't refresh tickets.", error));
    return;
  }

  if (ticket.status === row.status) return;
  ticket.status = row.status;
  if (ticket.id === selectedId) renderDetail(ticket, false);
}

/* ---------- Go ---------- */
fetchTickets().then((data) => {
  if (!data) return;
  tickets = data.tickets;
  tickets.forEach(refreshMeta);
  renderUser(data.user);

  const wanted = Number(new URLSearchParams(location.search).get("id"));
  const first = tickets.find((t) => t.id === wanted) || [...tickets].sort(byRecent)[0];
  selectedId = first ? first.id : null;

  renderList();
  if (first) selectTicket(first.id);
  else document.getElementById("ticket-detail").hidden = true;

  db.watchThreads({ onMessage: liveMessage, onAttachment: liveAttachment, onTicket: liveTicket }).catch((error) =>
    console.warn("Live messages unavailable.", error),
  );
});
