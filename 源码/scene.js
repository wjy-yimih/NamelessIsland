/* 未名岛 · a small place that keeps growing. Entirely offline, hand-drawn Canvas. */
(function () {
  'use strict';
  const W = 900, H = 560, TAU = Math.PI * 2;
  let canvas, ctx, art, artCtx, running = false, raf = 0, last = 0;
  let weather = 'clear', time = 'night', progress = 0, reduced = false;
  let width = W, height = H, dpr = 1, scale = 1, offsetX = 0, offsetY = 0;
  let resizeObserver, motionQuery, elapsed = 0, burst = [], lastTouch = 0;
  const rand = (seed) => { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const rng = rand(71629);
  const stars = Array.from({ length: 78 }, () => ({ x: 62 + rng() * 778, y: 18 + rng() * 282, r: .5 + rng() * 1.2, p: rng() * TAU }));
  const motes = Array.from({ length: 22 }, () => ({ x: 200 + rng() * 500, y: 210 + rng() * 200, p: rng() * TAU, speed: .22 + rng() * .4, r: .7 + rng() * .8 }));
  const precipitation = Array.from({ length: 95 }, () => ({ x: rng() * W, y: rng() * H, speed: .65 + rng(), p: rng() * TAU }));
  const trees = [
    [289, 230, .95, 0], [338, 224, 1.23, 1], [390, 224, .92, 0],
    [633, 250, 1.03, 1], [673, 270, 1.2, 0], [710, 294, .79, 1],
    [219, 280, 1.14, 0], [256, 295, .72, 1], [296, 270, .82, 1],
    [213, 325, .66, 0], [261, 346, 1.03, 0], [306, 369, .77, 1],
    [666, 354, .91, 0], [713, 334, .62, 1], [615, 379, .58, 1]
  ];
  const palette = () => time === 'dawn' ? {
    land: '#52715d', landLight: '#69826a', landDark: '#3d6153', rim: '#8a9b76',
    rock: '#273f41', rockLight: '#3d5652', rockDark: '#1b3037', tree: '#255447', treeLight: '#3e7055', treeDark: '#1c403b', water: '#5f9e9b', waterLight: '#b1d1b6'
  } : {
    land: '#375b4d', landLight: '#4c6f55', landDark: '#294a42', rim: '#6d8160',
    rock: '#20383b', rockLight: '#304d49', rockDark: '#152a32', tree: '#214d40', treeLight: '#376448', treeDark: '#163a34', water: '#4a8a87', waterLight: '#a6c4ac'
  };
  function poly(c, points, fill, stroke, lineWidth = 1) {
    c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lineWidth; c.lineJoin = 'round'; c.stroke(); }
  }
  function line(c, points, color, w = 1) {
    c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
  }
  function ellipse(c, x, y, rx, ry, fill, rotation = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rotation, 0, TAU); c.fillStyle = fill; c.fill(); }
  function glow(c, x, y, r, color) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(224,181,102,0)'); c.fillStyle = g; c.fillRect(x-r, y-r, r*2, r*2); }
  function landPath(c) {
    c.beginPath(); c.moveTo(137, 285); c.bezierCurveTo(163, 252, 186, 234, 224, 218);
    c.lineTo(329, 185); c.quadraticCurveTo(406, 169, 459, 176); c.lineTo(585, 188);
    c.quadraticCurveTo(635, 197, 679, 224); c.lineTo(744, 271); c.quadraticCurveTo(767, 291, 785, 315);
    c.lineTo(716, 367); c.quadraticCurveTo(674, 393, 590, 404); c.lineTo(441, 412);
    c.quadraticCurveTo(341, 401, 249, 361); c.lineTo(161, 309); c.closePath();
  }
  function streamPath(c) {
    c.beginPath(); c.moveTo(399, 230); c.bezierCurveTo(424, 247, 415, 261, 384, 274);
    c.bezierCurveTo(355, 286, 333, 300, 357, 316); c.bezierCurveTo(382, 332, 421, 328, 427, 349);
    c.bezierCurveTo(433, 372, 397, 386, 404, 408);
  }
  function rock(c, x, y, s, tint) {
    const p = palette(); ellipse(c, x+3*s, y+3*s, 19*s, 7*s, 'rgba(8,29,27,.25)');
    poly(c, [[x-17*s,y],[x-12*s,y-13*s],[x+3*s,y-20*s],[x+17*s,y-9*s],[x+15*s,y+3*s],[x-2*s,y+8*s]], tint || p.rockLight);
    poly(c, [[x-12*s,y-13*s],[x+3*s,y-20*s],[x+17*s,y-9*s],[x,y-4*s]], '#52695b');
    poly(c, [[x,y-4*s],[x+17*s,y-9*s],[x+15*s,y+3*s],[x-2*s,y+8*s]], p.rock);
    line(c, [[x-11*s,y-11*s],[x+1*s,y-17*s],[x+8*s,y-13*s]], '#73816a', .7);
  }
  function fern(c, x, y, s = 1, color = '#6d8961') {
    line(c, [[x,y],[x-3*s,y-15*s]], color, .9);
    for (let i = 0; i < 5; i++) { const yy = y - i*2.6*s; line(c, [[x-2*i/5*s,yy],[x-(8-i)*s,yy-5*s]], color, .8); line(c, [[x-2*i/5*s,yy],[x+(7-i)*s,yy-6*s]], color, .8); }
  }
  function tree(c, x, y, s, variant = 0) {
    const p = palette(), h = 103*s, w = 32*s;
    ellipse(c, x+6*s, y+3*s, 29*s, 9*s, 'rgba(9,31,27,.27)', -.08);
    line(c, [[x,y],[x-1*s,y-56*s]], '#615e43', 5*s);
    line(c, [[x+1*s,y-1*s],[x+1*s,y-47*s]], '#9b8b5b', 1*s);
    const levels = [[.03,.39,.36],[.17,.60,.57],[.36,.82,.79],[.56,1,1]];
    levels.slice().reverse().forEach(([top,bottom,wide], index) => {
      const topY = y-h+top*h, baseY = y-h+bottom*h-5*s, ww = w*wide;
      poly(c, [[x,topY],[x-ww*.33,topY+(baseY-topY)*.42],[x-ww*.23,topY+(baseY-topY)*.41],[x-ww*.69,topY+(baseY-topY)*.77],[x-ww*.58,topY+(baseY-topY)*.75],[x-ww,baseY],[x-ww*.35,baseY+5*s],[x+ww*.22,baseY+7*s],[x+ww,baseY-1*s],[x+ww*.58,topY+(baseY-topY)*.72],[x+ww*.69,topY+(baseY-topY)*.75],[x+ww*.26,topY+(baseY-topY)*.4],[x+ww*.37,topY+(baseY-topY)*.43]], variant ? p.treeLight : p.tree);
      poly(c, [[x,topY],[x+ww*.37,topY+(baseY-topY)*.43],[x+ww*.26,topY+(baseY-topY)*.4],[x+ww*.69,topY+(baseY-topY)*.75],[x+ww*.58,topY+(baseY-topY)*.72],[x+ww,baseY-1*s],[x+ww*.22,baseY+7*s],[x+ww*.08,baseY-4*s]], p.treeDark);
      line(c, [[x-ww*.78,baseY-2*s],[x-ww*.37,baseY+1*s],[x-ww*.04,baseY+2*s]], variant ? '#64815a' : '#4f7150', .8*s);
      if (weather === 'snow') { line(c, [[x-ww*.8,baseY-3*s],[x-ww*.34,baseY+1*s],[x+ww*.13,baseY+3*s]], '#c2d0bf', 3*s); }
      if (index < 2) line(c, [[x-ww*.3,topY+(baseY-topY)*.45],[x-ww*.05,topY+(baseY-topY)*.48]], '#6b8256', .65*s);
    });
  }
  function mushrooms(c, x, y, s = 1) {
    [[-4,0,.7],[5,4,1]].forEach(([dx,dy,k]) => { line(c, [[x+dx*s,y+dy*s],[x+dx*s,y+dy*s-7*k*s]], '#b8ad7f', 1.5*s); c.beginPath(); c.ellipse(x+dx*s,y+dy*s-7*k*s,5*k*s,3*k*s,0,Math.PI,TAU); c.fillStyle='#bc7957';c.fill(); ellipse(c,x+(dx-1)*s,y+(dy-8*k)*s,.75*s,.6*s,'#e9c695'); });
  }
  function island(c) {
    const p = palette();
    const shade = c.createRadialGradient(451, 486, 0, 451, 486, 290); shade.addColorStop(0, 'rgba(0,9,14,.29)'); shade.addColorStop(.68, 'rgba(0,9,14,.10)'); shade.addColorStop(1, 'rgba(0,9,14,0)');
    c.save(); c.translate(0,327); c.scale(1,.34); c.fillStyle=shade; c.fillRect(100,150,700,660); c.restore();
    poly(c, [[137,285],[161,309],[249,361],[441,412],[590,404],[716,367],[785,315],[749,377],[666,429],[593,447],[547,480],[456,511],[394,490],[335,466],[293,421],[222,397],[184,356]], p.rock);
    poly(c, [[161,309],[249,361],[293,421],[335,466],[273,437],[222,397],[184,356]], '#2b4240');
    poly(c, [[249,361],[360,400],[335,466],[293,421]], p.rockLight);
    poly(c, [[360,400],[441,412],[456,511],[394,490],[335,466]], '#1a3035');
    poly(c, [[441,412],[514,408],[547,480],[456,511]], '#29413f');
    poly(c, [[514,408],[590,404],[593,447],[547,480]], '#1b3135');
    poly(c, [[590,404],[716,367],[666,429],[593,447]], '#2b4440');
    poly(c, [[716,367],[785,315],[749,377],[666,429]], '#1a3235');
    poly(c, [[360,400],[335,466],[354,446],[373,424]], '#364f45');
    poly(c, [[441,412],[456,511],[470,464]], '#122b31');
    poly(c, [[590,404],[666,429],[635,400]], '#3c574a');
    line(c, [[233,369],[258,383],[270,407]], '#43564a', 1);
    line(c, [[304,389],[310,411],[326,420]], '#182e32', 1.3);
    line(c, [[565,425],[548,441],[553,455]], '#4a5b49', .8);
    line(c, [[702,382],[677,400],[668,414]], '#536451', .8);
    landPath(c); const top = c.createLinearGradient(350,160,470,420); top.addColorStop(0,p.landLight); top.addColorStop(.45,p.land); top.addColorStop(1,p.landDark); c.fillStyle=top; c.fill();
    c.save(); landPath(c);c.clip();
    ellipse(c, 388,269,119,57,'rgba(111,141,93,.16)',-.18); ellipse(c, 562,337,132,40,'rgba(130,146,90,.10)',.12);
    const r = rand(720); for(let i=0;i<190;i++){const x=156+r()*600,y=185+r()*225;ellipse(c,x,y,.6+r()*1.9,.35+r()*.7,i%3?'rgba(163,173,111,.17)':'rgba(9,37,32,.21)');}
    streamPath(c);c.lineWidth=32;c.strokeStyle='rgba(14,44,40,.38)';c.lineCap='round';c.stroke();
    streamPath(c);c.lineWidth=24;c.strokeStyle=p.water;c.stroke();
    streamPath(c);c.lineWidth=15;c.strokeStyle='rgba(124,175,156,.24)';c.stroke();
    c.restore();
    c.beginPath();c.moveTo(138,285);c.lineTo(162,306);c.lineTo(251,356);c.quadraticCurveTo(341,396,441,406);c.lineTo(590,399);c.quadraticCurveTo(672,389,716,362);c.lineTo(782,315);c.strokeStyle=p.rim;c.lineWidth=2.2;c.stroke();
    line(c,[[166,315],[251,366],[354,402]],'#193a34',4);
    // Hanging roots and a small tuft of ivy make the stone feel alive.
    [[225,358,21],[277,386,29],[329,401,18],[608,400,29],[686,381,21]].forEach(([x,y,h])=>{c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x-4,y+h*.4,x+5,y+h*.7,x-1,y+h);c.strokeStyle='#738260';c.lineWidth=1;c.stroke();for(let j=0;j<4;j++)ellipse(c,x+(j%2?3:-3),y+5+j*4,3.3,1.6,'#5e7850',j%2?.7:-.7);});
    // A calm pool sits above the little stream.
    ellipse(c,366,293,33,18,'rgba(19,54,47,.5)',-.2);ellipse(c,366,290,30,15,p.water,-.2);
    c.beginPath();c.ellipse(365,290,22,10,-.2,.1,2.7);c.strokeStyle='rgba(178,209,179,.52)';c.lineWidth=.9;c.stroke();
    ellipse(c,354,290,5.5,2.6,'#76976a',-.4);line(c,[[354,290],[359,288]],p.water,1);
    // Worn stones lead home.
    [[434,303,10,4],[454,305,11,5],[474,311,10,5],[495,318,11,5],[517,325,9,4],[538,331,10,4]].forEach(([x,y,rx,ry],i)=>{ellipse(c,x+1,y+2,rx,ry,'rgba(14,36,32,.28)',-.15);ellipse(c,x,y,rx,ry,i%2?'#7d8a6b':'#8f9674',-.15);line(c,[[x-rx*.5,y-1],[x+rx*.45,y-2]],'#acaa83',.7);});
    // A footbridge: every plank has a little light along its worn edge.
    ellipse(c,413,342,29,9,'rgba(10,31,27,.24)',.2);
    poly(c,[[390,323],[441,338],[433,352],[382,337]],'#514c38');
    for(let i=0;i<8;i++){const x=384+i*6.35,y=337+i*1.86;line(c,[[x,y],[x+8,y-13]],'#8c8660',4.9);line(c,[[x-1,y],[x+6,y-12]],'#b3a77a',.65);}
    [[387,327],[437,342]].forEach(([x,y])=>line(c,[[x,y],[x,y-13]],'#948a5f',2));
    line(c,[[387,314],[437,329]],'#8e8860',1.5);
    rock(c,398,235,.61);rock(c,381,245,.48);rock(c,343,311,.45);rock(c,440,370,.45);rock(c,742,315,.62);rock(c,181,288,.58);
    // A few small cairns, fern fronds and mushrooms reward a closer look.
    rock(c,567,379,.37);rock(c,567,371,.22);rock(c,568,366,.14);
    [[319,280,.8],[328,287,.65],[432,270,.55],[449,367,.85],[592,364,.65],[637,307,.7],[204,307,.6],[683,350,.6]].forEach(v=>fern(c,...v));
    mushrooms(c,284,327,.9);mushrooms(c,641,333,.8);mushrooms(c,460,277,.65);
    // Small flowers on the open south bank.
    const flower = rand(518);for(let i=0;i<18;i++){let x=466+flower()*114,y=355+flower()*25;line(c,[[x,y],[x+1,y-5]],'#6e8155',.8);ellipse(c,x+1,y-5,1.4,1.1,i%3?'#b0b886':'#d5bb7d');}
    if(weather==='snow'){c.save();landPath(c);c.clip();ellipse(c,505,360,74,16,'rgba(213,221,205,.15)',.1);ellipse(c,289,259,73,15,'rgba(213,221,205,.15)',-.3);c.restore();}
  }
  function cabin(c) {
    ellipse(c,548,301,89,31,'rgba(8,26,25,.25)',-.08);
    // A projecting wooden veranda.
    poly(c,[[462,288],[548,317],[622,280],[622,288],[548,327],[462,297]],'#3f4436');
    poly(c,[[459,287],[548,316],[624,279],[535,250]],'#727157');
    for(let i=0;i<11;i++)line(c,[[468+i*7.1,290+i*2.38],[537+i*7.1,254+i*2.38]],'#4b5340',.8);
    poly(c,[[480,304],[527,320],[527,329],[480,313]],'#8c8560');
    poly(c,[[476,313],[523,329],[523,336],[476,320]],'#6c6d4f');
    line(c,[[477,313],[523,329]],'#b0a477',1.1);
    // Gable and sheltered side wall.
    poly(c,[[474,226],[511,184],[548,251],[548,310],[474,285]],'#777054');
    poly(c,[[548,251],[609,219],[609,279],[548,310]],'#4a5141');
    for(let i=0;i<8;i++){line(c,[[476,237+i*7],[546,261+i*7]],'#514f3c',.8);line(c,[[550,257+i*6],[607,227+i*6]],'#333f35',.8);}
    line(c,[[477,228],[477,283],[548,308]],'#a0966b',1.8);line(c,[[548,253],[548,308],[607,277]],'#8e8a60',1.4);
    // Left and right roof planes with individual standing seams.
    poly(c,[[463,231],[507,174],[573,141],[530,198]],'#65736a');
    poly(c,[[507,174],[557,257],[624,223],[573,141]],'#42574f');
    poly(c,[[507,174],[557,257],[557,263],[503,177]],'#293f39');
    poly(c,[[557,257],[624,223],[624,229],[557,263]],'#233a35');
    for(let i=1;i<9;i++){const u=i/9;line(c,[[507+66*u,174-33*u],[557+67*u,257-34*u]],'#78907a',.8);}
    for(let i=1;i<6;i++){const u=i/6;line(c,[[507+50*u,174+83*u],[573+51*u,141+82*u]],'rgba(24,52,42,.42)',1.5);}
    for(let i=1;i<5;i++){const u=i/5;line(c,[[463+44*u,231-57*u],[530+43*u,198-57*u]],'#83917a',.8);}
    line(c,[[463,231],[507,174],[573,141],[624,223]],'#97a080',1.2);
    line(c,[[508,175],[557,257],[624,223]],'#819579',1);
    // Moss slowly follows the rain down the north edge.
    line(c,[[569,146],[578,160],[585,174]],'#778b5a',3);line(c,[[612,216],[604,220],[599,221]],'#657c50',3);
    // A proper brick chimney.
    poly(c,[[579,172],[591,178],[600,172],[588,167]],'#7e7a65');
    poly(c,[[579,172],[591,178],[591,144],[579,139]],'#7c7660');
    poly(c,[[591,178],[600,172],[600,139],[591,144]],'#4d5b4d');
    poly(c,[[576,139],[590,145],[603,138],[588,132]],'#969078');
    poly(c,[[581,138],[590,141],[597,137],[588,135]],'#2e3e37');
    for(let i=0;i<4;i++){line(c,[[580,147+i*7],[590,151+i*7],[599,146+i*7]],'rgba(43,58,44,.6)',.8);}
    // Amber windows: the front room, attic, and desk by the side window.
    glow(c,494,266,41,'rgba(244,185,93,.14)');
    poly(c,[[483,247],[505,254],[505,277],[483,270]],'#322f25','#aa9967',2);
    poly(c,[[485,249],[503,255],[503,274],[485,268]],'#edbb6d');
    poly(c,[[485,249],[503,255],[503,262],[485,256]],'#f6d88b');
    line(c,[[494,252],[494,271]],'#66583d',1.7);line(c,[[485,259],[503,265]],'#66583d',1.5);
    poly(c,[[481,270],[507,279],[507,282],[481,273]],'#b2a276');
    // Open shutters are deliberately slightly uneven.
    poly(c,[[479,248],[473,248],[473,269],[479,270]],'#394b3b','#7d825a',.6);
    poly(c,[[509,256],[515,261],[515,281],[509,277]],'#394b3b','#7d825a',.6);
    poly(c,[[565,259],[593,244],[593,268],[565,282]],'#26352d','#a79c6d',2);
    poly(c,[[567,260],[591,247],[591,266],[567,278]],'#eab96d');
    poly(c,[[568,262],[579,256],[579,272],[568,278]],'#f5d68c');
    line(c,[[579,254],[579,273]],'#665c3e',1.7);line(c,[[566,270],[592,257]],'#665c3e',1.5);
    // Curtains catch the last bit of lamplight.
    poly(c,[[567,260],[572,257],[571,271],[567,278]],'#dac695');poly(c,[[587,250],[591,247],[591,266],[588,267]],'#bba974');
    poly(c,[[519,262],[538,268],[538,305],[519,299]],'#39443a','#9e9468',1.3);
    poly(c,[[523,266],[534,270],[534,280],[523,276]],'#d7ab62');ellipse(c,534,290,1.4,1.4,'#d7bb78');
    ellipse(c,511,224,7,9,'#303a2e',-.2);ellipse(c,511,224,5,7,'#dcba75',-.2);line(c,[[511,218],[511,230]],'#756a48',1);line(c,[[506,222],[516,225]],'#756a48',1);
    // One little reading chair on the porch.
    line(c,[[593,289],[593,304],[602,299],[602,285]],'#b3a178',2);poly(c,[[587,289],[596,292],[605,287],[596,284]],'#a09168');line(c,[[587,289],[587,299]],'#8b805d',2);line(c,[[590,277],[600,280],[600,289],[590,286],[590,277]],'#a89569',2);
    // The handrail stops at the steps.
    [[465,289],[548,317],[620,282]].forEach(([x,y])=>line(c,[[x,y],[x,y-16]],'#8d8c64',2));
    line(c,[[548,302],[620,267]],'#a09b70',1.8);
    // Porch lantern, with a halo that never floods the whole scene.
    line(c,[[467,284],[467,264],[473,264]],'#a1976b',1.5);glow(c,468,278,24,'rgba(250,190,84,.22)');
    poly(c,[[464,272],[471,274],[471,282],[464,280]],'#efc775','#a78f59',.6);line(c,[[463,271],[468,269],[473,273]],'#b09d6b',1.5);
    // Split firewood under the eave.
    [[610,278],[615,280],[606,282]].forEach(([x,y])=>{line(c,[[x-3,y+3],[x+3,y]],'#8f7d55',4);ellipse(c,x-3,y+3,2,2,'#b09a6b');});
    if(weather==='snow'){line(c,[[464,230],[507,174],[573,141],[624,223]],'#cdd6c4',3);line(c,[[559,256],[621,225]],'#c0ceba',3);line(c,[[576,138],[588,132],[603,138]],'#dbe1d0',3);}
  }
  function details(c) {
    // A modest telescope, looking past the edge of the island.
    const x=344,y=362;line(c,[[x,y],[x-8,y+15]],'#a3a27b',1.3);line(c,[[x,y],[x+8,y+14]],'#a3a27b',1.3);line(c,[[x,y],[x+1,y+17]],'#818568',1.3);
    line(c,[[x-10,y-5],[x+13,y-15]],'#849892',5);line(c,[[x-10,y-5],[x-15,y-3]],'#b9bd9b',6);line(c,[[x+11,y-15],[x+15,y-17]],'#b9bd9b',6);line(c,[[x,y],[x+1,y-10]],'#8f9471',2);
    // A place for tomorrow: seedlings appear as things are saved.
    const n=Math.min(8,Math.max(0,progress));for(let i=0;i<n;i++){const x=479+i*14,y=378+Math.sin(i*.9)*5;ellipse(c,x,y+2,5,2,'rgba(8,31,25,.24)');line(c,[[x,y],[x,y-8]],'#a3b374',1);ellipse(c,x-3,y-6,3.5,1.6,'#87a66c',.6);ellipse(c,x+3,y-8,3.5,1.6,'#aec082',-.5);}
    // A sealed letter waits quietly on the doorstep.
    poly(c,[[511,312],[519,315],[524,312],[516,309]],'#c9bf91');line(c,[[511,312],[517,313],[516,309]],'#a09268',.5);
  }
  function bake() {
    if(!ctx)return;const p=palette();
    art=document.createElement('canvas');art.width=Math.round(W*dpr);art.height=Math.round(H*dpr);artCtx=art.getContext('2d');artCtx.scale(dpr,dpr);
    const c=artCtx;island(c);
    // Objects are depth sorted so the woods have actual space between them.
    const objects=trees.map(t=>({y:t[1],draw:()=>tree(c,...t)}));objects.push({y:309,draw:()=>cabin(c)});objects.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());details(c);
    // A small outlying stone and trailing roots below the main island.
    poly(c,[[315,462],[328,456],[343,463],[337,479],[326,486]],p.rock);poly(c,[[315,462],[328,456],[343,463],[327,467]],p.rockLight);
    line(c,[[497,493],[501,513],[498,524]],'#49664e',1);ellipse(c,500,513,4,1.8,'#648055',.6);
  }
  function sky(c,t) {
    const dawn=time==='dawn';
    // Transparent, broad glazes integrate into the surrounding interface.
    let g=c.createRadialGradient(dawn?604:447,158,0,447,224,340);g.addColorStop(0,dawn?'rgba(199,156,108,.13)':'rgba(66,114,111,.13)');g.addColorStop(1,'rgba(39,82,83,0)');c.fillStyle=g;c.fillRect(0,0,W,H);
    for(const s of stars){const a=(dawn?.24:.56)+Math.sin(t*.45+s.p)*.17;c.globalAlpha=Math.max(.06,a);ellipse(c,s.x,s.y,s.r,s.r,dawn?'#bdc5ae':'#b4c5b7');if(s.r>1.5){line(c,[[s.x-3,s.y],[s.x+3,s.y]],'#9bb4ad',.5);line(c,[[s.x,s.y-3],[s.x,s.y+3]],'#9bb4ad',.5);}}c.globalAlpha=1;
    // A thin crescent, kept small so the island remains the protagonist.
    c.save();c.translate(733,83);c.rotate(-.35);c.beginPath();c.moveTo(2,-16);c.bezierCurveTo(-19,-10,-18,14,3,17);c.bezierCurveTo(-9,6,-7,-7,2,-16);c.fillStyle=dawn?'#c9b987':'#c1c9a5';c.fill();c.restore();
    if(dawn){g=c.createRadialGradient(737,85,0,737,85,70);g.addColorStop(0,'rgba(236,196,122,.12)');g.addColorStop(1,'rgba(236,196,122,0)');c.fillStyle=g;c.fillRect(660,10,155,155);}
    // Wisps of cloud behind the floating land.
    [[164,395,84,13],[737,420,77,10],[126,198,53,8]].forEach(([x,y,rx,ry],i)=>{const dx=reduced?0:Math.sin(t*.07+i)*9;const g=c.createRadialGradient(x+dx,y,0,x+dx,y,rx);g.addColorStop(0,'rgba(139,169,153,.065)');g.addColorStop(1,'rgba(139,169,153,0)');c.save();c.translate(0,y);c.scale(1,ry/rx);c.translate(0,-y);c.fillStyle=g;c.fillRect(x+dx-rx,y-rx,rx*2,rx*2);c.restore();});
  }
  function water(c,t) {
    const p=palette();
    // Water slips over the front lip into nothing. Several translucent ribbons
    // avoid the solid plastic look of a single opaque waterfall.
    const g=c.createLinearGradient(402,398,402,485);g.addColorStop(0,'rgba(146,191,172,.80)');g.addColorStop(.48,'rgba(100,163,154,.56)');g.addColorStop(1,'rgba(100,163,154,0)');
    c.beginPath();c.moveTo(392,399);c.bezierCurveTo(398,422,386,444,394,474);c.quadraticCurveTo(402,482,411,476);c.bezierCurveTo(409,447,419,424,414,405);c.closePath();c.fillStyle=g;c.fill();
    for(let i=0;i<8;i++){const x=395+i*2.2, yy=405+((t*25+i*11)%67);c.beginPath();c.moveTo(x,yy);c.quadraticCurveTo(x-3,yy+7,x-1,yy+15);c.strokeStyle='rgba(193,221,196,'+(.12+(i%3)*.08)+')';c.lineWidth=i%2?.8:1.3;c.stroke();}
    ellipse(c,404,404,12,3,'rgba(195,215,183,.56)',.17);
    for(let i=0;i<3;i++){let z=(t*.3+i*.33)%1;ellipse(c,400+Math.sin(i*7)*10,471+z*16,3+z*10,1+z*3,'rgba(142,190,167,'+((1-z)*.08)+')');}
    // Little current marks in the pool are intentionally slow.
    c.beginPath();c.ellipse(370,291,12+Math.sin(t*.5)*2,4.2,-.2,.15,2.6);c.strokeStyle='rgba(196,217,182,.27)';c.lineWidth=.8;c.stroke();
    c.beginPath();c.moveTo(379,319);c.quadraticCurveTo(391,323,403,324);c.strokeStyle='rgba(185,211,175,.3)';c.lineWidth=.8;c.stroke();
  }
  function smoke(c,t) {
    if(reduced){c.beginPath();c.moveTo(589,132);c.bezierCurveTo(581,120,602,112,594,99);c.strokeStyle='rgba(179,186,161,.18)';c.lineWidth=5;c.lineCap='round';c.stroke();return;}
    for(let i=0;i<7;i++){const u=(t*.09+i/7)%1,x=590+Math.sin(u*8+t*.12)*7+u*15,y=132-u*74;ellipse(c,x,y,3+u*9,3+u*5,'rgba(185,193,172,'+((1-u)*.10)+')',-.3);}
  }
  function ambience(c,t) {
    if(weather==='clear'){
      for(const m of motes){const x=m.x+Math.sin(t*m.speed+m.p)*14,y=m.y+Math.cos(t*m.speed*.7+m.p)*8,a=.23+(Math.sin(t*.9+m.p)+1)*.24;c.globalAlpha=a;glow(c,x,y,9,'rgba(227,209,125,.15)');ellipse(c,x,y,m.r,m.r,'#dfd69b');}c.globalAlpha=1;
    }else if(weather==='rain'){
      c.save();c.lineWidth=.7;for(const q of precipitation){const x=(q.x-t*22*q.speed+W*100)%W,y=(q.y+t*190*q.speed)%H;c.strokeStyle='rgba(167,198,190,.19)';c.beginPath();c.moveTo(x,y);c.lineTo(x-3,y+12);c.stroke();}c.restore();
      for(let i=0;i<5;i++){let u=(t*.7+i*.2)%1;c.beginPath();c.ellipse(338+i*70,341+Math.sin(i*9)*28,u*7,u*2,0,0,TAU);c.strokeStyle='rgba(173,203,181,'+((1-u)*.2)+')';c.lineWidth=.5;c.stroke();}
    }else{
      for(const q of precipitation){const x=(q.x+Math.sin(t*.3+q.p)*13+t*4*q.speed)%W,y=(q.y+t*16*q.speed)%H;ellipse(c,x,y,.7+q.speed*.5,.7+q.speed*.5,'rgba(213,224,212,.57)');}
    }
    for(let i=burst.length-1;i>=0;i--){const b=burst[i],age=t-b.born;if(age>1.8){burst.splice(i,1);continue;}const u=age/1.8,a=(1-u)*.8,x=b.x+Math.cos(b.angle)*u*b.v,y=b.y+Math.sin(b.angle)*u*b.v-u*20;c.globalAlpha=a;ellipse(c,x,y,1.5*(1-u)+.3,1.5*(1-u)+.3,'#ead99b');}c.globalAlpha=1;
  }
  function draw(timestamp) {
    if(!ctx)return;
    const t=reduced?12:elapsed;
    ctx.clearRect(0,0,width,height);ctx.save();ctx.translate(offsetX,offsetY);ctx.scale(scale,scale);
    sky(ctx,t);ctx.drawImage(art,0,0,art.width,art.height,0,0,W,H);water(ctx,t);smoke(ctx,t);ambience(ctx,t);
    ctx.restore();
  }
  function frame(timestamp) {
    if(!running)return;raf=requestAnimationFrame(frame);
    if(timestamp-last<33)return;
    const dt=Math.min((timestamp-last)/1000,.08);last=timestamp;if(!reduced)elapsed+=dt;draw(timestamp);
  }
  function start(){if(!canvas||running||document.hidden)return;running=true;last=performance.now();draw(last);raf=requestAnimationFrame(frame);}
  function stop(){running=false;cancelAnimationFrame(raf);}
  function visibility(){if(document.hidden)stop();else start();}
  function resize(){
    if(!canvas)return;const host=canvas.parentElement,rect=canvas.getBoundingClientRect();
    width=Math.max(1,rect.width||host.clientWidth||W);height=Math.max(1,rect.height||host.clientHeight||width*H/W);
    dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    scale=Math.min(width/W,height/H);offsetX=(width-W*scale)/2;offsetY=(height-H*scale)/2;bake();draw(performance.now());
  }
  function pointer(event){
    const now=performance.now();if(now-lastTouch<140)return;lastTouch=now;const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left-offsetX)/scale,y=(event.clientY-r.top-offsetY)/scale;
    if(reduced)return;for(let i=0;i<12;i++)burst.push({x,y,angle:TAU*i/12,born:elapsed,v:18+rng()*30});
  }
  function mediaChange(e){reduced=e.matches;draw(performance.now());}
  window.IslandScene={
    init(element){
      if(canvas)this.destroy();canvas=element||document.getElementById('island-canvas');if(!canvas)return;ctx=canvas.getContext('2d');if(!ctx){canvas=null;return;}
      motionQuery=window.matchMedia('(prefers-reduced-motion: reduce)');reduced=motionQuery.matches;
      if(motionQuery.addEventListener)motionQuery.addEventListener('change',mediaChange);
      canvas.addEventListener('pointerdown',pointer,{passive:true});document.addEventListener('visibilitychange',visibility);window.addEventListener('resize',resize,{passive:true});
      if(window.ResizeObserver){resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas.parentElement);}
      resize();start();
    },
    setWeather(value){weather=['clear','rain','snow'].includes(value)?value:'clear';bake();draw(performance.now());},
    setTime(value){time=value==='dawn'?'dawn':'night';bake();draw(performance.now());},
    setProgress(value){progress=Math.max(0,Number(value)||0);bake();draw(performance.now());},
    setReducedMotion(value){reduced=Boolean(value);draw(performance.now());},
    destroy(){stop();if(resizeObserver)resizeObserver.disconnect();resizeObserver=null;if(motionQuery&&motionQuery.removeEventListener)motionQuery.removeEventListener('change',mediaChange);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('resize',resize);if(canvas)canvas.removeEventListener('pointerdown',pointer);canvas=null;ctx=null;art=null;burst=[];}
  };
})();
