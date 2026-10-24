(() => {
  const user = document.querySelector(".dash-user");
  if (!user || !window.db) return;

  // pages already link notifications.css in <head>; this is only a fallback
  if (!document.querySelector('link[href="notifications.css"]')) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "notifications.css";
    document.head.append(css);
  }

  const BELL =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5a1.4 1.4 0 0 1 1.4 1.4v.6c2.8.6 4.6 3 4.6 6v3.6l1.8 2.7c.4.6 0 1.4-.8 1.4H5c-.8 0-1.2-.8-.8-1.4L6 14.1v-3.6c0-3 1.8-5.4 4.6-6v-.6A1.4 1.4 0 0 1 12 2.5Zm-2.2 16.2h4.4a2.2 2.2 0 0 1-4.4 0Z"></path></svg>';

  /* ---------- Markup ---------- */
  let side = user.closest(".dash-side");
  if (!side) {
    side = document.createElement("div");
    side.className = "dash-side";
    user.before(side);
    side.append(user);
  }

  let bell = side.querySelector(".dash-bell");
  if (!bell) {
    bell = document.createElement("button");
    bell.type = "button";
    bell.className = "dash-bell";
    bell.innerHTML = BELL;
  }

  const wrap = document.createElement("div");
  wrap.className = "dash-notif";
  side.prepend(wrap);

  const badge = document.createElement("span");
  badge.className = "notif-badge";
  badge.hidden = true;
  badge.setAttribute("aria-hidden", "true");
  bell.append(badge);

  const panel = document.createElement("section");
  panel.className = "notif-panel";
  panel.id = "notif-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Notifications");

  const head = document.createElement("header");
  head.className = "notif-head";
  const title = document.createElement("h2");
  title.textContent = "Notifications";
  const readAll = document.createElement("button");
  readAll.type = "button";
  readAll.className = "notif-readall";
  readAll.textContent = "Mark all as read";
  head.append(title, readAll);

  const list = document.createElement("ul");
  list.className = "notif-list";

  panel.append(head, list);
  wrap.append(bell, panel);

  bell.setAttribute("aria-haspopup", "true");
  bell.setAttribute("aria-expanded", "false");
  bell.setAttribute("aria-controls", "notif-panel");

  /* ---------- State ---------- */
  let items = [];
  let unread = 0;

  function ago(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "now";
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    if (s < 604800) return `${Math.floor(s / 86400)}d`;
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
  }

  function render() {
    badge.hidden = unread === 0;
    badge.textContent = unread > 9 ? "9+" : String(unread);
    bell.setAttribute("aria-label", unread ? `Notifications, ${unread} unread` : "Notifications");
    readAll.disabled = unread === 0;

    list.replaceChildren();

    if (!items.length) {
      const empty = document.createElement("li");
      empty.className = "notif-empty";
      empty.textContent = "No notifications yet.";
      list.append(empty);
      return;
    }

    items.forEach((n) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `notif-item${n.read_at ? "" : " is-unread"}`;

      const dot = document.createElement("span");
      dot.className = "notif-dot";
      dot.setAttribute("aria-hidden", "true");

      const text = document.createElement("span");
      text.textContent = n.message;

      const time = document.createElement("time");
      time.dateTime = n.created_at;
      time.textContent = ago(n.created_at);

      btn.append(dot, text, time);
      btn.addEventListener("click", () => openItem(n));
      li.append(btn);
      list.append(li);
    });
  }

  async function openItem(n) {
    if (!n.read_at) {
      n.read_at = new Date().toISOString();
      unread = Math.max(0, unread - 1);
      render();
      try {
        await db.markRead(n.id);
      } catch (error) {
        console.warn("Couldn't mark notification as read.", error);
      }
    }
    if (n.link) window.location.href = n.link;
  }

  function setOpen(open) {
    panel.hidden = !open;
    bell.setAttribute("aria-expanded", String(open));
  }

  bell.addEventListener("click", () => setOpen(panel.hidden));

  readAll.addEventListener("click", async () => {
    items.forEach((n) => (n.read_at = n.read_at || new Date().toISOString()));
    unread = 0;
    render();
    try {
      await db.markAllRead();
    } catch (error) {
      console.warn("Couldn't mark all as read.", error);
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".dash-notif")) setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      setOpen(false);
      bell.focus();
    }
  });

  /* ---------- Load + live updates ---------- */
  render();

  (async () => {
    try {
      [items, unread] = await Promise.all([db.listNotifications(20), db.unreadCount()]);
      render();

      await db.watchNotifications((n) => {
        items = [n, ...items].slice(0, 20);
        unread += 1;
        render();
      });
    } catch (error) {
      console.warn("Notifications unavailable.", error);
    }
  })();
})();
