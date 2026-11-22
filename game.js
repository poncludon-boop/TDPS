/* SILLAGE 3D — Tower Defense WEGO
   Terrain plat : base au sud, vagues du nord sur toute la largeur.
   Sillage : le cercle virtuel (réserve de déplacement) est centré sur le
   pointeur et rétrécit à mesure que le tracé s'effectue, jusqu'à épuisement. */
(() => {
  "use strict";

  const W = 300, D = 200;                    // terrain : largeur x, profondeur z
  const TURN_DURATION = 7.0;
  const MAX_TURNS = 10;
  const BASE = { x: 0, z: 66, r: 9, hpMax: 20 };

  const WEAPONS = {
    gatling: { nom: "Gatling", couleur: 0x89b4fa, hex: "#89b4fa", portee: 50, capacite: 50,
               degats: 1, tirs: 25 },
    laser:   { nom: "Laser", couleur: 0xcba6f7, hex: "#cba6f7", portee: 100, capacite: 25,
               degats: 50, tirs: 1 },
    mortier: { nom: "Mortier", couleur: 0xf9e2af, hex: "#f9e2af", portee: Infinity, capacite: 10,
               degats: 25, tirs: 2 },
  };
  const ENEMIES = {
    rodeur:  { nom: "Rôdeur",  pv: 35,  vitesse: 9,  degatsBase: 2, taille: 2.0, couleur: 0xf38ba8 },
    muon:    { nom: "Muon",    pv: 20,  vitesse: 15, degatsBase: 1, taille: 1.4, couleur: 0xf9e2af },
    colosse: { nom: "Colosse", pv: 90,  vitesse: 5.5,degatsBase: 3, taille: 3.6, couleur: 0xcba6f7 },
  };

  // ---------------------------------------------------------------- état
  const state = {
    phase: "intro",
    tour: 1,
    noyauHp: BASE.hpMax,
    tours: [],
    ennemis: [],
    projectiles: [],
    obus: [],
    rayons: [],
    fx: [],
    selection: null,
    drag: null,
    orbite: null,
    souris: { x: 0, z: 0 },
    resolutionT: 0,
    nextId: 1,
  };
  const log = [];
  const logEl = document.getElementById("log");
  function journal(m) {
    log.push(m);
    if (log.length > 7) log.shift();
    logEl.innerHTML = log.map((l) => "› " + l).join("<br>");
  }

  // ---------------------------------------------------------------- scène
  const canvas = document.getElementById("scene");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e14);
  scene.fog = new THREE.Fog(0x0b0e14, 260, 520);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 900);
  const cam = { theta: 0, phi: 0.72, dist: 175, cible: new THREE.Vector3(0, 0, 25) };
  function majCamera() {
    camera.position.set(
      cam.cible.x + cam.dist * Math.sin(cam.phi) * Math.sin(cam.theta),
      cam.dist * Math.cos(cam.phi),
      cam.cible.z + cam.dist * Math.sin(cam.phi) * Math.cos(cam.theta)
    );
    camera.lookAt(cam.cible);
  }

  scene.add(new THREE.HemisphereLight(0x8fa3c7, 0x1a1626, 0.85));
  const solaire = new THREE.DirectionalLight(0xfff4e0, 0.9);
  solaire.position.set(-90, 140, 60);
  solaire.castShadow = true;
  solaire.shadow.mapSize.set(2048, 2048);
  Object.assign(solaire.shadow.camera, { left: -W / 2, right: W / 2, top: D / 2, bottom: -D / 2, far: 500 });
  scene.add(solaire);

  const sol = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ color: 0x121826, roughness: 1 })
  );
  sol.rotation.x = -Math.PI / 2;
  sol.receiveShadow = true;
  scene.add(sol);

  const pts = [];
  for (let x = -W / 2; x <= W / 2 + 0.1; x += 20) pts.push(x, 0.02, -D / 2, x, 0.02, D / 2);
  for (let z = -D / 2; z <= D / 2 + 0.1; z += 20) pts.push(-W / 2, 0.02, z, W / 2, 0.02, z);
  const grille = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)),
    new THREE.LineBasicMaterial({ color: 0x1e2737 })
  );
  scene.add(grille);

  // nord / sud
  const bandeNord = new THREE.Mesh(
    new THREE.PlaneGeometry(W, 6),
    new THREE.MeshBasicMaterial({ color: 0xf38ba8, transparent: true, opacity: 0.14 })
  );
  bandeNord.rotation.x = -Math.PI / 2;
  bandeNord.position.set(0, 0.05, -D / 2 + 3);
  scene.add(bandeNord);

  const base = new THREE.Group();
  const socle = new THREE.Mesh(
    new THREE.CylinderGeometry(BASE.r, BASE.r + 1.5, 4, 24),
    new THREE.MeshStandardMaterial({ color: 0x2a3548, roughness: 0.6 })
  );
  socle.position.y = 2;
  socle.castShadow = true;
  base.add(socle);
  const coeur = new THREE.Mesh(
    new THREE.OctahedronGeometry(4),
    new THREE.MeshStandardMaterial({ color: 0xf9e2af, emissive: 0xf9e2af, emissiveIntensity: 0.7 })
  );
  coeur.position.y = 8;
  base.add(coeur);
  base.position.set(BASE.x, 0, BASE.z);
  scene.add(base);

  // plan de contact souris -> sol
  const planSol = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const raycaster = new THREE.Raycaster();
  function pointSol(e) {
    const v = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(v, camera);
    const p = new THREE.Vector3();
    return raycaster.ray.intersectPlane(planSol, p) ? p : null;
  }

  // ---------------------------------------------------------------- construction
  function matiere(c, em = 0.25) {
    return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: em, roughness: 0.5 });
  }

  function construireTourelle(type, x, z) {
    const spec = WEAPONS[type];
    const g = new THREE.Group();

    const potence = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3, 1.6, 12), matiere(0x2a3548, 0.05));
    potence.position.y = 0.8;
    potence.castShadow = true;
    g.add(potence);

    const tete = new THREE.Group();
    const corps = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 3.4), matiere(spec.couleur, 0.2));
    corps.position.y = 1.3;
    corps.castShadow = true;
    tete.add(corps);

    if (type === "gatling") {
      for (let i = 0; i < 3; i++) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 4.5, 8), matiere(spec.couleur, 0.4));
        tube.rotation.x = Math.PI / 2 - (type === "gatling" ? 0.35 : 0);
        tube.position.set(i - 1, 1.6 + (i === 1 ? 0.35 : 0), 2.2);
        tete.add(tube);
      }
    }
    if (type === "laser") {
      const prisme = new THREE.Mesh(new THREE.OctahedronGeometry(1.5), matiere(spec.couleur, 0.8));
      prisme.position.set(0, 3.2, 0.5);
      tete.add(prisme);
    }
    if (type === "mortier") {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 4, 12), matiere(spec.couleur, 0.2));
      tube.rotation.x = -0.9;
      tube.position.set(0, 3, 0);
      tube.castShadow = true;
      tete.add(tube);
    }
    g.add(tete);

    // zone cliquable élargie
    const hit = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 2;
    g.add(hit);

    // cercle sillage (plat, centré sur la position)
    const cercle = new THREE.Mesh(
      new THREE.RingGeometry(0.965, 1, 72),
      new THREE.MeshBasicMaterial({ color: 0xf9e2af, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    cercle.rotation.x = -Math.PI / 2;
    cercle.position.y = 0.14;
    g.add(cercle);

    // sillage : tracé
    const MAX_PTS = 400;
    const positions = new Float32Array(MAX_PTS * 3);
    const couleurs = new Float32Array(MAX_PTS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(couleurs, 3));
    geo.setDrawRange(0, 0);
    const trace = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75 }));
    scene.add(trace);

    g.position.set(x, 0, z);
    scene.add(g);
    return {
      id: state.nextId++, type, groupe: g, tete, cercle, trace,
      positions, couleurs, trailPts: [],
      x, z, capacite: spec.capacite, utilise: 0,
      portee: spec.portee, degats: spec.degats, tirsParTour: spec.tirs,
      angle: Math.PI, aim: { x, z: z - 100 },
      chargement: 0, tirsEffectues: 0, baseY: 0,
    };
  }

  function engendrerPartie() {
    state.tours = [
      construireTourelle("gatling", -16, 46),
      construireTourelle("laser", 16, 46),
      construireTourelle("mortier", 0, 56),
    ];
   majArsenal();
  }

  function construireEnnemi(type, x, z) {
    const spec = ENEMIES[type];
    let mesh;
    if (type === "rodeur") mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(spec.taille, 0), matiere(spec.couleur, 0.5));
    if (type === "muon") mesh = new THREE.Mesh(new THREE.TetrahedronGeometry(spec.taille, 0), matiere(spec.couleur, 0.7));
    if (type === "colosse") mesh = new THREE.Mesh(new THREE.BoxGeometry(spec.taille * 1.8, spec.taille * 1.6, spec.taille * 1.8), matiere(spec.couleur, 0.3));
    mesh.castShadow = true;
    mesh.position.set(x, spec.taille, z);

    const barreFond = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.7), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    barreFond.position.y = spec.taille + 3;
    const barre = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.5), new THREE.MeshBasicMaterial({ color: 0xa6e3a1 }));
    barre.position.set(0, 0.05, 0.01);
    const groupeBarre = new THREE.Group();
    groupeBarre.add(barreFond, barre);
    mesh.add(groupeBarre);
    groupeBarre.renderOrder = 2;

    scene.add(mesh);
    return {
      id: state.nextId++, type, mesh, barre,
      x, z, hp: spec.pv, hpMax: spec.pv, vivant: true, ph: Math.random() * 6.28,
    };
  }

  // ---------------------------------------------------------------- vagues
  function compositionVague(t) {
    const n = 1 + Math.ceil(t * 1.2);
    const l = [];
    for (let i = 0; i < n; i++) {
      let ty = "rodeur";
      if (t >= 3 && i % 3 === 2) ty = "muon";
      if (t >= 5 && i % 4 === 3) ty = "colosse";
      l.push(ty);
    }
    return l;
  }

  function engendrerVague(t) {
    for (const type of compositionVague(t)) {
      const x = (Math.random() - 0.5) * (W - 24);
      const z = -D / 2 - 6 - Math.random() * 12;
      state.ennemis.push(construireEnnemi(type, x, z));
    }
    journal("Vague " + t + " : " + compositionVague(t).length + " ennemis au nord.");
  }

  // ---------------------------------------------------------------- phases
  function demarrerPlanif() {
    state.phase = "planif";
    state.selection = null;
    state.drag = null;
    for (const t of state.tours) {
      t.utilise = 0;
      t.tirsEffectues = 0;
      t.trailPts = [{ x: t.x, z: t.z }];
      majTrace(t);
      majCercle(t);
    }
    majHud();
  }

  function lancerResolution() {
    if (state.phase !== "planif" || state.tours.length === 0) return;
    state.phase = "resolution";
    state.resolutionT = 0;
    state.drag = null;
    engendrerVague(state.tour);
    journal("Résolution simultanée du tour " + state.tour + ".");
    majHud();
  }

  function finDeTour() {
    if (state.noyauHp <= 0) { finPartie(false); return; }
    if (state.tour >= MAX_TURNS) { finPartie(true); return; }
    state.tour++;
    state.phase = "transit";
    journal("Tour " + state.tour + " : reprise de la planification.");
    demarrerPlanif();
  }

  function finPartie(gagne) {
    state.phase = gagne ? "victoire" : "defaite";
    document.querySelector("#overlay .panel").innerHTML =
      "<h2>" + (gagne ? "VICTOIRE" : "DÉFAITE") + "</h2>" +
      "<p>" + (gagne ? "Les 10 vagues ont été repoussées. Noyau intact."
                     : "Le noyau a cédé au tour " + state.tour + ".") + "</p>" +
      "<button onclick='location.reload()'>REJOUER</button>";
    document.getElementById("overlay").classList.remove("hidden");
    majHud();
  }

  // ---------------------------------------------------------------- dégâts
  function blesser(e, d) {
    e.hp -= d;
    e.barre.scale.x = Math.max(0.001, e.hp / e.hpMax);
    e.barre.material.color.setHex(e.hp / e.hpMax > 0.5 ? 0xa6e3a1 : e.hp / e.hpMax > 0.25 ? 0xf9e2af : 0xf38ba8);
    if (e.hp <= 0 && e.vivant) {
      e.vivant = false;
      scene.remove(e.mesh);
      burst(e.x, e.z, ENEMIES[e.type].couleur, ENEMIES[e.type].taille * 2);
    }
  }

  function burst(x, z, couleur, taille) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 12),
      new THREE.MeshBasicMaterial({ color: couleur, transparent: true, opacity: 0.9 })
    );
    m.position.set(x, 1.5, z);
    scene.add(m);
    state.fx.push({ mesh: m, duree: 0.45, vie: 0.45, rayon: taille + 1 });
  }

  // ---------------------------------------------------------------- maj
  function maj(dt) {
    for (const f of state.fx) {
      f.vie -= dt;
      const k = 1 - Math.max(0, f.vie) / f.duree;
      f.mesh.scale.setScalar(0.3 + f.rayon * k);
      f.mesh.material.opacity = 0.9 * Math.max(0, 1 - k);
      if (f.vie <= 0) scene.remove(f.mesh);
    }
    state.fx = state.fx.filter((f) => f.vie > 0);
    coeur.rotation.y += dt * 1.5;
    coeur.position.y = 8 + Math.sin(state.resolutionT * 2) * 0.25;

    if (state.phase !== "resolution") return;
    state.resolutionT += dt;

    // --- ennemis (IA) : ruée vers la base
    for (const e of state.ennemis) {
      if (!e.vivant) continue;
      const spec = ENEMIES[e.type];
      let dx = BASE.x - e.x, dz = BASE.z - e.z;
      const d = Math.hypot(dx, dz) || 1;
      let vx = dx / d, vz = dz / d;
      for (const t of state.tours) {
        const ax = e.x - t.x, az = e.z - t.z;
        const ad = Math.hypot(ax, az);
        if (ad < 14 && ad > 0.1) { vx += (ax / ad) * 0.3; vz += (az / ad) * 0.3; }
      }
      for (const o of state.ennemis) {
        if (o === e || !o.vivant) continue;
        const ox = e.x - o.x, oz = e.z - o.z;
        const od = Math.hypot(ox, oz);
        if (od < spec.taille + ENEMIES[o.type].taille && od > 0.1) { vx += (ox / od) * 0.6; vz += (oz / od) * 0.6; }
      }
      const norm = Math.hypot(vx, vz) || 1;
      e.x += (vx / norm) * spec.vitesse * dt;
      e.z += (vz / norm) * spec.vitesse * dt;
      e.ph += dt * 4;

      if (Math.hypot(BASE.x - e.x, BASE.z - e.z) < BASE.r + spec.taille) {
        e.vivant = false;
        scene.remove(e.mesh);
        state.noyauHp -= spec.degatsBase;
        burst(BASE.x, BASE.z, 0xf38ba8, 8);
        journal(ENEMIES[e.type].nom + " a percuté le noyau (−" + spec.degatsBase + " PV).");
        if (state.noyauHp <= 0) { finPartie(false); return; }
      }
    }

    // --- ennemis poussés hors terrain
    for (const e of state.ennemis) {
      e.mesh.position.set(e.x, ENEMIES[e.type].taille, e.z);
      e.mesh.rotation.x += dt * 0.8;
      e.mesh.rotation.y += dt * 0.5;
      const cibleActive = e.vivant;
      e.mesh.visible = cibleActive || e.mesh.visible;
    }

    // --- tourelles
    for (const t of state.tours) {
      const spec = WEAPONS[t.type];
      const temps = state.resolutionT;
      t.tete.rotation.y = t.angle;

      if (t.type === "gatling" && t.tirsEffectues < t.tirsParTour) {
        t.chargement -= dt;
        if (t.chargement <= 0) {
          let cible = null, minD = t.portee;
          for (const e of state.ennemis) {
            if (!e.vivant) continue;
            const d = Math.hypot(e.x - t.x, e.z - t.z);
            if (d <= minD) { minD = d; cible = e; }
          }
          if (cible) {
            t.chargement = TURN_DURATION / t.tirsParTour;
            t.tirsEffectues++;
            t.angle = Math.atan2(cible.x - t.x, cible.z - t.z);
            const dirLen = Math.hypot(cible.x - t.x, cible.z - t.z) || 1;
            state.projectiles.push({
              x: t.x, z: t.z,
              dx: (cible.x - t.x) / dirLen, dz: (cible.z - t.z) / dirLen,
              vitesse: 110, degats: t.degats, couleur: spec.couleur,
              mesh: null,
            });
          }
        }
      }
      if (t.type === "laser" && t.tirsEffectues < t.tirsParTour && temps >= 0.6) {
        t.tirsEffectues++;
        tirerLaser(t);
      }
      if (t.type === "mortier" && t.tirsEffectues < t.tirsParTour &&
          temps >= (t.tirsEffectues === 0 ? 0.35 : 3.9)) {
        t.tirsEffectues++;
        tirerMortier(t);
      }
    }

    // --- projectiles gatling
    for (const p of state.projectiles) {
      if (p.mesh === null) {
        p.mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.35, 5),
          new THREE.MeshBasicMaterial({ color: p.couleur })
        );
        scene.add(p.mesh);
      }
      p.x += p.dx * p.vitesse * dt;
      p.z += p.dz * p.vitesse * dt;
      p.mesh.position.set(p.x, 2.2, p.z);
      p.mesh.rotation.y = Math.atan2(p.dx, p.dz);
      p.mort = false;
      for (const e of state.ennemis) {
        if (!e.vivant) continue;
        if (Math.hypot(e.x - p.x, e.z - p.z) < ENEMIES[e.type].taille + 0.8) {
          blesser(e, p.degats);
          p.mort = true;
          break;
        }
      }
      if (Math.abs(p.x) > W / 2 || p.z < -D / 2 - 14 || p.z > D / 2) p.mort = true;
      if (p.mort) { scene.remove(p.mesh); p.mesh = null; }
    }
    state.projectiles = state.projectiles.filter((p) => !p.mort);

    // --- rayons laser
    for (const r of state.rayons) {
      r.vie -= dt;
      const k = Math.max(0, r.vie / r.duree);
      const largeur = 1 + 6 * k;
      r.mesh.scale.set(largeur, 1, 1);
      r.mesh.material.opacity = 0.5 + 0.4 * k;
      for (const e of state.ennemis) {
        if (!e.vivant || r.touche.has(e.id)) continue;
        const px = e.x - r.x, pz = e.z - r.z;
        const pependiculaire = Math.abs(px * r.dirZ - pz * r.dirX);
        const leLong = px * r.dirX + pz * r.dirZ;
        if (pependiculaire <= largeur / 2 + ENEMIES[e.type].taille * 0.5 && Math.abs(leLong) <= (W + D) / 2) {
          r.touche.add(e.id);
          blesser(e, r.degats);
        }
      }
    }
    state.rayons = state.rayons.filter((r) => {
      if (r.vie <= 0) { scene.remove(r.mesh); return false; }
      return true;
    });

    // --- obus de mortier (vol parabolique)
    for (const o of state.obus) {
      o.vie -= dt;
      const k = 1 - o.vie / o.duree;
      const x = o.x0 + (o.x1 - o.x0) * k;
      const z = o.z0 + (o.z1 - o.z0) * k;
      const y = 3 + 26 * 4 * k * (1 - k);
      o.mesh.position.set(x, y, z);
      if (o.vie <= 0) {
        scene.remove(o.mesh);
        exploser(o.x1, o.z1, o.degats, 10.5);
      }
    }
    state.obus = state.obus.filter((o) => o.vie > 0);

    if (state.resolutionT >= TURN_DURATION) finDeTour();
    majHud();
  }

  function tirerLaser(t) {
    const dx = t.aim.x - t.x, dz = t.aim.z - t.z;
    const norm = Math.hypot(dx, dz) || 1;
    const dirX = dx / norm, dirZ = dz / norm;
    const maille = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.9, (W + D)),
      new THREE.MeshBasicMaterial({ color: 0xcba6f7, transparent: true, opacity: 0.9 })
    );
    maille.position.set(t.x, 2.4, t.z);
    maille.rotation.y = Math.atan2(dirX, dirZ);
    scene.add(maille);
    state.rayons.push({
      mesh: maille, x: t.x, z: t.z, dirX, dirZ,
      degats: t.degats, duree: 3, vie: 3, touche: new Set(),
    });
    t.angle = Math.atan2(dirX, dirZ);
    journal("LASER déclenché (faisceau de 7 px → 1 px).");
  }

  function tirerMortier(t) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 10), matiere(0xf9e2af, 0.8));
    mesh.position.set(t.x, 3, t.z);
    scene.add(mesh);
    state.obus.push({
      mesh, x0: t.x, z0: t.z, x1: t.aim.x, z1: t.aim.z,
      duree: 1.1, vie: 1.1, degats: t.degats,
    });
    t.angle = Math.atan2(t.aim.x - t.x, t.aim.z - t.z);
    journal("MORTIER : obus en vol.");
  }

  function exploser(x, z, degats, rayon) {
    burst(x, z, 0xf9e2af, rayon);
    for (const e of state.ennemis) {
      if (e.vivant && Math.hypot(e.x - x, e.z - z) <= rayon) blesser(e, degats);
    }
  }

  // ---------------------------------------------------------------- sillage
  function majCercle(t) {
    const reste = Math.max(0, t.capacite - t.utilise);
    t.cercle.visible = reste > 0.8;
    t.cercle.scale.setScalar(Math.max(0.001, reste));
  }

  function majTrace(t) {
    const geo = t.trace.geometry;
    const n = t.trailPts.length;
    const col = new THREE.Color(WEAPONS[t.type].couleur);
    for (let i = 0; i < n && i < 400; i++) {
      const p = t.trailPts[i];
      t.positions[i * 3] = p.x;
      t.positions[i * 3 + 1] = 0.12;
      t.positions[i * 3 + 2] = p.z;
      const fade = 0.25 + 0.75 * (i / Math.max(1, n - 1));
      t.couleurs[i * 3] = col.r * fade;
      t.couleurs[i * 3 + 1] = col.g * fade;
      t.couleurs[i * 3 + 2] = col.b * fade;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, Math.min(n, 400));
  }

  function clampTerrain(p) {
    p.x = Math.max(-W / 2 + 6, Math.min(W / 2 - 6, p.x));
    p.z = Math.max(-D / 2 + 6, Math.min(D / 2 - 6, p.z));
    return p;
  }

  // ---------------------------------------------------------------- entrées
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("pointerdown", (e) => {
    if (state.phase !== "planif") { demarrerOrbite(e); return; }
    const p = pointSol(e);
    if (e.button === 2) {
      if (p && state.selection != null) {
        const t = state.tours[state.selection];
        if (t.type !== "gatling") {
          const c = clampTerrain(p.clone());
          t.aim = { x: c.x, z: c.z };
          journal(WEAPONS[t.type].nom + " : visée définie (" + Math.round(c.x) + ", " + Math.round(c.z) + ").");
        }
      }
      demarrerOrbite(e);
      return;
    }
    if (!p) return;
    // clic gauche : sélection + drag de sillage
    let trouvee = null;
    for (const t of state.tours) {
      if (Math.hypot(t.x - p.x, t.z - p.z) < 6) { trouvee = t; break; }
    }
    if (trouvee) {
      state.selection = state.tours.indexOf(trouvee);
      state.drag = { t: trouvee, deplace: 0 };
      trouvee.trailPts = [{ x: trouvee.x, z: trouvee.z }];
      majTrace(trouvee);
      journal(WEAPONS[trouvee.type].nom + " sélectionnée — réserve " +
        (trouvee.capacite - trouvee.utilise) + " px.");
    } else {
      state.selection = null;
      state.drag = null;
      demarrerOrbite(e);
    }
    majHud();
  });

  function demarrerOrbite(e) {
    state.orbite = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  }

  canvas.addEventListener("pointermove", (e) => {
    const p = pointSol(e);
    if (p) state.souris = { x: p.x, z: p.z };

    if (state.orbite) {
      cam.theta -= (e.clientX - state.orbite.x) * 0.005;
      cam.phi = Math.max(0.14, Math.min(1.32, cam.phi - (e.clientY - state.orbite.y) * 0.004));
      state.orbite = { x: e.clientX, y: e.clientY };
      majCamera();
      return;
    }

    if (state.drag && state.phase === "planif") {
      if (!p) return;
      const t = state.drag.t;
      const reste = t.capacite - t.utilise - state.drag.deplace;
      let dx = p.x - t.x, dz = p.z - t.z;
      const d = Math.hypot(dx, dz);
      const consommable = Math.max(0, reste - state.drag.deplace);
      if (d > consommable && d > 0.001) {
        const k = consommable / d;
        dx *= k; dz *= k;
        p.x = t.x + dx; p.z = t.z + dz;
      }
      const reel = Math.min(d, consommable);
      state.drag.deplace += reel;
      t.x = clampTerrain(p).x;
      t.z = clampTerrain(p).z;
      t.trailPts.push({ x: t.x, z: t.z });
      if (t.trailPts.length > 380) t.trailPts.shift();
      majTrace(t);
      // le cercle virtuel rétrécit en temps réel, centré sur le pointeur
      t.cercle.visible = reste > 0.8;
      t.cercle.scale.setScalar(Math.max(0.001, reste));
    }
    majSillageHud();
  });

  window.addEventListener("pointerup", () => {
    if (state.drag) {
      const t = state.drag.t;
      t.utilise = Math.min(t.capacite, t.utilise + state.drag.deplace);
      majCercle(t);
      journal(WEAPONS[t.type].nom + " : sillage tracé (" +
        Math.round(state.drag.deplace) + " px, reste " +
        Math.round(t.capacite - t.utilise) + " px).");
    }
    state.drag = null;
    state.orbite = null;
    majHud();
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    cam.dist = Math.max(70, Math.min(320, cam.dist + e.deltaY * 0.12));
    majCamera();
  }, { passive: false });

  document.getElementById("btn-resolve").addEventListener("click", lancerResolution);
  document.getElementById("btn-reset").addEventListener("click", () => {
    if (state.phase !== "planif") return;
    for (const t of state.tours) {
      t.utilise = 0;
      t.trailPts = [{ x: t.x, z: t.z }];
      majTrace(t);
      majCercle(t);
    }
    journal("Réserves de déplacement restaurées.");
    majHud();
  });
  document.getElementById("btn-start").addEventListener("click", () => {
    document.getElementById("overlay").classList.add("hidden");
    demarrerPlanif();
  });

  // ---------------------------------------------------------------- arsenal
  function majArsenal() {
    const el = document.getElementById("arsenal");
    el.innerHTML = "";
    state.tours.forEach((t, i) => {
      const d = document.createElement("div");
      d.className = "unit" + (state.selection === i ? " sel" : "");
      d.innerHTML =
        '<span class="dot" style="background:' + WEAPONS[t.type].hex + '"></span>' +
        '<b>' + WEAPONS[t.type].nom + '</b>' +
        '<span class="dep">réserve ' + Math.round(t.capacite - t.utilise) + '/' + t.capacite + '</span>';
      d.addEventListener("click", () => {
        if (state.phase !== "planif") return;
        state.selection = state.selection === i ? null : i;
        majHud();
      });
      el.appendChild(d);
    });
  }

  function majSillageHud() {
    if (state.selection == null) { document.getElementById("hud-sillage").textContent = "—"; return; }
    const t = state.tours[state.selection];
    document.getElementById("hud-sillage").textContent =
      Math.round(Math.max(0, t.capacite - t.utilise - (state.drag ? state.drag.deplace : 0))) + " px";
  }

  function majHud() {
    document.getElementById("hud-turn").textContent = state.tour + "/" + MAX_TURNS;
    document.getElementById("hud-core").textContent = Math.max(0, state.noyauHp) + " PV";
    document.getElementById("hud-enemies").textContent = state.ennemis.filter((e) => e.vivant).length;
    majSillageHud();

    const ph = document.getElementById("phase-label");
    if (state.phase === "planif") { ph.textContent = "PLANIFICATION"; ph.className = "phase planif"; }
    else if (state.phase === "resolution") { ph.textContent = "RÉSOLUTION WEGO"; ph.className = "phase resolution"; }
    else if (state.phase === "victoire") { ph.textContent = "VICTOIRE"; ph.className = "phase fin"; }
    else if (state.phase === "defaite") { ph.textContent = "DÉFAITE"; ph.className = "phase resolution"; }
    else { ph.textContent = "INTRO"; ph.className = "phase planif"; }

    document.getElementById("btn-resolve").disabled = state.phase !== "planif";
    document.getElementById("timer").textContent =
      state.phase === "resolution" ? state.resolutionT.toFixed(1) + " s" : "";
    majArsenal();
  }

  // ---------------------------------------------------------------- visées (éphémères)
  function dessinerAides() {
    if (state.aideTir) {
      scene.remove(state.aideTir);
      state.aideTir = null;
    }
    // repère de visée laser : axe complet en planification, mis à jour en continu
    if (state.phase === "planif" && state.selection != null) {
      const t = state.tours[state.selection];
      if (t.type === "laser") {
        const dx = t.aim.x - t.x, dz = t.aim.z - t.z;
        const norm = Math.hypot(dx, dz) || 1;
        const ligne = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.15, W + D),
          new THREE.MeshBasicMaterial({ color: 0xcba6f7, transparent: true, opacity: 0.3 })
        );
        ligne.position.set(t.x, 0.4, t.z);
        ligne.rotation.y = Math.atan2(dx / norm, dz / norm);
        scene.add(ligne);
        state.aideTir = ligne;
      }
      if (t.type === "mortier") {
        const pos = new THREE.Mesh(
          new THREE.RingGeometry(9.4, 10.5, 48),
          new THREE.MeshBasicMaterial({ color: 0xf9e2af, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
        );
        pos.rotation.x = -Math.PI / 2;
        pos.position.set(t.aim.x, 0.4, t.aim.z);
        const point = new THREE.Mesh(
          new THREE.SphereGeometry(0.7),
          new THREE.MeshBasicMaterial({ color: 0xf9e2af })
        );
        point.position.set(t.aim.x, 0.6, t.aim.z);
        const grp = new THREE.Group();
        grp.add(pos, point);
        scene.add(grp);
        state.aideTir = grp;
      }
    }
  }

  // ---------------------------------------------------------------- boucle
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function purgeMorts() {
    state.ennemis = state.ennemis.filter((e) => {
      if (!e.vivant) {
        if (e.mesh.parent) scene.remove(e.mesh);
        return false;
      }
      return true;
    });
  }

  let dernier = performance.now();
  function boucle(temps) {
    const dt = Math.min(0.05, (temps - dernier) / 1000);
    dernier = temps;
    maj(dt);
    dessinerAides();
    purgeMorts();
    renderer.render(scene, camera);
    requestAnimationFrame(boucle);
  }

  engendrerPartie();
  majCamera();
  majHud();
  requestAnimationFrame(boucle);
})();
