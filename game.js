/* SILLAGE — Tower Defense WEGO
   Planification des deux camps, résolution simultanée.
   Mécanique de sillage : une unité sélectionnée est entourée d'un cercle
   virtuel (sa capacité de déplacement) ; à mesure qu'on la déplace, le
   tracé s'effectue et le cercle rétrécit jusqu'à épuisement. */
(() => {
  "use strict";

  // ---------------------------------------------------------------- constantes
  const TILE = 48, COLS = 16, ROWS = 11;
  const W = COLS * TILE, H = ROWS * TILE;
  const CORE = { x: W / 2, y: H / 2, r: 22, hpMax: 20 };
  const TURN_DURATION = 7.0;       // secondes de résolution simultanée
  const MAX_TURNS = 10;

  const TOWERS = {
    canon: { nom: "Canon", cout: 30, portee: 150, degats: 9, cadence: 1.1, capacite: 90, couleur: "#89b4fa" },
    lance: { nom: "Lance", cout: 60, portee: 230, degats: 30, cadence: 0.4, capacite: 60, couleur: "#a6e3a1" },
  };
  const ENEMIES = {
    rodeur: { nom: "Rôdeur", pv: 40, vitesse: 46, degatsNoyau: 2, prime: 7, couleur: "#f38ba8", taille: 9 },
    muon:   { nom: "Muon",   pv: 25, vitesse: 78, degatsNoyau: 1, prime: 9, couleur: "#f9e2af", taille: 7 },
    tank:   { nom: "Colosse",pv: 130, vitesse: 24, degatsNoyau: 4, prime: 22, couleur: "#cba6f7", taille: 14 },
  };

  // ---------------------------------------------------------------- état global
  const state = {
    phase: "intro",           // intro | planif | resolution | victoire | defaite
    tour: 1,
    energie: 90,
    noyauHp: CORE.hpMax,
    tours: [],
    ennemis: [],
    projectiles: [],
    fx: [],
    selection: null,
    drag: null,
    placement: null,          // type en cours de recrutement
    resolutionT: 0,
    nextId: 1,
  };
  const log = [];
  const logEl = document.getElementById("log");

  function journal(msg) {
    log.push(msg);
    if (log.length > 6) log.shift();
    logEl.innerHTML = log.map((l) => "› " + l).join("<br>");
  }

  // ---------------------------------------------------------------- canvas
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const rect = () => canvas.getBoundingClientRect();
  function pointeur(e) {
    const r = rect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  // ---------------------------------------------------------------- vagues
  function compositionVague(tour) {
    const n = 2 + Math.floor(tour * 1.3);
    const liste = [];
    for (let i = 0; i < n; i++) {
      let type = "rodeur";
      if (tour >= 3 && i % 3 === 2) type = "muon";
      if (tour >= 5 && i % 5 === 4) type = "tank";
      liste.push(type);
    }
    return liste;
  }

  function bordAleatoire() {
    const cote = Math.floor(Math.random() * 4);
    const m = 18;
    if (cote === 0) return { x: Math.random() * W, y: m };
    if (cote === 1) return { x: W - m, y: Math.random() * H };
    if (cote === 2) return { x: Math.random() * W, y: H - m };
    return { x: m, y: Math.random() * H };
  }

  function engendrerVague(tour) {
    for (const type of compositionVague(tour)) {
      const p = bordAleatoire();
      const spec = ENEMIES[type];
      state.ennemis.push({
        id: state.nextId++,
        type,
        x: p.x, y: p.y,
        hp: spec.pv, hpMax: spec.pv,
        trail: [],
        trailT: 0,
        vivant: true,
        ph: Math.random() * Math.PI * 2,
      });
    }
  }

  // ---------------------------------------------------------------- déroulement
  function demarrerPlanif() {
    state.phase = "planif";
    state.resolutionT = 0;
    state.selection = null;
    for (const t of state.tours) t.utilise = 0;
    majHud();
  }

  function lancerResolution() {
    if (state.phase !== "planif") return;
    state.phase = "resolution";
    state.selection = null;
    state.drag = null;
    state.placement = null;
    state.resolutionT = 0;
    engendrerVague(state.tour);
    journal("Tour " + state.tour + " : résolution simultanée.");
    majHud();
  }

  function finDeTour() {
    if (state.noyauHp <= 0) { state.phase = "defaite"; majHud(); return; }
    if (state.tour >= MAX_TURNS) { state.phase = "victoire"; majHud(); return; }
    state.tour++;
    state.energie += 8;
    journal("Tour " + state.tour + " : planification.");
    demarrerPlanif();
  }

  // ---------------------------------------------------------------- mise à jour
  function maj(dt) {
    for (const fx of state.fx) fx.t -= dt;
    state.fx = state.fx.filter((f) => f.t > 0);
    for (const t of state.tours) for (const p of t.trail) p.vie -= dt;
    for (const e of state.ennemis) for (const p of e.trail) p.vie -= dt;

    if (state.phase !== "resolution") return;
    state.resolutionT += dt;

    // --- ennemis (IA) filent vers le noyau en même temps que les tirs
    for (const e of state.ennemis) {
      if (!e.vivant) continue;
      const spec = ENEMIES[e.type];
      let dx = CORE.x - e.x, dy = CORE.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      let vx = dx / d, vy = dy / d;

      // évitement léger des tourelles + séparation entre ennemis
      for (const t of state.tours) {
        const tx = e.x - t.x, ty = e.y - t.y;
        const td = Math.hypot(tx, ty);
        if (td < 60 && td > 0.1) { vx += (tx / td) * 0.25; vy += (ty / td) * 0.25; }
      }
      for (const o of state.ennemis) {
        if (o === e || !o.vivant) continue;
        const ox = e.x - o.x, oy = e.y - o.y;
        const od = Math.hypot(ox, oy);
        if (od < 20 && od > 0.1) { vx += (ox / od) * 0.5; vy += (oy / od) * 0.5; }
      }
      const norm = Math.hypot(vx, vy) || 1;
      e.x += (vx / norm) * spec.vitesse * dt;
      e.y += (vy / norm) * spec.vitesse * dt;

      e.trailT -= dt;
      if (e.trailT <= 0) {
        e.trailT = 0.05;
        e.trail.push({ x: e.x, y: e.y, vie: 0.9 });
      }

      if (d < CORE.r + spec.taille) {
        e.vivant = false;
        state.noyauHp -= spec.degatsNoyau;
        state.fx.push({ x: CORE.x, y: CORE.y, t: 0.5, type: "boom" });
        journal(spec.nom + " a percuté le noyau (−" + spec.degatsNoyau + " PV).");
        if (state.noyauHp <= 0) { state.phase = "defaite"; majHud(); return; }
      }
    }

    // --- tourelles tirent en même temps
    for (const t of state.tours) {
      t.chargement -= dt;
      let cible = null;
      if (t.focus != null) {
        const f = state.ennemis.find((e) => e.id === t.focus && e.vivant);
        if (f && dist(t, f) <= t.portee) cible = f;
      }
      if (!cible) {
        let meilleure = Infinity;
        for (const e of state.ennemis) {
          if (!e.vivant) continue;
          const d = dist(t, e);
          if (d <= t.portee && d < meilleure) { meilleure = d; cible = e; }
        }
      }
      if (cible) {
        t.angle = Math.atan2(cible.y - t.y, cible.x - t.x);
        if (t.chargement <= 0) {
          t.chargement = 1 / t.cadence;
          t.flash = 0.08;
          state.projectiles.push({
            x: t.x, y: t.y,
            cible: cible.id,
            vitesse: 480,
            degats: t.degats,
            couleur: t.couleur,
          });
        }
      }
    }

    // --- projectiles
    for (const p of state.projectiles) {
      const c = state.ennemis.find((e) => e.id === p.cible && e.vivant);
      if (!c) { p.mort = true; continue; }
      const dx = c.x - p.x, dy = c.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const pas = p.vitesse * dt;
      if (d <= pas + ENEMIES[c.type].taille) {
        c.hp -= p.degats;
        p.mort = true;
        state.fx.push({ x: c.x, y: c.y, t: 0.25, type: "hit" });
        if (c.hp <= 0) {
          c.vivant = false;
          state.energie += ENEMIES[c.type].prime;
          journal(ENEMIES[c.type].nom + " détruit (+" + ENEMIES[c.type].prime + " énergie).");
        }
      } else {
        p.x += (dx / d) * pas;
        p.y += (dy / d) * pas;
      }
    }
    state.projectiles = state.projectiles.filter((p) => !p.mort);

    const finie = state.resolutionT >= TURN_DURATION;
    if (finie) finDeTour();
    majHud();
  }

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  // ---------------------------------------------------------------- interactions
  function tourSous(p) {
    let meilleure = null, dMin = 22;
    for (const t of state.tours) {
      const d = dist(t, p);
      if (d < dMin) { dMin = d; meilleure = t; }
    }
    return meilleure;
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (state.phase !== "planif" && state.phase !== "placement") return;
    const p = pointeur(e);

    if (state.placement) { placerTourelle(p); return; }

    // priorité : sélectionner une tourelle
    const t = tourSous(p);
    if (t) {
      state.selection = t.id;
      state.drag = { ancre: { x: t.x, y: t.y }, reste: t.capacite - t.utilise };
      return;
    }
    // sinon : focuser un ennemi (si une tourelle est sélectionnée)
    if (state.selection != null) {
      for (const en of state.ennemis) {
        if (!en.vivant) continue;
        if (dist(en, p) < ENEMIES[en.type].taille + 8) {
          const tor = state.tours.find((x) => x.id === state.selection);
          tor.focus = tor.focus === en.id ? null : en.id;
          return;
        }
      }
    }
    state.selection = null;
  });

  canvas.addEventListener("pointermove", (e) => {
    const p = pointeur(e);
    state.souris = p;
    if (state.drag) {
      const t = state.tours.find((x) => x.id === state.selection);
      if (!t) { state.drag = null; return; }
      let dx = p.x - state.drag.ancre.x, dy = p.y - state.drag.ancre.y;
      const d = Math.hypot(dx, dy);
      if (d > state.drag.reste) {
        dx = (dx / d) * state.drag.reste;
        dy = (dy / d) * state.drag.reste;
      }
      t.x = state.drag.ancre.x + dx;
      t.y = state.drag.ancre.y + dy;
      t.trail.push({ x: t.x, y: t.y, vie: 1.4 });
    }
  });

  window.addEventListener("pointerup", () => {
    if (state.drag) {
      const t = state.tours.find((x) => x.id === state.selection);
      if (t) {
        t.utilise = Math.min(t.capacite, t.utilise + dist(t, state.drag.ancre));
        journal(TOWERS[t.type].nom + " : sillage tracé, réserve restante " +
          Math.round(t.capacite - t.utilise) + " px.");
      }
      state.drag = null;
      majHud();
    }
  });

  function placerTourelle(p) {
    const spec = TOWERS[state.placement];
    const cx = Math.floor(p.x / TILE) * TILE + TILE / 2;
    const cy = Math.floor(p.y / TILE) * TILE + TILE / 2;
    if (cx < TILE / 2 || cy < TILE / 2 || cx > W - TILE / 2 || cy > H - TILE / 2) return;
    if (state.energie < spec.cout) { journal("Énergie insuffisante."); return; }
    if (dist({ x: cx, y: cy }, CORE) < CORE.r + 20) { journal("Trop proche du noyau."); return; }
    for (const t of state.tours) if (dist(t, { x: cx, y: cy }) < 36) return;
    state.energie -= spec.cout;
    state.tours.push({
      id: state.nextId++,
      type: state.placement,
      x: cx, y: cy,
      angle: -Math.PI / 2,
      capacite: spec.capacite,
      utilise: 0,
      portee: spec.portee,
      degats: spec.degats,
      cadence: spec.cadence,
      couleur: spec.couleur,
      chargement: 0,
      flash: 0,
      focus: null,
      trail: [],
    });
    journal(spec.nom + " déployée.");
    state.placement = null;
    majHud();
  }

  // ---------------------------------------------------------------- boutons
  const btnResolve = document.getElementById("btn-resolve");
  const btnCanon = document.getElementById("btn-canon");
  const btnLance = document.getElementById("btn-lance");
  const btnReset = document.getElementById("btn-reset");

  btnResolve.addEventListener("click", lancerResolution);
  btnCanon.addEventListener("click", () => armer("canon"));
  btnLance.addEventListener("click", () => armer("lance"));
  btnReset.addEventListener("click", reinitialiser);

  function armer(type) {
    if (state.phase !== "planif") return;
    state.placement = state.placement === type ? null : type;
    majHud();
  }

  function reinitialiser() {
    if (state.phase !== "planif") return;
    for (const t of state.tours) { t.utilise = 0; t.trail = []; }
    journal("Unités réinitialisées : réserves de déplacement restaurées.");
    majHud();
  }

  document.getElementById("btn-start").addEventListener("click", () => {
    document.getElementById("overlay").classList.add("hidden");
    demarrerPlanif();
    engendrerVague(0);
  });

  // ---------------------------------------------------------------- hud
  function majHud() {
    document.getElementById("hud-turn").textContent = state.tour + "/" + MAX_TURNS;
    document.getElementById("hud-energy").textContent = state.energie;
    document.getElementById("hud-core").textContent = Math.max(0, state.noyauHp) + " PV";
    document.getElementById("hud-enemies").textContent =
      state.ennemis.filter((e) => e.vivant).length;

    const ph = document.getElementById("phase-label");
    if (state.phase === "planif") { ph.textContent = "PLANIFICATION"; ph.className = "phase planif"; }
    else if (state.phase === "resolution") { ph.textContent = "RÉSOLUTION SIMULTANÉE"; ph.className = "phase resolution"; }
    else if (state.phase === "victoire") { ph.textContent = "VICTOIRE"; ph.className = "phase fin"; }
    else if (state.phase === "defaite") { ph.textContent = "DÉFAITE"; ph.className = "phase resolution"; }
    else { ph.textContent = "INTRO"; ph.className = "phase planif"; }

    btnResolve.disabled = state.phase !== "planif" || state.tours.length === 0;
    btnCanon.disabled = state.phase !== "planif" || state.energie < TOWERS.canon.cout;
    btnLance.disabled = state.phase !== "planif" || state.energie < TOWERS.lance.cout;
    btnCanon.classList.toggle("armed", state.placement === "canon");
    btnLance.classList.toggle("armed", state.placement === "lance");

    const t = state.tours.find((x) => x.id === state.selection);
    document.getElementById("hint").textContent = state.placement
      ? "Clique sur une case pour déployer le " + TOWERS[state.placement].nom + "."
      : t
        ? TOWERS[t.type].nom + " sélectionnée — réserve de déplacement : " +
          Math.round(t.capacite - t.utilise) + " px. Clique un ennemi pour le cibler."
        : "Clique une unité : le cercle = sa réserve de déplacement. Tire-la : le sillage se trace et le cercle rétrécit jusqu'à épuisement.";
    document.getElementById("timer").textContent =
      state.phase === "resolution" ? state.resolutionT.toFixed(1) + " s" : "";
  }

  // ---------------------------------------------------------------- rendu
  function dessiner() {
    ctx.clearRect(0, 0, W, H);

    // grille
    ctx.strokeStyle = "#141a26";
    ctx.lineWidth = 1;
    for (let i = 1; i < COLS; i++) { ctx.beginPath(); ctx.moveTo(i * TILE, 0); ctx.lineTo(i * TILE, H); ctx.stroke(); }
    for (let j = 1; j < ROWS; j++) { ctx.beginPath(); ctx.moveTo(0, j * TILE); ctx.lineTo(W, j * TILE); ctx.stroke(); }

    // noyau
    ctx.beginPath();
    ctx.arc(CORE.x, CORE.y, CORE.r, 0, Math.PI * 2);
    ctx.fillStyle = "#1e2737"; ctx.fill();
    ctx.strokeStyle = "#f9e2af"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#f9e2af";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText(Math.max(0, state.noyauHp) + " PV", CORE.x, CORE.y + 4);

    // sillages
    const tracerSillage = (trail, couleur) => {
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i];
        if (b.vie <= 0) continue;
        ctx.strokeStyle = couleur;
        ctx.globalAlpha = Math.min(1, b.vie) * 0.5;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    for (const t of state.tours) tracerSillage(t.trail, t.couleur);
    for (const e of state.ennemis) if (e.vivant) tracerSillage(e.trail, ENEMIES[e.type].couleur);

    // flèches d'intention ennemies pendant la planification
    if (state.phase === "planif") {
      ctx.strokeStyle = "#f38ba822";
      ctx.lineWidth = 1;
      for (const e of state.ennemis) {
        if (!e.vivant) continue;
        const d = Math.hypot(CORE.x - e.x, CORE.y - e.y) || 1;
        const ux = (CORE.x - e.x) / d, uy = (CORE.y - e.y) / d;
        const x2 = e.x + ux * 30, y2 = e.y + uy * 30;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(x2, y2); ctx.stroke();
      }
    }

    // tourelles
    for (const t of state.tours) {
      const sel = t.id === state.selection;
      // zone de portée de la sélection
      if (sel) {
        ctx.beginPath(); ctx.arc(t.x, t.y, t.portee, 0, Math.PI * 2);
        ctx.strokeStyle = t.couleur + "44"; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
      }
      // cercle de capacité (mécanique sillage)
      if (sel && state.phase === "planif") {
        const reste = t.capacite - t.utilise;
        const centre = state.drag ? state.drag.ancre : t;
        ctx.beginPath(); ctx.arc(centre.x, centre.y, Math.max(0, reste), 0, Math.PI * 2);
        ctx.strokeStyle = "#f9e2af88"; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
        ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.angle);
      ctx.fillStyle = t.flash > 0 ? "#ffffff" : t.couleur;
      ctx.fillRect(-6, -10, 18, 20);                       // traversin
      ctx.fillRect(10, -3, 14, 6);                          // canon
      ctx.restore();
      if (t.focus != null && state.ennemis.some((e) => e.id === t.focus && e.vivant)) {
        ctx.fillStyle = "#f38ba8";
        ctx.font = "10px monospace"; ctx.textAlign = "center";
        ctx.fillText("◉", t.x, t.y - 16);
      }
      t.flash -= 0.016;
    }

    // ennemis
    for (const e of state.ennemis) {
      if (!e.vivant) continue;
      const spec = ENEMIES[e.type];
      ctx.fillStyle = spec.couleur;
      ctx.beginPath();
      ctx.arc(e.x, e.y, spec.taille, 0, Math.PI * 2);
      ctx.fill();
      // barre de vie
      const w = spec.taille * 2;
      ctx.fillStyle = "#00000088";
      ctx.fillRect(e.x - spec.taille, e.y - spec.taille - 7, w, 3);
      ctx.fillStyle = "#a6e3a1";
      ctx.fillRect(e.x - spec.taille, e.y - spec.taille - 7, w * (e.hp / e.hpMax), 3);
    }

    // projectiles
    for (const p of state.projectiles) {
      ctx.fillStyle = p.couleur;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    }

    // effets
    for (const f of state.fx) {
      ctx.globalAlpha = Math.max(0, f.t * 3);
      ctx.strokeStyle = f.type === "boom" ? "#f38ba8" : "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, (0.5 - Math.min(0.5, f.t)) * 40 + 8, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // fantôme de placement
    if (state.placement && state.souris && state.phase === "planif") {
      const p = state.souris;
      const cx = Math.floor(p.x / TILE) * TILE + TILE / 2;
      const cy = Math.floor(p.y / TILE) * TILE + TILE / 2;
      const ok = dist({ x: cx, y: cy }, CORE) > CORE.r + 20 && state.energie >= TOWERS[state.placement].cout;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = ok ? TOWERS[state.placement].couleur : "#f38ba8";
      ctx.fillRect(cx - 8, cy - 10, 16, 20);
      ctx.globalAlpha = 1;
    }

    // écran de fin
    if (state.phase === "victoire" || state.phase === "defaite") {
      ctx.fillStyle = "rgba(5,7,12,0.75)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = state.phase === "victoire" ? "#a6e3a1" : "#f38ba8";
      ctx.font = "bold 42px monospace";
      ctx.textAlign = "center";
      ctx.fillText(state.phase === "victoire" ? "VICTOIRE" : "DÉFAITE", W / 2, H / 2);
      ctx.font = "14px monospace";
      ctx.fillStyle = "#cdd6f4";
      ctx.fillText("Recharge la page pour rejouer.", W / 2, H / 2 + 34);
    }
  }

  // ---------------------------------------------------------------- boucle
  let dernier = performance.now();
  function boucle(temps) {
    const dt = Math.min(0.05, (temps - dernier) / 1000);
    dernier = temps;
    maj(dt);
    dessiner();
    requestAnimationFrame(boucle);
  }

  // positions de départ
  demarrerPlanif();
  majHud();
  requestAnimationFrame(boucle);
})();
