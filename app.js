/* =========================================================================
   Oh Stuffing! — scorekeeper
   Scoring: hit your bid exactly -> 10 + tricks made ; miss -> just tricks made.
   Hand sizes ramp: N ones, up 2..max, down max-1..2, N ones  (max = 52 // N).
   Dealer rotates each round and may not make total bids == cards dealt.
   ========================================================================= */
(() => {
  "use strict";

  const DECK = 52;
  const KEY = "oh-stuffing-v1";
  const SUITS = ["♠", "♥", "♦", "♣"];

  // ---------- state ----------
  let S = load() || freshSetup();

  function freshSetup() {
    return {
      phase: "setup",                 // setup | reorder | playing | finished
      players: [{ id: pid(), name: "" }, { id: pid(), name: "" }, { id: pid(), name: "" }],
      rounds: [],
      current: 0,
      data: {},                       // { roundIdx: { bids:{pid:n}, made:{pid:n} } }
      times: { list: [], last: null },// completed-round durations (ms) + last advance stamp
    };
  }
  function pid() { return "p" + Math.random().toString(36).slice(2, 9); }

  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }

  // ---------- rules ----------
  function maxHand(n) { return Math.max(1, Math.floor(DECK / n)); }

  function genRounds(n) {
    const mx = maxHand(n);
    const r = [];
    for (let i = 0; i < n; i++) r.push(1);          // leading ones
    for (let c = 2; c <= mx; c++) r.push(c);         // climb
    for (let c = mx - 1; c >= 2; c--) r.push(c);     // descend
    for (let i = 0; i < n; i++) r.push(1);          // trailing ones
    return r;
  }

  function roundPoints(bid, made) {
    if (bid == null || made == null) return null;
    return bid === made ? 10 + made : made;
  }

  // dealer for a round index rotates through play order
  function dealerIndex(roundIdx) { return roundIdx % S.players.length; }

  // cumulative total for a player through (and including) round r
  function totalThrough(playerId, r) {
    let t = 0;
    for (let i = 0; i <= r; i++) {
      if (!roundComplete(i)) continue;   // don't count a round mid-play
      const d = S.data[i];
      t += roundPoints(d.bids[playerId] ?? 0, d.made[playerId] ?? 0);
    }
    return t;
  }

  // ranks (1 = best) for a set of {id,total}; ties share the lower number
  function rankMap(rows) {
    const sorted = [...rows].sort((a, b) => b.total - a.total);
    const map = {};
    let lastVal = null, lastRank = 0;
    sorted.forEach((row, i) => {
      const rank = (row.total === lastVal) ? lastRank : i + 1;
      map[row.id] = rank; lastVal = row.total; lastRank = rank;
    });
    return map;
  }

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = document.getElementById.bind(document);
  const esc = (s) => (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const suitFor = (i) => SUITS[i % 4];
  const isRed = (i) => (i % 4) === 1 || (i % 4) === 2;
  function nameOf(p, i) { return p.name.trim() || `Player ${i + 1}`; }

  let toastT;
  function toast(msg) {
    const t = el("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1900);
  }

  // ---------- tabs (mobile) ----------
  function setTab(name) { document.body.dataset.tab = name; syncTabs(); }
  function syncTabs() {
    document.querySelectorAll(".tab").forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.tabTarget === document.body.dataset.tab)));
  }
  document.querySelectorAll(".tab").forEach((b) =>
    b.addEventListener("click", () => setTab(b.dataset.tabTarget)));

  el("btn-newgame").addEventListener("click", () => {
    if (S.phase !== "setup" && !confirm("Start a brand new game? Current scores will be cleared.")) return;
    S = freshSetup(); save(); setTab("entry"); render();
  });

  // ---------- light / dark theme ----------
  const THEME_KEY = "oh-stuffing-theme";
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    const b = el("btn-theme");
    if (b) b.textContent = t === "light" ? "🌙" : "☀️"; // show the theme you'll switch to
  }
  let theme = localStorage.getItem(THEME_KEY);
  if (theme !== "light" && theme !== "dark") {
    theme = (window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
  }
  applyTheme(theme);
  el("btn-theme").addEventListener("click", () => {
    theme = theme === "light" ? "dark" : "light";
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    applyTheme(theme);
  });

  // =========================================================================
  //  RENDER
  // =========================================================================
  function render() {
    syncTabs();
    if (S.phase === "setup") renderSetup();
    else if (S.phase === "reorder") renderReorder();
    else renderPlay();          // playing + finished share the entry column
    renderBoard();
  }

  // ---------- SETUP ----------
  function renderSetup() {
    const n = S.players.length;
    const rounds = genRounds(Math.max(n, 1));
    const canDone = n >= 2;

    const rows = S.players.map((p, i) => `
      <div class="pin-row" data-id="${p.id}">
        <span class="pin-grip">${suitFor(i)}</span>
        <input class="pin-input" type="text" value="${esc(p.name)}"
               placeholder="Player ${i + 1}" maxlength="18" autocomplete="off" />
        <button class="pin-x" title="Remove" ${n <= 2 ? "disabled" : ""}>×</button>
      </div>`).join("");

    el("panel-entry").innerHTML = `
      <h2 class="sec-title"><span class="suit">♣</span> Who's playing?</h2>
      <p class="sec-sub">Add everyone at the table — the rounds adjust automatically.</p>
      <div class="player-inputs">${rows}</div>
      <button class="add-btn" id="add-player">＋ Add player</button>
      <div class="preview">
        <span class="chip">👥 <b>${n}</b> players</span>
        <span class="chip">🃏 up to <b>${maxHand(Math.max(n,1))}</b> cards</span>
        <span class="chip cyan">🔁 <b>${rounds.length}</b> rounds</span>
      </div>
      <button class="primary-btn" id="done-players" ${canDone ? "" : "disabled"}>
        ${canDone ? "Done — set the order →" : "Add another player"}
      </button>`;

    // wire inputs WITHOUT re-rendering (keep focus while typing)
    $("#panel-entry").querySelectorAll(".pin-row").forEach((row) => {
      const id = row.dataset.id;
      row.querySelector(".pin-input").addEventListener("input", (e) => {
        const p = S.players.find((x) => x.id === id); if (p) { p.name = e.target.value; save(); }
        updateSetupPreview();
      });
      row.querySelector(".pin-x").addEventListener("click", () => {
        if (S.players.length <= 2) return;
        S.players = S.players.filter((x) => x.id !== id); save(); renderSetup(); renderBoard();
      });
    });
    el("add-player").addEventListener("click", () => {
      if (S.players.length >= 10) return toast("10 players is plenty! 🎉");
      S.players.push({ id: pid(), name: "" }); save(); renderSetup(); renderBoard();
      const inputs = $("#panel-entry").querySelectorAll(".pin-input");
      inputs[inputs.length - 1]?.focus();
    });
    el("done-players").addEventListener("click", () => {
      S.players.forEach((p, i) => { if (!p.name.trim()) p.name = `Player ${i + 1}`; });
      S.phase = "reorder"; save(); render();
    });
  }

  function updateSetupPreview() {
    const btn = el("done-players");
    if (btn) {
      const ok = S.players.length >= 2;
      btn.disabled = !ok;
      btn.textContent = ok ? "Done — set the order →" : "Add another player";
    }
  }

  // ---------- REORDER ----------
  function renderReorder() {
    const items = S.players.map((p, i) => `
      <div class="order-item ${i === 0 ? "dealer-first" : ""}" draggable="true" data-idx="${i}">
        <span class="oi-num">${i + 1}</span>
        <span class="oi-name">${suitFor(i)} ${esc(p.name)}
          ${i === 0 ? '<span class="dealer-chip">DEALS FIRST</span>' : ""}</span>
        <span class="oi-arrows">
          <button data-move="up" ${i === 0 ? "disabled" : ""}>↑</button>
          <button data-move="down" ${i === S.players.length - 1 ? "disabled" : ""}>↓</button>
        </span>
      </div>`).join("");

    el("panel-entry").innerHTML = `
      <h2 class="sec-title"><span class="suit red">♥</span> Playing order</h2>
      <p class="sec-sub">Drag or use arrows. Dealer rotates from the top each round.</p>
      <div class="order-list" id="order-list">${items}</div>
      <p class="mini-note">🃏 ${genRounds(S.players.length).length} rounds • dealer can't bid the number that makes total bids = the hand size.</p>
      <div class="btn-row">
        <button class="sub-btn" id="back-setup">← Edit</button>
        <button class="primary-btn" id="start-game" style="margin-top:0">Start game! 🎉</button>
      </div>`;

    const list = el("order-list");
    list.querySelectorAll(".order-item").forEach((it) => {
      const idx = +it.dataset.idx;
      it.querySelector('[data-move="up"]').addEventListener("click", () => move(idx, -1));
      it.querySelector('[data-move="down"]').addEventListener("click", () => move(idx, 1));
      it.addEventListener("dragstart", (e) => { dragFrom = idx; it.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
      it.addEventListener("dragend", () => it.classList.remove("dragging"));
      it.addEventListener("dragover", (e) => e.preventDefault());
      it.addEventListener("drop", (e) => { e.preventDefault(); if (dragFrom != null && dragFrom !== idx) reorder(dragFrom, idx); dragFrom = null; });
    });
    el("back-setup").addEventListener("click", () => { S.phase = "setup"; save(); render(); });
    el("start-game").addEventListener("click", startGame);
  }

  let dragFrom = null;
  function move(i, dir) {
    const j = i + dir; if (j < 0 || j >= S.players.length) return;
    [S.players[i], S.players[j]] = [S.players[j], S.players[i]]; save(); renderReorder(); renderBoard();
  }
  function reorder(from, to) {
    const [it] = S.players.splice(from, 1); S.players.splice(to, 0, it); save(); renderReorder(); renderBoard();
  }

  function startGame() {
    S.rounds = genRounds(S.players.length);
    S.current = 0;
    S.data = {};
    S.times = { list: [], last: Date.now() };
    S.phase = "playing";
    save(); setTab("entry"); render();
  }

  // ---------- PLAY / FINISHED (entry column) ----------
  function ensureRound(r) {
    if (!S.data[r]) S.data[r] = { bids: {}, made: {} };
    const d = S.data[r];
    // materialize the shown "0" defaults so an untouched bid/made of 0 scores correctly
    S.players.forEach((p) => { if (d.bids[p.id] == null) d.bids[p.id] = 0; if (d.made[p.id] == null) d.made[p.id] = 0; });
    return d;
  }

  // a round only counts once the tricks won add up to the cards dealt
  function roundComplete(r) {
    const d = S.data[r]; if (!d) return false;
    const sumMade = S.players.reduce((a, p) => a + (d.made?.[p.id] || 0), 0);
    return sumMade === S.rounds[r];
  }

  function renderPlay() {
    if (S.phase === "finished") return renderFinishedEntry();

    const r = S.current;
    const cards = S.rounds[r];
    const total = S.rounds.length;
    const d = ensureRound(r);
    const dealer = dealerIndex(r);

    const sumBids = S.players.reduce((a, p) => a + (d.bids[p.id] || 0), 0);
    const sumMade = S.players.reduce((a, p) => a + (d.made[p.id] || 0), 0);
    const madeOk = sumMade === cards;
    const bidsBlocked = sumBids === cards; // forbidden: total bids must not equal hand size

    const rows = S.players.map((p, i) => {
      const bid = d.bids[p.id] || 0, made = d.made[p.id] || 0;
      const exact = (d.made[p.id] != null) && bid === made;
      const isDealer = i === dealer;
      const dealerForbids = isDealer && bidsBlocked;
      return `
        <div class="prow ${isDealer ? "is-dealer" : ""}" data-id="${p.id}">
          <div class="prow-name">
            <span class="name-line"><span class="suit ${isRed(i) ? "red" : ""}">${suitFor(i)}</span><span class="nm">${esc(p.name)}</span></span>
            ${isDealer ? '<span class="dealer-chip">DEALER</span>' : ""}
          </div>
          <div class="stepper ${dealerForbids ? "forbidden" : ""}" data-kind="bid" data-id="${p.id}">
            <button data-step="-1" ${bid <= 0 ? "disabled" : ""}>−</button>
            <span class="sval">${bid}</span>
            <button data-step="1" ${bid >= cards ? "disabled" : ""}>＋</button>
          </div>
          <div class="stepper ${exact ? "exact" : ""}" data-kind="made" data-id="${p.id}">
            <button data-step="-1" ${made <= 0 ? "disabled" : ""}>−</button>
            <span class="sval">${made}</span>
            <button data-step="1" ${made >= cards ? "disabled" : ""}>＋</button>
          </div>
        </div>`;
    }).join("");

    const isLast = r === total - 1;
    const nextOk = !bidsBlocked && madeOk;
    let warn = "";
    if (bidsBlocked) warn = `⚠︎ Total bids can't equal ${cards} — the dealer must change their bid.`;
    else if (!madeOk) warn = `Tricks won must add up to ${cards} before you continue.`;

    el("panel-entry").innerHTML = `
      <div class="round-head">
        <div class="rh-left">
          <span class="rh-round">Round ${r + 1}</span>
          <span class="rh-progress">of ${total} • ${nameOf(S.players[dealer], dealer)} deals</span>
        </div>
        <div class="rh-hand"><div class="num">${cards}</div><div class="lbl">${cards === 1 ? "card" : "cards"}</div></div>
      </div>
      <div class="entry-heads"><span>Player</span><span>Bid</span><span>Made</span></div>
      <div id="play-rows">${rows}</div>
      <div class="meters">
        <div class="meter ${bidsBlocked ? "bad" : "ok"}">
          <span class="lbl">Total bids</span><span class="v">${sumBids}${bidsBlocked ? " ✕" : " ≠ " + cards}</span>
        </div>
        <div class="meter ${madeOk ? "ok" : "bad"}">
          <span class="lbl">Tricks won</span><span class="v">${sumMade}/${cards}</span>
        </div>
      </div>
      <div class="warn-line">${warn}</div>
      <div class="btn-row">
        ${r > 0 ? '<button class="sub-btn" id="prev-round">← Back</button>' : ""}
        <button class="primary-btn ${isLast ? "end" : ""}" id="next-round" ${nextOk ? "" : "disabled"} style="margin-top:0">
          ${isLast ? "🏁 End game" : "Next round →"}
        </button>
      </div>`;

    // steppers
    $("#play-rows").querySelectorAll(".stepper").forEach((st) => {
      const kind = st.dataset.kind, id = st.dataset.id;
      st.querySelectorAll("button[data-step]").forEach((btn) =>
        btn.addEventListener("click", () => step(r, kind, id, +btn.dataset.step, cards)));
    });
    if (r > 0) el("prev-round").addEventListener("click", () => { S.current--; save(); render(); });
    el("next-round").addEventListener("click", () => advance(isLast));
  }

  function step(r, kind, id, delta, cards) {
    const d = ensureRound(r);
    const bag = kind === "bid" ? d.bids : d.made;
    const cur = bag[id] || 0;
    const next = Math.min(cards, Math.max(0, cur + delta));
    bag[id] = next;
    save();            // save on every entry
    renderPlay();      // refresh validity/steppers
    renderBoard();     // live scoreboard
  }

  function advance(isLast) {
    // record round duration
    const now = Date.now();
    if (S.times.last != null) S.times.list.push(now - S.times.last);
    S.times.last = now;
    if (isLast) { S.phase = "finished"; save(); setTab("board"); render(); toast("Game over — nice stuffing! 🦃"); }
    else { S.current++; save(); render(); }
  }

  function renderFinishedEntry() {
    const rows = S.players.map((p) => ({ id: p.id, name: p.name, total: totalThrough(p.id, S.rounds.length - 1) }));
    const ranks = rankMap(rows);
    const winner = rows.slice().sort((a, b) => b.total - a.total)[0];
    el("panel-entry").innerHTML = `
      <div class="winner">
        <span class="cup">🏆</span>
        <div class="who">${esc(winner.name)} wins!</div>
        <div class="pts">${winner.total} points</div>
      </div>
      <div class="order-list">
        ${rows.slice().sort((a, b) => b.total - a.total).map((row) => `
          <div class="order-item">
            <span class="oi-num">${ranks[row.id]}</span>
            <span class="oi-name">${esc(row.name)}</span>
            <b style="color:var(--cyan);font-family:Fredoka">${row.total}</b>
          </div>`).join("")}
      </div>
      <div class="btn-row">
        <button class="sub-btn" id="replay">↻ Same players</button>
        <button class="primary-btn" id="brand-new" style="margin-top:0">New game</button>
      </div>`;
    el("replay").addEventListener("click", () => {
      S.rounds = genRounds(S.players.length); S.current = 0; S.data = {};
      S.times = { list: [], last: Date.now() }; S.phase = "playing"; save(); setTab("entry"); render();
    });
    el("brand-new").addEventListener("click", () => { S = freshSetup(); save(); setTab("entry"); render(); });
  }

  // =========================================================================
  //  SCOREBOARD  (right column / board tab)
  // =========================================================================
  function renderBoard() {
    const panel = el("panel-board");

    if (S.phase === "setup" || S.phase === "reorder") {
      panel.innerHTML = `
        <h2 class="sec-title"><span class="suit">♠</span> Scoreboard</h2>
        <p class="sec-sub">Standings appear here once the cards are dealt.</p>
        <div class="empty"><span class="big">🃏</span>
          Add your players and hit <b>Start game</b> to begin.<br/>
          Hit your bid exactly for <b>10 + tricks</b>; miss it and you only score the tricks you won.
        </div>`;
      return;
    }

    const lastComplete = latestScoredRound();
    const rows = S.players.map((p) => ({ id: p.id, name: p.name, total: totalThrough(p.id, S.rounds.length - 1) }));
    const ranks = rankMap(rows);
    const ordered = rows.slice().sort((a, b) => b.total - a.total);

    // leaderboard cards
    const lb = ordered.map((row, i) => {
      const idx = S.players.findIndex((p) => p.id === row.id);
      const rk = ranks[row.id];
      const st = playerStats(row.id);
      return `
        <div class="lb-row r${rk <= 3 ? rk : 0}">
          ${rk === 1 ? '<span class="crown">👑</span>' : ""}
          <span class="rank-badge">${rk === 1 ? "🥇" : rk === 2 ? "🥈" : rk === 3 ? "🥉" : rk}</span>
          <span class="lb-name">
            <span class="nm"><span class="suit ${isRed(idx) ? "red" : ""}">${suitFor(idx)}</span>${esc(row.name)}</span>
            <span class="meta">${st.hits} hits • ${st.misses} misses</span>
          </span>
          <span class="lb-pts">${row.total}<span class="u">pts</span></span>
        </div>`;
    }).join("");

    panel.innerHTML = `
      <h2 class="sec-title"><span class="suit red">♦</span> Leaderboard</h2>
      <p class="sec-sub">${S.phase === "finished" ? "Final standings" : `Live after round ${lastComplete + 1 || "—"} of ${S.rounds.length}`}</p>
      <div class="lb">${lb}</div>
      ${roundTable()}
      ${statsBlock()}`;
  }

  // last round index that has complete data for everyone (bids+made, made sums to cards)
  function latestScoredRound() {
    let last = -1;
    for (let r = 0; r < S.rounds.length; r++) {
      if (roundComplete(r)) last = r; else break;
    }
    return last;
  }

  function roundTable() {
    const heads = S.players.map((p, i) =>
      `<th class="player" colspan="3">${suitFor(i)} ${esc(p.name)}</th>`).join("");
    const subs = S.players.map(() => `<th>bid</th><th>made</th><th>pts</th>`).join("");

    let prevRanks = null;
    const body = S.rounds.map((cards, r) => {
      const d = S.data[r];
      const reached = !!d;
      const played = roundComplete(r);
      const isNow = r === S.current && S.phase === "playing";
      // ranks as of this round (only tint/rank meaningful once something has been scored)
      const rk = rankMap(S.players.map((p) => ({ id: p.id, total: totalThrough(p.id, r) })));
      const cells = S.players.map((p) => {
        const bid = reached ? (d.bids[p.id] ?? 0) : null;
        const made = reached ? (d.made[p.id] ?? 0) : null;
        const cum = totalThrough(p.id, r);
        const rankCls = played && rk[p.id] <= 3 ? `rank${rk[p.id]}` : "";
        let mv = "";
        if (played && prevRanks && prevRanks[p.id] != null && rk[p.id] !== prevRanks[p.id]) {
          const up = rk[p.id] < prevRanks[p.id];
          mv = `<span class="mv ${up ? "up" : "down"}">${up ? "▲" : "▼"}</span>`;
        }
        const madeCls = played ? (bid === made ? "hit" : "miss") : "";
        const bm = `<span class="bm">${reached ? bid : "·"}</span>`;
        const md = `<span class="bm"><span class="made ${madeCls}">${reached ? made : "·"}</span></span>`;
        const sc = reached
          ? `<span class="sc"${played ? "" : ' style="color:var(--ink-faint)"'}>${cum}${mv}</span>`
          : `<span class="sc" style="color:var(--ink-faint)">·</span>`;
        const cls = `${rankCls} ${isNow ? "now" : ""}`;
        return `<td class="cell ${cls}">${bm}</td><td class="${cls}">${md}</td><td class="${cls}">${sc}</td>`;
      }).join("");
      if (played) prevRanks = rk;
      return `<tr><td class="rnd">R${r + 1}<span class="h">${cards} card${cards > 1 ? "s" : ""}</span></td>${cells}</tr>`;
    }).join("");

    return `
      <div class="table-wrap">
        <table class="score">
          <thead>
            <tr><th class="rnd">Round</th>${heads}</tr>
            <tr class="sub"><th></th>${subs}</tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  // per-player aggregate stats over scored rounds
  function playerStats(id) {
    let hits = 0, misses = 0, bidSum = 0, wonSum = 0, best = 0, over = 0, under = 0;
    for (let r = 0; r < S.rounds.length; r++) {
      if (!roundComplete(r)) continue; // only count fully-entered rounds
      const d = S.data[r];
      const bid = d.bids[id] ?? 0, made = d.made[id] ?? 0;
      bidSum += bid; wonSum += made;
      const pts = roundPoints(bid, made); if (pts > best) best = pts;
      if (bid === made) hits++; else { misses++; if (made > bid) over++; else under++; }
    }
    return { hits, misses, bidSum, wonSum, best, over, under };
  }

  function statsBlock() {
    const scored = latestScoredRound() + 1;
    const durs = S.times.list;
    const avgMs = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;

    // superlatives
    const stats = S.players.map((p, i) => ({ p, i, ...playerStats(p.id) }));
    const mostAccurate = pickBest(stats, (s) => s.hits, true);
    const mostMisses = pickBest(stats, (s) => s.misses, true);
    const biggest = pickBest(stats, (s) => s.best, true);
    const gambler = pickBest(stats, (s) => s.over, true); // overshoots the most

    const cards = [
      statCard("⏱️", "Avg round", avgMs ? fmtDur(avgMs) : "—", durs.length ? `${durs.length} timed` : "starts after R1"),
      statCard("✅", "Sharpest bidder", mostAccurate ? nameOf(mostAccurate.p, mostAccurate.i) : "—", mostAccurate ? `${mostAccurate.hits} exact hits` : ""),
      statCard("💥", "Most misses", mostMisses && mostMisses.misses ? nameOf(mostMisses.p, mostMisses.i) : "—", mostMisses && mostMisses.misses ? `${mostMisses.misses} missed bids` : "clean sheet!"),
      statCard("🚀", "Biggest round", biggest && biggest.best ? nameOf(biggest.p, biggest.i) : "—", biggest && biggest.best ? `+${biggest.best} points` : ""),
      statCard("🎲", "Boldest hands", gambler && gambler.over ? nameOf(gambler.p, gambler.i) : "—", gambler && gambler.over ? `overshot ${gambler.over}×` : "—"),
      statCard("🔁", "Rounds done", `${scored}`, `of ${S.rounds.length}`),
    ].join("");

    const prows = stats.map((s) => `
      <tr>
        <td>${suitFor(s.i)} ${esc(s.p.name)}</td>
        <td>${s.hits}</td><td>${s.misses}</td>
        <td>${s.over}</td><td>${s.under}</td>
        <td>${s.bidSum}</td><td>${s.wonSum}</td>
        <td>+${s.best}</td>
      </tr>`).join("");

    return `
      <div class="stats-title">📊 Game stats</div>
      <div class="stat-grid">${cards}</div>
      <div class="table-wrap" style="border:none">
        <table class="pstat-table">
          <thead><tr>
            <th>Player</th><th>Hits</th><th>Miss</th><th>Over</th><th>Under</th>
            <th>Bid Σ</th><th>Won Σ</th><th>Best</th>
          </tr></thead>
          <tbody>${prows}</tbody>
        </table>
      </div>`;
  }

  function statCard(icon, k, v, who) {
    return `<div class="stat-card"><div class="k">${icon} ${k}</div><div class="v">${v}</div>${who ? `<div class="who">${who}</div>` : ""}</div>`;
  }
  function pickBest(arr, fn, max) {
    let best = null, bv = max ? -Infinity : Infinity;
    for (const s of arr) { const v = fn(s); if (max ? v > bv : v < bv) { bv = v; best = s; } }
    return best;
  }
  function fmtDur(ms) {
    const s = Math.round(ms / 1000);
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60), r = s % 60;
    return r ? `${m}m ${r}s` : `${m}m`;
  }

  // ---------- boot ----------
  render();
})();
