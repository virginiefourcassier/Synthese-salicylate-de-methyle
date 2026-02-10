(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  const diagStateEl = document.getElementById("diagState");
  const btnPause = document.getElementById("btnPause");
  const btnReset = document.getElementById("btnReset");
  const btnLabels = document.getElementById("btnLabels");

  const saRange = document.getElementById("saRange");
  const meRange = document.getElementById("meRange");
  const tRange  = document.getElementById("tRange");

  const saVal = document.getElementById("saVal");
  const meVal = document.getElementById("meVal");
  const tVal  = document.getElementById("tVal");

  const W = canvas.width;
  const H = canvas.height;

  // --- Réglages ---
  const BASE = { dt: 1/60, speedMul: 1.0, reactionChance: 0.010, kick: 0.35 };
  const DIAG = { speedMul: 2.5, reactionChance: 0.16,  kick: 0.85 };

  let diagnostic = false;      // masqué
  let paused = false;
  let showLabels = false;
  let temperature = 1;         // 1 à 5

  // --- Visuel : grossissement demandé ---
  const VIS_SCALE = 1.45;      // grossit toutes les molécules
  const ATOM_R = { C: 7.5*VIS_SCALE, H: 5.2*VIS_SCALE, O: 7.8*VIS_SCALE };
  const BOND_W = 3.6*VIS_SCALE;

  // Couleurs atomes (kit moléculaire)
  const ATOM_COLOR = { C:"#2b2b2b", H:"#f5f5f5", O:"#e53935" };
  function atomStroke(sym){ return (sym==="H") ? "rgba(0,0,0,0.40)" : "rgba(0,0,0,0.25)"; }

  // Physique (collisions disque) : rayon augmenté pour coller au grossissement
  const speciesPhysics = {
    SA:   { R: 18*VIS_SCALE, m: 5.0, vmax: 0.55 },
    MeOH: { R: 14*VIS_SCALE, m: 1.0, vmax: 1.55 },
    MS:   { R: 19*VIS_SCALE, m: 4.6, vmax: 0.75 },
    H2O:  { R: 12*VIS_SCALE, m: 0.8, vmax: 1.70 },
  };

  // --- Modèles compacts (coords relatives) ---
  const MODELS = {
    MeOH: {
      scale: 1.0,
      atoms: [
        { sym:"C", x: 0.0,  y: 0.0 },   // 0
        { sym:"O", x: 16.0, y: 0.0 },   // 1
        { sym:"H", x:-10.0, y:-10.0 },  // 2
        { sym:"H", x:-12.0, y:  8.0 },  // 3
        { sym:"H", x: -2.0, y: 14.0 },  // 4
        { sym:"H", x: 28.0, y: -8.0 },  // 5 (sur O)
      ],
      bonds: [[0,1],[0,2],[0,3],[0,4],[1,5]],
    },

    H2O: {
      scale: 1.0,
      atoms: [
        { sym:"O", x: 0.0, y: 0.0 },
        { sym:"H", x:-12.0, y: 9.0 },
        { sym:"H", x: 12.0, y: 9.0 },
      ],
      bonds: [[0,1],[0,2]],
    },

    SA: (() => {
      // Anneau (6C) + CO2H + OH (simplifié)
      const atoms = [];
      const R = 16;
      for (let k=0;k<6;k++){
        const a = (Math.PI/3)*k - Math.PI/6;
        atoms.push({ sym:"C", x: R*Math.cos(a), y: R*Math.sin(a) });
      }
      // CO2H sur C0
      atoms.push({ sym:"C", x: atoms[0].x + 18, y: atoms[0].y - 2 });   // 6
      atoms.push({ sym:"O", x: atoms[6].x + 14, y: atoms[6].y - 10 });  // 7
      atoms.push({ sym:"O", x: atoms[6].x + 14, y: atoms[6].y + 10 });  // 8
      atoms.push({ sym:"H", x: atoms[8].x + 10, y: atoms[8].y + 6 });   // 9
      // OH ortho sur C3
      atoms.push({ sym:"O", x: atoms[3].x - 16, y: atoms[3].y + 6 });   // 10
      atoms.push({ sym:"H", x: atoms[10].x - 10, y: atoms[10].y + 8 }); // 11

      const bonds = [];
      for (let k=0;k<6;k++) bonds.push([k,(k+1)%6]);
      bonds.push([0,6],[6,7],[6,8],[8,9],[3,10],[10,11]);

      return { scale: 0.92, atoms, bonds };
    })(),

    MS: (() => {
      // SA où CO2H -> CO2CH3 (simplifié)
      const atoms = [];
      const R = 16;
      for (let k=0;k<6;k++){
        const a = (Math.PI/3)*k - Math.PI/6;
        atoms.push({ sym:"C", x: R*Math.cos(a), y: R*Math.sin(a) });
      }
      // carbonyle
      atoms.push({ sym:"C", x: atoms[0].x + 18, y: atoms[0].y - 2 });     // 6
      atoms.push({ sym:"O", x: atoms[6].x + 14, y: atoms[6].y - 10 });    // 7
      atoms.push({ sym:"O", x: atoms[6].x + 14, y: atoms[6].y + 10 });    // 8
      // CH3 sur O
      atoms.push({ sym:"C", x: atoms[8].x + 16, y: atoms[8].y + 2 });     // 9
      atoms.push({ sym:"H", x: atoms[9].x + 10, y: atoms[9].y - 10 });    // 10
      atoms.push({ sym:"H", x: atoms[9].x + 12, y: atoms[9].y + 8 });     // 11
      atoms.push({ sym:"H", x: atoms[9].x - 2,  y: atoms[9].y + 14 });    // 12
      // OH ortho
      atoms.push({ sym:"O", x: atoms[3].x - 16, y: atoms[3].y + 6 });     // 13
      atoms.push({ sym:"H", x: atoms[13].x - 10, y: atoms[13].y + 8 });   // 14

      const bonds = [];
      for (let k=0;k<6;k++) bonds.push([k,(k+1)%6]);
      bonds.push([0,6],[6,7],[6,8],[8,9],[9,10],[9,11],[9,12],[3,13],[13,14]);

      return { scale: 0.92, atoms, bonds };
    })(),
  };

  // --- Utilitaires ---
  function rand(min, max){ return min + Math.random()*(max-min); }
  function len(x,y){ return Math.hypot(x,y); }

  function currentParams(){
    if (!diagnostic) return BASE;
    return { dt: BASE.dt, speedMul: DIAG.speedMul, reactionChance: DIAG.reactionChance, kick: DIAG.kick };
  }

  function randomVelocity(type){
    const vmax = speciesPhysics[type].vmax * (0.75 + 0.25*temperature); // agitation ↑ avec T
    const a = rand(0, Math.PI*2);
    const s = rand(0.35*vmax, vmax);
    return { vx: Math.cos(a)*s, vy: Math.sin(a)*s };
  }

  function makeParticle(type, x, y, vx, vy){
    const p = speciesPhysics[type];
    return {
      type, x, y, vx, vy,
      r: p.R, m: p.m,
      ang: rand(0, Math.PI*2),
      wang: rand(-0.015, 0.015),
    };
  }

  let particles = [];

  function spawnMany(type, n, region){
    const out = [];
    let tries = 0;
    while (out.length < n && tries < 12000){
      tries++;
      const x = rand(region.x0, region.x1);
      const y = rand(region.y0, region.y1);
      const {vx, vy} = randomVelocity(type);
      const c = makeParticle(type, x, y, vx, vy);

      let ok = true;
      for (const q of particles.concat(out)){
        if (len(c.x-q.x, c.y-q.y) < c.r + q.r + 4) { ok = false; break; }
      }
      if (ok) out.push(c);
    }
    return out;
  }

  function syncUI(){
    saVal.textContent = saRange.value;
    meVal.textContent = meRange.value;
    tVal.textContent  = tRange.value;
    temperature = parseInt(tRange.value, 10);
  }

  function reset(){
    particles = [];

    const nSA = parseInt(saRange.value, 10);
    const nMe = parseInt(meRange.value, 10);

    // Zones
    const saRegion = { x0: W*0.25, x1: W*0.75, y0: H*0.60, y1: H*0.90 };
    const meRegion = { x0: W*0.15, x1: W*0.85, y0: H*0.18, y1: H*0.74 };

    particles.push(...spawnMany("SA", nSA, saRegion));
    particles.push(...spawnMany("MeOH", nMe, meRegion));

    paused = false;
    btnPause.textContent = "⏸ Pause";
  }

  function wallBounce(p){
    if (p.x - p.r < 0) { p.x = p.r; p.vx *= -1; }
    if (p.x + p.r > W) { p.x = W - p.r; p.vx *= -1; }
    if (p.y - p.r < 0) { p.y = p.r; p.vy *= -1; }
    if (p.y + p.r > H) { p.y = H - p.r; p.vy *= -1; }
  }

  function resolveCollision(a, b){
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1e-9;
    if (dist >= a.r + b.r) return;

    const nx = dx/dist, ny = dy/dist;

    // dépénétration
    const overlap = (a.r + b.r) - dist;
    if (overlap > 0){
      const total = a.m + b.m;
      a.x -= nx * overlap * (b.m/total);
      a.y -= ny * overlap * (b.m/total);
      b.x += nx * overlap * (a.m/total);
      b.y += ny * overlap * (a.m/total);
    }

    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    const rel = rvx*nx + rvy*ny;
    if (rel > 0) return;

    const e = 0.98;
    const j = -(1+e)*rel / (1/a.m + 1/b.m);
    a.vx -= (j/a.m)*nx; a.vy -= (j/a.m)*ny;
    b.vx += (j/b.m)*nx; b.vy += (j/b.m)*ny;
  }

  // Réaction : SA + MeOH -> MS + H2O (1:1)
  function maybeReact(i, j){
    const A = particles[i], B = particles[j];
    if (!A || !B) return false;

    const okPair =
      (A.type==="SA" && B.type==="MeOH") ||
      (A.type==="MeOH" && B.type==="SA");
    if (!okPair) return false;

    const { reactionChance, kick } = currentParams();
    const chance = reactionChance * (0.6 + 0.4*temperature); // T augmente la probabilité
    if (Math.random() > chance) return false;

    const x = (A.x + B.x)/2;
    const y = (A.y + B.y)/2;

    const v1 = randomVelocity("MS");
    const v2 = randomVelocity("H2O");

    const MS  = makeParticle("MS",  x-14, y, v1.vx + kick, v1.vy);
    const H2O = makeParticle("H2O", x+14, y, v2.vx - kick, v2.vy);

    const a = Math.max(i,j), b = Math.min(i,j);
    particles.splice(a,1);
    particles.splice(b,1);
    particles.push(MS, H2O);
    return true;
  }

  function step(){
    const { dt, speedMul } = currentParams();

    const jitter = 0.010 * temperature;

    for (const p of particles){
      p.x += p.vx * 60 * dt * speedMul;
      p.y += p.vy * 60 * dt * speedMul;

      // agitation thermique
      p.vx += rand(-jitter, jitter);
      p.vy += rand(-jitter, jitter);

      p.ang += p.wang;

      // limite vitesse (augmente un peu avec T)
      const vmax = speciesPhysics[p.type].vmax * (0.9 + 0.25*temperature) * (diagnostic ? 1.25 : 1.0);
      const v = Math.hypot(p.vx, p.vy);
      if (v > vmax){ p.vx *= vmax/v; p.vy *= vmax/v; }

      wallBounce(p);
    }

    for (let i=0;i<particles.length;i++){
      for (let j=i+1;j<particles.length;j++){
        const a = particles[i], b = particles[j];
        if (Math.hypot(b.x-a.x, b.y-a.y) < a.r + b.r){
          if (maybeReact(i,j)) return;
          resolveCollision(a,b);
        }
      }
    }
  }

  // --- Dessin ---
  function transformPoint(px, py, ang){
    const ca = Math.cos(ang), sa = Math.sin(ang);
    return { x: px*ca - py*sa, y: px*sa + py*ca };
  }

  function drawMolecule(p){
    const model = MODELS[p.type];
    if (!model) return;

    // grossissement
    const s = VIS_SCALE * (model.scale || 1.0);

    // liaisons
    ctx.lineCap = "round";
    ctx.lineWidth = BOND_W;
    ctx.strokeStyle = "rgba(40,40,40,0.55)";

    for (const [i,j] of model.bonds){
      const ai = model.atoms[i];
      const aj = model.atoms[j];
      const pi = transformPoint(ai.x*s, ai.y*s, p.ang);
      const pj = transformPoint(aj.x*s, aj.y*s, p.ang);

      ctx.beginPath();
      ctx.moveTo(p.x + pi.x, p.y + pi.y);
      ctx.lineTo(p.x + pj.x, p.y + pj.y);
      ctx.stroke();
    }

    // atomes
    for (const a of model.atoms){
      const tp = transformPoint(a.x*s, a.y*s, p.ang);
      const x = p.x + tp.x;
      const y = p.y + tp.y;
      const sym = a.sym;

      const r = ATOM_R[sym] || (6*VIS_SCALE);

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI*2);
      ctx.fillStyle = ATOM_COLOR[sym] || "#cccccc";
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = atomStroke(sym);
      ctx.stroke();

      if (showLabels){
        ctx.font = `bold ${Math.max(11, 11*VIS_SCALE)}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = (sym === "H") ? "#111" : "#fff";
        ctx.fillText(sym, x, y);
      }
    }
  }

  function countTypes(){
    const c = { SA:0, MeOH:0, MS:0, H2O:0 };
    for (const p of particles) c[p.type]++;
    return c;
  }

  function roundRect(x,y,w,h,r){
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr,y);
    ctx.arcTo(x+w,y,x+w,y+h,rr);
    ctx.arcTo(x+w,y+h,x,y+h,rr);
    ctx.arcTo(x,y+h,x,y,rr);
    ctx.arcTo(x,y,x+w,y,rr);
    ctx.closePath();
  }

  function drawHUD(){
    const c = countTypes();
    const lines = [
      `Acide salicylique : ${c.SA}`,
      `Méthanol : ${c.MeOH}`,
      `Salicylate de méthyle : ${c.MS}`,
      `Eau : ${c.H2O}`,
    ];

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto, Arial";

    const x=14, y=14, pad=12, w=430, h=pad*2 + lines.length*20 + 6;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    roundRect(x,y,w,h,12);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(0,0,0,0.10)";
    ctx.stroke();

    ctx.fillStyle = "rgba(0,0,0,0.86)";
    let yy = y + pad + 16;
    for (const s of lines){ ctx.fillText(s, x+pad, yy); yy += 20; }
  }

  function draw(){
    ctx.clearRect(0,0,W,H);
    for (const p of particles) drawMolecule(p);
    drawHUD();
  }

  function loop(){
    if (!paused) step();
    draw();
    requestAnimationFrame(loop);
  }

  // UI
  btnPause.addEventListener("click", () => {
    paused = !paused;
    btnPause.textContent = paused ? "▶ Reprendre" : "⏸ Pause";
  });

  btnReset.addEventListener("click", reset);

  btnLabels.addEventListener("click", () => {
    showLabels = !showLabels;
    btnLabels.textContent = showLabels ? "🔤 Masquer symboles" : "🔤 Afficher symboles";
  });

  saRange.addEventListener("input", () => { syncUI(); reset(); });
  meRange.addEventListener("input", () => { syncUI(); reset(); });
  tRange.addEventListener("input",  () => { syncUI(); /* pas de reset */ });

  // raccourcis prof masqués (conservés)
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "d") { diagnostic = !diagnostic; diagStateEl.textContent = diagnostic ? "ON" : "OFF"; }
  });

  // init
  syncUI();
  reset();
  diagStateEl.textContent = "OFF";
  btnLabels.textContent = "🔤 Afficher symboles";
  loop();
})();