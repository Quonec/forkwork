"use strict";
// FWSlot admin panel. All server data is inserted as text nodes (never as markup), so a hostile nickname
// or any other text can not inject HTML or script. The admin token lives in memory only.
(function () {
  let token = null;
  let roundsBefore = null;
  const EMOJI = { tomato: "🍅", avocado: "🥑", chili: "🌶", cheese: "🧀", pasta: "🍝", burger: "🍔", steak: "🥩",
                  plate: "🍽", wild: "🧑‍🍳", scatter: "🛎", ai: "🤖" };
  const $ = (id) => document.getElementById(id);

  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") e.className = v;
      else if (k === "onclick") e.addEventListener("click", v);
      else e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      e.appendChild(typeof kid === "string" || typeof kid === "number" ? document.createTextNode(String(kid)) : kid);
    }
    return e;
  }
  const money = (c) => (c / 100).toFixed(2);
  const tonText = (c) => (c / 100).toFixed(2) + " TON";
  const when = (ts) => (ts ? new Date(ts * 1000).toLocaleString() : "-");
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };

  async function api(path, body) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["X-Admin-Token"] = token;
    const r = await fetch(path, { method: "POST", headers, body: JSON.stringify(body || {}) });
    let data = {};
    try { data = await r.json(); } catch (e) { /* non-JSON error */ }
    if (r.status === 401 && token) { logout("Session expired, please log in again."); throw new Error("expired"); }
    if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
    return data;
  }
  function say(text, bad) {
    const m = $("msg"); m.textContent = text || ""; m.className = bad ? "msg err" : "msg";
    if (text) setTimeout(() => { if (m.textContent === text) m.textContent = ""; }, 6000);
  }
  async function guarded(fn) { try { return await fn(); } catch (e) { if (e.message !== "expired") say(e.message, true); } }

  // ---------------------------------------------------------------- login
  async function login() {
    $("login-msg").textContent = "";
    try {
      const d = await api("/api/admin/login", { password: $("login-pass").value });
      token = d.admin_token; $("login-pass").value = "";
      $("login").hidden = true; $("app").hidden = false;
      loadAccounts();
    } catch (e) { $("login-msg").textContent = e.message; }
  }
  function logout(msg) {
    token = null; $("app").hidden = true; $("login").hidden = false; $("panel").hidden = true;
    $("login-msg").textContent = msg || "";
  }

  // ---------------------------------------------------------------- accounts
  async function loadAccounts() {
    await guarded(async () => {
      const d = await api("/api/admin/accounts", { query: $("acc-q").value, limit: 300 });
      const tb = $("acc-table").tBodies[0]; clear(tb);
      $("acc-count").textContent = d.total + " accounts" + (d.total > d.accounts.length ? " (showing " + d.accounts.length + ")" : "");
      for (const a of d.accounts) {
        const best = a.best_win ? money(a.best_win.cents) + " (x" + a.best_win.x + ")" : "-";
        tb.appendChild(el("tr", { onclick: () => openAccount(a.key) },
          el("td", {}, a.nickname, a.online ? " ●" : ""), el("td", {}, el("span", { class: "pill " + a.status }, a.status)),
          el("td", {}, money(a.balance)), el("td", {}, tonText(a.real_balance)), el("td", {}, "R" + a.rank.demo + " / R" + a.rank.real),
          el("td", {}, a.rounds), el("td", {}, money(a.wagered)), el("td", {}, best), el("td", {}, when(a.last_login))));
      }
    });
  }

  async function openAccount(key) {
    await guarded(async () => {
      const d = await api("/api/admin/account", { key });
      const a = d.account;
      const body = $("panel-body"); clear(body);
      body.appendChild(el("h2", {}, a.nickname, " ", el("span", { class: "pill " + a.status }, a.status)));
      body.appendChild(el("div", { class: "kv box" },
        el("span", {}, "Demo balance"), el("span", {}, money(a.balance)),
        el("span", {}, "Real balance"), el("span", {}, tonText(a.real_balance) + "   (deposited " + tonText(a.deposited) + ", withdrawn " + tonText(a.withdrawn) + ", real wagered " + tonText(a.real_wagered) + ")"),
        el("span", {}, "Rounds / wagered / won (demo)"), el("span", {}, a.rounds + " / " + money(a.wagered) + " / " + money(a.won)),
        el("span", {}, "Best single win (demo)"), el("span", {}, a.best_win ? money(a.best_win.cents) + " (x" + a.best_win.x + ", bet " + money(a.best_win.bet) + ", round #" + a.best_win.round_id + ")" : "-"),
        el("span", {}, "Created / last login"), el("span", {}, when(a.created) + " / " + when(a.last_login)),
        el("span", {}, "Online / pending order"), el("span", {}, (a.online ? "yes" : "no") + " / " + (a.pending_order ? "yes" : "no")),
        el("span", {}, "Age confirmed"), el("span", {}, a.age_ok ? "yes" : "no"),
        el("span", {}, "Deposit code"), el("span", {}, d.wallet.code || "-")));
      for (const m of ["demo", "real"]) {
        const c = d.career[m];
        body.appendChild(el("div", { class: "kv box" },
          el("span", {}, m === "demo" ? "Demo career" : "Real career"), el("span", {}, "R" + c.rank + " " + c.rank_name + ", " + c.xp + " XP" + (c.xp_to ? " (next at " + c.xp_to + ")" : " (top rank)")),
          el("span", {}, "Win streak"), el("span", {}, c.streak + " now, best " + c.best_streak),
          el("span", {}, "Dishes collected"), el("span", {}, String(c.dishes || 0)),
          el("span", {}, "Free spins"), el("span", {}, c.tokens.length ? c.tokens.map((t, i) => el("span", { class: "chip" }, money(t.bet) + " (" + t.src + ") ", el("button", { onclick: () => revokeToken(a, m, i) }, "revoke"))) : "none")));
      }
      const actions = el("div", { class: "bar" });
      if (a.status === "active") actions.appendChild(el("button", { class: "danger", onclick: () => setStatus(a, "blocked") }, "Block"));
      if (a.status === "blocked") actions.appendChild(el("button", { onclick: () => setStatus(a, "active") }, "Unblock"));
      actions.appendChild(el("button", { onclick: () => adjust(a, "demo") }, "Adjust demo balance"));
      actions.appendChild(el("button", { onclick: () => adjust(a, "real") }, "Adjust real balance"));
      actions.appendChild(el("button", { onclick: () => grantToken(a) }, "Give a free spin"));
      actions.appendChild(el("button", { onclick: () => resetPw(a) }, "Reset password"));
      body.appendChild(actions);
      if (d.withdrawals.length) {
        body.appendChild(el("h3", {}, "Withdrawals"));
        body.appendChild(el("div", { class: "box" }, d.withdrawals.map((w) => el("div", {}, "#" + w.id + " " + when(w.created) + " " + tonText(w.amount_cents) + " " + w.status + (w.tx_hash ? " tx " + w.tx_hash : "")))));
      }
      body.appendChild(el("h3", {}, "Recent rounds"));
      body.appendChild(roundsTable(d.rounds, false));
      body.appendChild(el("h3", {}, "Recent rewards"));
      body.appendChild(el("div", { class: "box" }, d.rewards.length ? d.rewards.map((r) => el("div", {}, "#" + r.id + " " + when(r.ts) + " " + r.mode + " " + rewardText(r))) : el("span", { class: "muted" }, "none")));
      body.appendChild(el("h3", {}, "Admin actions on this account"));
      body.appendChild(el("div", { class: "box" }, d.audit.length ? d.audit.map((r) => el("div", {}, "#" + r.id + " " + when(r.ts) + " " + r.action + " " + auditDetail(r))) : el("span", { class: "muted" }, "none")));
      $("panel").hidden = false;
    });
  }
  function rewardText(r) {
    if (r.type === "rank_up") return "RANK UP to R" + r.rank + " " + r.name + (r.tokens ? ", +" + r.tokens + " free spin" : "");
    return "STREAK " + r.streak + (r.xp ? ", +" + r.xp + " XP" : "") + (r.tokens ? ", +" + r.tokens + " free spin" : "") + (r.capped ? " (daily cap reached)" : "") + (r.cycle ? ", cycle done" : "");
  }
  function auditDetail(r) {
    const parts = [];
    for (const k of ["wallet", "old", "new", "delta", "reason", "amount", "tx_hash", "wd_id", "name", "bet", "src"]) if (r[k] !== undefined) parts.push(k + "=" + (k === "reason" || k === "wallet" || k === "tx_hash" ? r[k] : (typeof r[k] === "number" && (k === "delta" || r.action === "adjust_balance" || k === "amount" || k === "bet") ? money(r[k]) : r[k])));
    return parts.join(" ");
  }
  function askReason(what) {
    const r = window.prompt(what + "\nReason (3-200 characters, saved in the audit log):");
    return r === null ? null : r.trim();
  }
  async function setStatus(a, status) {
    const reason = askReason((status === "blocked" ? "Block " : "Unblock ") + a.nickname + "?");
    if (!reason) return;
    await guarded(async () => { await api("/api/admin/status", { key: a.key, status, reason }); say("Status changed"); loadAccounts(); openAccount(a.key); });
  }
  async function adjust(a, wallet) {
    const cur = wallet === "real" ? tonText(a.real_balance) : money(a.balance);
    const raw = window.prompt("Adjust the " + wallet + " balance of " + a.nickname + " (current " + cur + ").\nAmount in currency units, e.g. 25.50 or -10:");
    if (raw === null) return;
    const cents = Math.round(parseFloat(raw.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents === 0) { say("Enter a non-zero amount", true); return; }
    const reason = askReason("Change the " + wallet + " balance by " + money(cents) + "?");
    if (!reason) return;
    await guarded(async () => { await api("/api/admin/adjust", { key: a.key, delta_cents: cents, reason, wallet }); say("Balance adjusted"); loadAccounts(); openAccount(a.key); });
  }
  async function grantToken(a) {
    const wallet = (window.prompt("Which wallet gets the free spin? (demo or real)") || "").trim();
    if (!wallet) return;
    const raw = window.prompt("Value of the free spin as a bet, 0.20 / 0.50 / 1.00:");
    if (raw === null) return;
    const bet = Math.round(parseFloat(raw.replace(",", ".")) * 100);
    const reason = askReason("Give " + a.nickname + " a free spin of " + money(bet) + " (" + wallet + ")?");
    if (!reason) return;
    await guarded(async () => { await api("/api/admin/grant_token", { key: a.key, wallet, bet_cents: bet, reason }); say("Free spin given"); openAccount(a.key); });
  }
  async function revokeToken(a, wallet, index) {
    const reason = askReason("Take back this free spin of " + a.nickname + "?");
    if (!reason) return;
    await guarded(async () => { await api("/api/admin/revoke_token", { key: a.key, wallet, index, reason }); say("Free spin revoked"); openAccount(a.key); });
  }
  async function resetPw(a) {
    const reason = askReason("Reset the password of " + a.nickname + "? The old password and open sessions stop working.");
    if (!reason) return;
    await guarded(async () => {
      const d = await api("/api/admin/reset_password", { key: a.key, reason });
      window.prompt("Temporary password for " + a.nickname + " (shown only now - give it to the player):", d.temporary_password);
      say("Password reset"); loadAccounts();
    });
  }

  // ---------------------------------------------------------------- rounds
  function roundsTable(rows, withPlayer) {
    const t = el("table", {}, el("thead", {}, el("tr", {}, ...["#", "Time", withPlayer ? "Player" : null, "Kind", "Bet", "Win", "x bet", "Info"].map((h) => (h === null ? null : el("th", {}, h))))));
    const tb = el("tbody");
    for (const r of rows) tb.appendChild(roundRow(r, withPlayer));
    t.appendChild(tb);
    return t;
  }
  function roundRow(r, withPlayer) {
    const vanName = (i) => (i === 0 ? "left" : "right");
    const info = r.kind === "order" ? (r.order + (r.accepted ? "" : " declined") + (r.dinner ? " DINNER" : "") + " (spin #" + r.spin_id + ")")
      : r.kind === "gamble" ? ("double-up step " + (r.step + 1) + ": picked " + vanName(r.pick) + ", van " + vanName(r.hidden) + (r.won ? " WON" : " lost") + " (stake " + money(r.stake_cents) + ", after #" + r.prev_id + ")")
      : (r.bonus && r.bonus.length ? r.bonus.join("+") : "") + (r.orders ? " orders" : "");
    return el("tr", { onclick: () => openRound(r.id) },
      el("td", {}, r.id), el("td", {}, when(r.ts)), withPlayer ? el("td", {}, r.nick || "") : null, el("td", {}, r.kind + (r.mode === "real" ? " (REAL)" : "")),
      el("td", {}, money(r.bet)), el("td", {}, money(r.win_cents)), el("td", {}, r.x), el("td", {}, info));
  }
  async function loadRounds(more) {
    await guarded(async () => {
      const kinds = $("rd-kind").value.split(",");
      const min = $("rd-min").value;
      const body = { kinds, limit: 50 };
      if ($("rd-player").value.trim()) body.player = $("rd-player").value.trim();
      if (min !== "") body.min_win = parseInt(min, 10);
      if (more && roundsBefore) body.before = roundsBefore;
      const d = await api("/api/admin/journal", body);
      const tb = $("rd-table").tBodies[0];
      if (!more) clear(tb);
      for (const r of d.records) tb.appendChild(roundRow(r, true));
      if (d.records.length) roundsBefore = d.records[d.records.length - 1].id;
      say(d.records.length + " rounds loaded");
    });
  }

  // ---------------------------------------------------------------- replay
  function gridView(grid, wins, label) {
    const winCells = new Set();
    for (const w of wins || []) for (const c of w.cells) winCells.add(c[0] + "_" + c[1]);
    const g = el("div", { class: "grid5", title: label || "" });
    for (let row = 0; row < 3; row++) for (let reel = 0; reel < 5; reel++) {
      const s = grid[reel][row];
      g.appendChild(el("div", { class: "cell" + (winCells.has(reel + "_" + row) ? " win" : "") + (s === "wild" ? " wild" : ""), title: s }, EMOJI[s] || s));
    }
    return g;
  }
  function winsText(wins) {
    return wins.length ? wins.map((w) => "line " + (w.line + 1) + ": " + w.count + "x " + w.symbol + " = " + w.x.toFixed(3) + "x").join("; ") : "no line wins";
  }
  function rushView(rnd, title) {
    const box = el("div", { class: "box" }, el("b", {}, title + " - total x" + rnd.total_x.toFixed(2) + ", start multiplier x" + rnd.start_multiplier));
    rnd.spins.forEach((sp, i) => {
      const notes = [];
      if (sp.sticky.length) notes.push("held wilds: " + sp.sticky.length);
      if (sp.converted.length) notes.push("AI converted: " + sp.converted.map((c) => c[2]).join(","));
      if (sp.wild_reels.length) notes.push("wild reels: " + sp.wild_reels.map((r) => r + 1).join(","));
      if (sp.spin_multiplier > 1) notes.push("spin multiplier x" + sp.spin_multiplier);
      if (sp.recipes_done) notes.push("recipes +" + sp.recipes_done);
      if (sp.extra_spin) notes.push("+1 spin");
      box.appendChild(el("div", {}, gridView(sp.grid, sp.wins, "spin " + (i + 1)),
        el("div", {}, el("b", {}, "Spin " + (i + 1)), "  M x" + sp.multiplier + "  win " + sp.spin_x.toFixed(3) + "x  total " + sp.total_x.toFixed(3) + "x"),
        el("div", { class: "muted" }, winsText(sp.wins)), el("div", { class: "muted" }, notes.join(" | ")), el("div", { style: "clear:both" })));
    });
    return box;
  }
  async function openRound(id) {
    await guarded(async () => {
      const d = await api("/api/admin/round", { id });
      const r = d.record, v = d.verification;
      const body = $("panel-body"); clear(body);
      body.appendChild(el("h2", {}, "Round #" + r.id + " (" + r.kind + ")"));
      body.appendChild(el("div", { class: "kv box" },
        el("span", {}, "Time"), el("span", {}, when(r.ts)), el("span", {}, "Player"), el("span", {}, r.nick),
        el("span", {}, "Level / bet"), el("span", {}, "RTP " + r.profile + "% / " + money(r.bet)),
        el("span", {}, "Win"), el("span", {}, money(r.win_cents)),
        el("span", {}, "Balance"), el("span", {}, money(r.balance_before) + " -> " + money(r.balance_after))));
      const failed = v.checks.filter((c) => !c.ok);
      body.appendChild(el("div", { class: "box" },
        el("b", { class: failed.length ? "err" : "ok" }, failed.length ? "VERIFICATION FAILED (" + failed.length + " of " + v.checks.length + ")" : "Verified: all " + v.checks.length + " independent checks passed"),
        el("div", { class: "muted" }, "The server recomputed screens from the reel stops, line wins, multipliers, recipe points, totals and cents from the record."),
        failed.map((c) => el("div", { class: "check err" }, "✘ " + c.name + (c.detail ? " - " + c.detail : "")))));
      if (d.linked_order_id) body.appendChild(el("div", {}, "Order of this round: ", el("button", { onclick: () => openRound(d.linked_order_id) }, "open #" + d.linked_order_id)));
      if (r.kind === "gamble") {
        const vn = (i) => (i === 0 ? "left van" : "right van");
        body.appendChild(el("div", { class: "box" }, el("b", {}, "Double-up, step " + (r.step + 1)),
          el("div", {}, "Stake " + money(r.stake_cents) + " (the win of round #" + r.prev_id + "). Picked the " + vn(r.pick) + ", the item was in the " + vn(r.hidden) + ": " + (r.won ? "WON, " + money(r.result_cents) + " now" : "lost the stake")),
          el("div", { class: "muted" }, "Round of the stake: "), el("button", { onclick: () => openRound(r.prev_id) }, "open #" + r.prev_id)));
      } else if (r.kind === "spin") {
        const sp = r.spin;
        body.appendChild(el("div", { class: "box" }, el("b", {}, "Paid spin - stops " + sp.stops.join(", ")), el("div", {}, gridView(sp.grid, sp.wins), el("div", {}, winsText(sp.wins)),
          el("div", { class: "muted" }, "recipe progress: " + sp.recipe.join(" / ") + "   scatters " + sp.scatters + ", AI " + sp.ai)), el("div", { style: "clear:both" })));
        for (const rw of sp.rewards) {
          body.appendChild(el("div", { class: "box" }, el("b", {}, "Recipe #" + rw.recipe_in_cycle + " completed: instant " + rw.instant_x + "x" + (rw.free_spin ? ", free spin x" + rw.free_spin.multiplier : "") + (rw.rush ? ", Chef's Rush" : ""))));
          if (rw.free_spin) body.appendChild(el("div", { class: "box" }, el("b", {}, "Free spin x" + rw.free_spin.multiplier + " - win " + rw.free_spin.win_x.toFixed(3) + "x"), el("div", {}, gridView(rw.free_spin.grid, rw.free_spin.wins), el("div", {}, winsText(rw.free_spin.wins))), el("div", { style: "clear:both" })));
          if (rw.rush) body.appendChild(rushView(rw.rush, "Chef's Rush"));
        }
        body.appendChild(el("div", { class: "muted" }, "Credited " + r.credited_x.toFixed(3) + "x bet = " + money(r.win_cents) + (r.orders_pending ? " (+ order, see linked round)" : "")));
      } else {
        const res = r.result;
        body.appendChild(el("div", { class: "box" }, el("b", {}, "Order " + r.order_id + (res.accepted ? (res.dinner ? " - CHEF'S DINNER" : " - accepted") : " - declined (tip)")),
          el("div", {}, "final " + res.final_x.toFixed(3) + "x" + (res.final_x_uncapped !== res.final_x ? " (cap room left, uncapped " + res.final_x_uncapped.toFixed(3) + "x)" : "")
            + (res.accepted ? "; range " + res.floor_x + "-" + res.ceiling_x + "x" + (res.topped_up ? "; topped up to the minimum" : "") : ""))));
        if (res.round) body.appendChild(rushView(res.round, "Order round"));
        body.appendChild(el("div", { class: "muted" }, "Linked paid spin: #" + r.spin_id));
      }
      $("panel").hidden = false;
    });
  }

  // ---------------------------------------------------------------- wallet cabinet
  async function loadWallet() {
    await guarded(async () => {
      const d = await api("/api/admin/wallet", {});
      const ov = $("wl-overview"); clear(ov);
      if (!d.enabled) {
        ov.appendChild(el("b", {}, "The TON wallet is switched off on this server."));
        ov.appendChild(el("div", { class: "muted" }, "Start the server with --wallet mock (development) or --wallet ton --ton-address <address> (TON Center)."));
        $("wl-sim").hidden = true;
      } else {
        const t = d.totals, l = d.limits;
        ov.appendChild(el("div", { class: "kv" },
          el("span", {}, "Provider / network"), el("span", {}, d.provider + " / " + d.network),
          el("span", {}, "Deposit address"), el("span", {}, d.address),
          el("span", {}, "Deposited / withdrawn"), el("span", {}, tonText(t.deposited_cents) + " / " + tonText(t.withdrawn_cents)),
          el("span", {}, "Waiting for payment"), el("span", {}, t.pending_count + " withdrawals, " + tonText(t.pending_cents)),
          el("span", {}, "Players hold (real)"), el("span", {}, tonText(t.player_real_balances_cents)),
          el("span", {}, "Unmatched transfers"), el("span", {}, String(t.unmatched_count)),
          el("span", {}, "Limits"), el("span", {}, "deposit from " + tonText(l.min_deposit_cents) + ", withdrawal " + tonText(l.min_withdraw_cents) + " - " + tonText(l.max_withdraw_cents) + ", " + tonText(l.daily_withdraw_cents) + " a day, bet up to " + tonText(l.max_bet_cents) + ", wagering x" + l.wager_mult),
          el("span", {}, "Chain cursor"), el("span", {}, d.cursor === null ? "-" : String(d.cursor))));
        $("wl-sim").hidden = d.provider !== "mock";
      }
      await loadWithdrawals();
      await loadDeposits();
    });
  }
  async function loadWithdrawals() {
    const d = await api("/api/admin/withdrawals", { status: $("wd-status").value || null, limit: 200 });
    const tb = $("wd-table").tBodies[0]; clear(tb);
    for (const w of d.withdrawals) {
      const acts = el("td", {});
      if (w.status === "pending") {
        acts.appendChild(el("button", { onclick: (e) => { e.stopPropagation(); markPaid(w); } }, "Mark as paid"));
        acts.appendChild(el("button", { class: "danger", onclick: (e) => { e.stopPropagation(); rejectWd(w); } }, "Reject"));
      } else if (w.tx_hash) acts.appendChild(document.createTextNode("tx " + w.tx_hash));
      else if (w.note) acts.appendChild(document.createTextNode(w.note));
      tb.appendChild(el("tr", {}, el("td", {}, w.id), el("td", {}, when(w.created)), el("td", {}, w.nick), el("td", {}, tonText(w.amount_cents)),
        el("td", { class: "mono" }, w.address), el("td", {}, tonText(w.player_turnover || 0) + " / " + tonText(w.player_deposited || 0)),
        el("td", {}, el("span", { class: "pill " + w.status }, w.status)), acts));
    }
  }
  async function markPaid(w) {
    const h = window.prompt("Withdrawal #" + w.id + ": " + tonText(w.amount_cents) + " to\n" + w.address + "\n\nSend it from your own wallet first, then enter the transaction hash:");
    if (h === null || !h.trim()) return;
    const note = window.prompt("Note (optional):") || "";
    await guarded(async () => { await api("/api/admin/withdraw_paid", { id: w.id, tx_hash: h.trim(), note }); say("Recorded as paid"); loadWallet(); });
  }
  async function rejectWd(w) {
    const reason = askReason("Reject withdrawal #" + w.id + " of " + tonText(w.amount_cents) + "? The amount goes back to the player.");
    if (!reason) return;
    await guarded(async () => { await api("/api/admin/withdraw_reject", { id: w.id, reason }); say("Rejected, refunded"); loadWallet(); });
  }
  async function loadDeposits() {
    const d = await api("/api/admin/deposits", { limit: 50 });
    const tb = $("um-table").tBodies[0]; clear(tb);
    for (const u of d.unmatched) {
      tb.appendChild(el("tr", {}, el("td", { class: "mono" }, u.tx), el("td", {}, tonText(Math.floor(u.nano / 10000000))), el("td", {}, u.comment || "(none)"), el("td", { class: "mono" }, u.source),
        el("td", {}, el("button", { onclick: (e) => { e.stopPropagation(); assignDeposit(u); } }, "Assign to a player"))));
    }
    const dt = $("dp-table").tBodies[0]; clear(dt);
    for (const r of d.deposits) {
      dt.appendChild(el("tr", {}, el("td", {}, r.id), el("td", {}, when(r.ts)), el("td", {}, r.nick || ""), el("td", {}, r.event), el("td", {}, tonText(r.amount_cents)), el("td", { class: "mono" }, r.tx || "")));
    }
  }
  async function assignDeposit(u) {
    const key = window.prompt("Credit transfer " + u.tx + " (comment: " + (u.comment || "none") + ") to which player?\nExact nickname key (lower case):");
    if (!key) return;
    const reason = askReason("Credit it to " + key + "?");
    if (!reason) return;
    await guarded(async () => { const d = await api("/api/admin/assign_deposit", { tx: u.tx, key: key.trim(), reason }); say("Credited " + tonText(d.credited_cents)); loadWallet(); });
  }
  async function scanNow() {
    await guarded(async () => {
      const d = await api("/api/admin/scan", {});
      const s = d.scan;
      $("wl-note").textContent = !s.enabled ? "wallet is off" : s.error ? "chain error: " + s.error : "credited " + s.credited + ", unmatched " + s.unmatched + ", ignored " + s.ignored + ", waiting " + s.waiting;
      loadWallet();
    });
  }
  async function reconcile() {
    await guarded(async () => {
      const d = await api("/api/admin/reconcile", {});
      const box = $("wl-books"); clear(box);
      if (!d.mismatches.length) box.appendChild(el("div", { class: "box ok" }, "The books close: every balance of " + d.players + " accounts equals what its " + d.records + " journal records add up to."));
      else box.appendChild(el("div", { class: "box err" }, el("b", {}, d.mismatches.length + " balance(s) differ from the journal:"), d.mismatches.map((m) => el("div", {}, m.player + " (" + m.wallet + "): stored " + money(m.stored) + ", derived " + money(m.derived) + ", difference " + money(m.difference)))));
    });
  }
  async function simulate() {
    const key = window.prompt("Development only: simulate a transfer for which player? (nickname key)");
    if (!key) return;
    const raw = window.prompt("Amount in TON, e.g. 12.5:");
    if (raw === null) return;
    const cents = Math.round(parseFloat(raw.replace(",", ".")) * 100);
    await guarded(async () => { await api("/api/admin/simulate_deposit", { key: key.trim(), amount_cents: cents }); say("Transfer simulated and credited"); loadWallet(); });
  }

  // ---------------------------------------------------------------- rewards cabinet
  async function loadRewards() {
    await guarded(async () => {
      const s = await api("/api/admin/settings", {});
      const box = $("rw-settings"); clear(box);
      const row = (label, on, name) => el("div", { class: "bar" }, el("b", {}, label), el("span", { class: on ? "ok" : "err" }, on ? "ON" : "OFF"),
        el("button", { onclick: () => toggleSetting(name, !on) }, on ? "Turn off" : "Turn on"));
      box.appendChild(row("Free spins for ranks and win streaks", s.rewards_enabled, "rewards"));
      box.appendChild(row("Double-up (guess the van)", s.gamble_enabled, "gamble"));
      box.appendChild(el("div", { class: "muted" }, "Run-time switches: after a restart the command-line flags (--no-rewards, --no-gamble) apply again. Real-money wallet: " + (s.wallet_enabled ? "on" : "off") + "."));
      const rules = $("rw-rules"); clear(rules);
      rules.appendChild(el("table", {}, el("thead", {}, el("tr", {}, el("th", {}, "Rank"), el("th", {}, "Name"), el("th", {}, "XP from"), el("th", {}, "Free spins at rank-up"))),
        el("tbody", {}, s.ranks.map((r) => el("tr", {}, el("td", {}, r.n), el("td", {}, r.name), el("td", {}, r.xp), el("td", {}, s.rank_up_tokens[r.n] || "-"))))));
      rules.appendChild(el("div", {}, "XP: 1 per " + money(s.xp_unit_cents) + " wagered in a paid round. Win streak (consecutive paid rounds that pay): " +
        s.streak_steps.map((st) => st.at + " wins " + (st.tokens ? "= " + st.tokens + " free spin" + (st.tokens > 1 ? "s" : "") : "= +" + st.xp + " XP") + (st.reset ? ", then the streak starts again" : "")).join("; ") + "."));
      rules.appendChild(el("div", { class: "muted" }, "A free spin is a paid spin at a fixed bet (at most " + money(s.token_max_bet_cents) + ") that is not charged. At most " + s.tokens_per_day + " are earned per player a day. Free spins are promotional spend and are NOT part of the RTP of the profiles."));
      const d = await api("/api/admin/journal", { kinds: ["reward"], limit: 100 });
      const tb = $("rw-table").tBodies[0]; clear(tb);
      for (const r of d.records) tb.appendChild(el("tr", {}, el("td", {}, r.id), el("td", {}, when(r.ts)), el("td", {}, r.nick || ""), el("td", {}, r.mode), el("td", {}, rewardText(r)), el("td", {}, "#" + r.round_id)));
    });
  }
  async function toggleSetting(name, value) {
    await guarded(async () => { const body = {}; body[name] = value; await api("/api/admin/settings", body); say("Setting changed"); loadRewards(); });
  }

  // ---------------------------------------------------------------- audit
  async function loadAudit() {
    await guarded(async () => {
      const d = await api("/api/admin/journal", { kinds: ["admin", "auth", "wallet"], limit: 200 });
      const tb = $("au-table").tBodies[0]; clear(tb);
      for (const r of d.records) {
        const det = Object.entries(r).filter(([k]) => !["id", "ts", "kind", "event", "action", "target", "nick"].includes(k)).map(([k, v]) => k + "=" + v).join(" ");
        tb.appendChild(el("tr", {}, el("td", {}, r.id), el("td", {}, when(r.ts)), el("td", {}, r.kind), el("td", {}, r.event || r.action || ""), el("td", {}, r.target || r.player || ""), el("td", {}, det)));
      }
    });
  }

  // ---------------------------------------------------------------- wiring
  function tab(name) {
    for (const t of ["accounts", "rounds", "wallet", "rewards", "audit"]) $("tab-" + t).hidden = t !== name;
    document.querySelectorAll("button.tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    $("panel").hidden = true;
    if (name === "audit") loadAudit();
    if (name === "wallet") loadWallet();
    if (name === "rewards") loadRewards();
    if (name === "rounds" && !$("rd-table").tBodies[0].firstChild) loadRounds(false);
  }
  document.querySelectorAll("button.tab").forEach((b) => b.addEventListener("click", () => tab(b.dataset.tab)));
  $("wd-go").addEventListener("click", () => guarded(loadWithdrawals));
  $("wl-scan").addEventListener("click", scanNow);
  $("wl-reconcile").addEventListener("click", reconcile);
  $("wl-sim").addEventListener("click", simulate);
  $("login-btn").addEventListener("click", login);
  $("login-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
  $("logout").addEventListener("click", () => logout(""));
  $("acc-go").addEventListener("click", loadAccounts);
  $("acc-q").addEventListener("keydown", (e) => { if (e.key === "Enter") loadAccounts(); });
  $("rd-go").addEventListener("click", () => { roundsBefore = null; loadRounds(false); });
  $("rd-more").addEventListener("click", () => loadRounds(true));
  $("au-go").addEventListener("click", loadAudit);
  $("panel-close").addEventListener("click", () => { $("panel").hidden = true; });
})();
