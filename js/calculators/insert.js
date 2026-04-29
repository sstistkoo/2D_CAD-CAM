import { showToast } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { makeOverlay } from '../dialogFactory.js';

const vbdIsoData = {
  1: { title:'Tvar',options:[
    {v:'C',d:'Kosočtverec 80°',dt:'Dokončovací soustružení',svg:'<polygon points="35,5 53,35 35,65 17,35" fill="#3498db" stroke="#89b4fa" stroke-width="1.5"/>'},
    {v:'D',d:'Kosočtverec 55°',dt:'Kopírovací soustružení',svg:'<polygon points="35,8 55,35 35,62 15,35" fill="#e74c3c" stroke="#89b4fa" stroke-width="1.5"/>'},
    {v:'R',d:'Kruhový',dt:'Kopírovací operace, různorodé kontury',svg:'<circle cx="35" cy="35" r="22" fill="#9b59b6" stroke="#89b4fa" stroke-width="1.5"/>'},
    {v:'S',d:'Čtvercový',dt:'Univerzální soustružení, srážení hran',svg:'<rect x="13" y="13" width="44" height="44" fill="#2ecc71" stroke="#89b4fa" stroke-width="1.5"/>'},
    {v:'T',d:'Trojúhelníkový',dt:'Dokončovací soustružení, malé úběry',svg:'<polygon points="35,10 55,52 15,52" fill="#f1c40f" stroke="#89b4fa" stroke-width="1.5"/>'},
    {v:'V',d:'Kosočtverec 35°',dt:'Přesné kopírovací soustružení',svg:'<polygon points="35,15 52,35 35,55 18,35" fill="#1abc9c" stroke="#89b4fa" stroke-width="1.5"/>'},
    {v:'W',d:'Šestiúhelníkový',dt:'Speciální aplikace',svg:'<polygon points="35,12 52,22 52,46 35,56 18,46 18,22" fill="#e67e22" stroke="#89b4fa" stroke-width="1.5"/>'}
  ]},
  2: { title:'Úhel hřbetu',options:[
    {v:'N',d:'0° – Negativní',dt:'Vysoké řezné rychlosti, přerušované řezy'},
    {v:'B',d:'5° – Pozitivní',dt:'Kompromis negativní/pozitivní'},
    {v:'P',d:'11° – Pozitivní',dt:'Menší řezné síly, lepší odvod třísek'},
    {v:'C',d:'7° – Speciální',dt:'Speciální aplikace'},
    {v:'E',d:'20° – Speciální',dt:'Velmi přesné obrábění'},
    {v:'M',d:'15° – Speciální',dt:'Středně náročné obrábění'},
    {v:'A',d:'25° – Speciální',dt:'Dokončovací, minimální řezné síly'}
  ]},
  3: { title:'Tolerance',options:[
    {v:'A',d:'±0.05/±0.13 mm',dt:'Velmi přesné destičky'},
    {v:'C',d:'±0.08/±0.25 mm',dt:'Střední přesnost'},
    {v:'G',d:'±0.13/±0.25 mm',dt:'Běžné tolerance'},
    {v:'U',d:'±0.13/±0.18 mm',dt:'Speciální tolerance'}
  ]},
  4: { title:'Typ',options:[
    {v:'M',d:'S dírou + závit',dt:'Upínání šroubem'},
    {v:'G',d:'S dírou + utvařeč třísky (horní)',dt:'Lepší kontrola třísky'},
    {v:'N',d:'S dírou, bez utvařeče',dt:'Speciální aplikace'},
    {v:'T',d:'S dírou + utvařeč (obě strany)',dt:'Oboustranně použitelná'}
  ]},
  5: { title:'Velikost (IC)',options:[
    {v:'06',d:'6 mm',dt:'Malá – přesné obrábění'},
    {v:'08',d:'8 mm',dt:'Malá – přesné obrábění'},
    {v:'10',d:'10 mm',dt:'Středně velká'},
    {v:'12',d:'12 mm',dt:'Standardní'},
    {v:'16',d:'16 mm',dt:'Velká – hrubování'},
    {v:'20',d:'20 mm',dt:'Velká – hrubování'},
    {v:'25',d:'25 mm',dt:'Velmi velká – těžké hrubování'}
  ]},
  6: { title:'Tloušťka',options:[
    {v:'02',d:'2 mm',dt:'Velmi tenká'},
    {v:'03',d:'3 mm',dt:'Tenká'},
    {v:'04',d:'4 mm',dt:'Standardní'},
    {v:'05',d:'5 mm',dt:'Silnější'},
    {v:'06',d:'6 mm',dt:'Tlustá – náročné podmínky'}
  ]},
  7: { title:'Rádius špičky',options:[
    {v:'00',d:'0.0 mm',dt:'Ostrá špička'},
    {v:'04',d:'0.4 mm',dt:'Malý – jemné obrábění'},
    {v:'08',d:'0.8 mm',dt:'Standardní'},
    {v:'12',d:'1.2 mm',dt:'Větší – lepší povrch'},
    {v:'16',d:'1.6 mm',dt:'Velký – vysoká kvalita povrchu'},
    {v:'24',d:'2.4 mm',dt:'Extra velký'}
  ]},
  8: { title:'Úprava břitu',options:[
    {v:'F',d:'Jemné obrábění',dt:'Dokončovací operace'},
    {v:'M',d:'Střední obrábění',dt:'Běžné obrábění'},
    {v:'R',d:'Hrubé obrábění',dt:'Hrubovací operace'},
    {v:'P',d:'Pozitivní geometrie',dt:'Nižší řezné síly'}
  ]},
  9: { title:'Směr řezu',options:[
    {v:'R',d:'Pravý',dt:'Pravotočivé nástroje'},
    {v:'L',d:'Levý',dt:'Levotočivé nástroje'},
    {v:'N',d:'Neutrální',dt:'Obousměrné nástroje'}
  ]}
};

const holderIso = {
  1: { title:'Způsob upnutí',options:[
    {v:'C',d:'Upínka shora',dt:'Upnutí upínkou shora'},
    {v:'D',d:'Upínací klín',dt:'Upnutí přes otvor klínem'},
    {v:'M',d:'Upínací šroub',dt:'Upnutí šroubem přes otvor'},
    {v:'P',d:'Páčka',dt:'Upnutí páčkou'},
    {v:'S',d:'Boční šroub',dt:'Upnutí bočním šroubem'}
  ]},
  2: { title:'Tvar destičky',options:[
    {v:'C',d:'Kosočtverec 80°',dt:'Dokončovací soustružení'},
    {v:'D',d:'Kosočtverec 55°',dt:'Kopírovací soustružení'},
    {v:'R',d:'Kruhový',dt:'Kopírovací operace'},
    {v:'S',d:'Čtvercový',dt:'Univerzální soustružení'},
    {v:'T',d:'Trojúhelníkový',dt:'Dokončovací soustružení'},
    {v:'V',d:'Kosočtverec 35°',dt:'Přesné kopírování'},
    {v:'W',d:'Šestiúhelníkový',dt:'Speciální aplikace'}
  ]},
  3: { title:'Orientace',options:[
    {v:'L',d:'Levé provedení',dt:'Levostranné operace'},
    {v:'N',d:'Neutrální',dt:'Standardní operace'},
    {v:'R',d:'Pravé provedení',dt:'Pravostranné operace'}
  ]},
  4: { title:'Provedení',options:[
    {v:'K',d:'Standardní',dt:'Standardní provedení'},
    {v:'M',d:'S vnitřním chlazením',dt:'Kanálky pro chlazení'},
    {v:'S',d:'Speciální',dt:'Speciální provedení'}
  ]},
  5: { title:'Výška',options:[
    {v:'16',d:'16 mm',dt:'Menší – přesné obrábění'},
    {v:'20',d:'20 mm',dt:'Standardní'},
    {v:'25',d:'25 mm',dt:'Středně náročné operace'},
    {v:'32',d:'32 mm',dt:'Náročné operace'},
    {v:'40',d:'40 mm',dt:'Těžké obrábění'}
  ]},
  6: { title:'Šířka',options:[
    {v:'16',d:'16 mm',dt:'Úzký – omezené prostory'},
    {v:'20',d:'20 mm',dt:'Standardní'},
    {v:'25',d:'25 mm',dt:'Širší – lepší stabilita'},
    {v:'32',d:'32 mm',dt:'Max. tuhost'}
  ]}
};

// Doporučení držáku pro plátky (tvar → úhel hřbetu → typ držáku)
const vbdToHolder = {
  C:{N:'CCLNR/L, DCLNR/L',P:'CCPGR/L, DCPGR/L',M:'CCMNR/L, DCMNR/L'},
  D:{N:'DDJNR/L, PDJNR/L',P:'DDPNR/L, PDPNR/L',M:'DDMNR/L, PDMNR/L'},
  S:{N:'SSKNR/L, MSKNR/L',P:'SSPGR/L, MSPGR/L',M:'SSMNR/L, MSMNR/L'},
  T:{N:'TTJNR/L, MTJNR/L',P:'TTPGR/L, MTPGR/L',M:'TTMNR/L, MTMNR/L'},
  R:{N:'RRDNR/L, SRRNR/L',P:'RRPGR/L, SRPGR/L',M:'RRMNR/L, SRMNR/L'},
  V:{N:'SVJNR/L, MVJNR/L',P:'SVPGR/L, MVPGR/L',M:'SVMNR/L, MVMNR/L'},
  W:{N:'WWLNR/L, MWLNR/L',P:'WWPGR/L, MWPGR/L',M:'WWMNR/L, MWMNR/L'}
};

// ISO materiálové skupiny
const isoMatGroups = [
  {code:'P',name:'Oceli',color:'#3b82f6',ex:'C45, S355, 16MnCr5'},
  {code:'M',name:'Korozivzdorné oceli',color:'#eab308',ex:'X5CrNi, X2CrNiMo'},
  {code:'K',name:'Litina',color:'#ef4444',ex:'GG25, GGG40'},
  {code:'N',name:'Neželezné kovy',color:'#22c55e',ex:'AlCu4Mg, CuZn39'},
  {code:'S',name:'Žáruvzdorné slitiny',color:'#a16207',ex:'Inconel, Ti6Al4V'},
  {code:'H',name:'Kalené materiály',color:'#6b7280',ex:'> 45 HRC'}
];

// Řezné podmínky dle materiálu
const vbdCutCond = {
  steel:   {label:'Ocel (nelegovaná)',rough:[180,0.3,4,'CNMG/SNMG'],finish:[250,0.15,1,'CCMT/DCMT']},
  stainless:{label:'Korozivzdorná ocel',rough:[120,0.25,3,'CNMG/TNMG'],finish:[180,0.12,0.8,'CCMT/VBMT']},
  castIron:{label:'Šedá litina',rough:[150,0.35,5,'SNMG/CNMG'],finish:[220,0.18,1.2,'CCMT/DCMT']},
  aluminum:{label:'Hliník a slitiny',rough:[300,0.4,5,'DCGT/CCGT'],finish:[450,0.2,1.5,'VCGT/DCGT']},
  titanium:{label:'Titan a slitiny',rough:[50,0.15,2,'CNMG/SNMG'],finish:[70,0.1,0.5,'CCMT/VCMT']},
  hardened:{label:'Kalené materiály (>45 HRC)',rough:[80,0.15,2,'CNGA/SNGA'],finish:[120,0.08,0.3,'CNGA/VNGA']}
};

// Porovnání materiálů VBD
const vbdMatCompare = [
  {n:'SK nepovlakovaný',hard:3,tough:4,heat:2,use:'Všeobecné, přerušované řezy',vc:'80–150'},
  {n:'SK povlakovaný',hard:3,tough:4,heat:4,use:'Univerzální, vyšší rychlosti',vc:'150–350'},
  {n:'Řezná keramika',hard:4,tough:2,heat:5,use:'Vysokorychlostní, litina, kalená ocel',vc:'400–800'},
  {n:'CBN',hard:5,tough:3,heat:5,use:'Tvrzené >45 HRC, superslitiny',vc:'200–400'},
  {n:'PCD',hard:5,tough:2,heat:2,use:'Neželezné kovy, kompozity',vc:'300–1000'},
  {n:'Cermety',hard:4,tough:3,heat:4,use:'Dokončovací, vysoké Vc',vc:'200–400'}
];

export function openInsertCalc() {
  // ── Tab system ──
  const tabs = [
    {id:'vbdDec',label:'🔍 Dekodér VBD'},
    {id:'holderDec',label:'🔧 Držáky'},
    {id:'vbdMat',label:'📊 Materiály'},
    {id:'vbdCut',label:'⚡ Řez. podmínky'},
    {id:'vbdHelp',label:'❓ Nápověda'}
  ];
  var tabBar = '<div class="vbd-tabs">';
  for (var t = 0; t < tabs.length; t++)
    tabBar += '<button class="vbd-tab' + (t === 0 ? ' vbd-tab-active' : '') + '" data-tab="' + tabs[t].id + '">' + tabs[t].label + '</button>';
  tabBar += '</div>';

  // ── TAB 1: Dekodér VBD ──
  // Auto-dekodér input
  var tab1 = '<div class="vbd-pane" id="pane-vbdDec">';
  tab1 += '<div class="vbd-decode-row"><input type="text" id="vbdAutoInput" class="vbd-auto-input" placeholder="Zadejte kód, např. CNMG120408-PM" maxlength="20" spellcheck="false" autocomplete="off">';
  tab1 += '<button class="vbd-decode-btn" id="vbdAutoBtn">Dekódovat</button></div>';

  // Tvar ilustrace
  tab1 += '<div class="vbd-shapes" id="vbdShapes">';
  var shapes = vbdIsoData[1].options;
  for (var s = 0; s < shapes.length; s++)
    tab1 += '<button class="vbd-shape-btn" data-shape="' + shapes[s].v + '" title="' + shapes[s].v + ' – ' + shapes[s].d + '">' +
      '<svg viewBox="0 0 70 70" width="44" height="44">' + shapes[s].svg + '</svg><span>' + shapes[s].v + '</span></button>';
  tab1 += '</div>';

  // Interaktivní řádek pozic
  tab1 += '<div class="vbd-sel-row" id="vbdSelRow">';
  for (var p = 1; p <= 9; p++)
    tab1 += '<div class="vbd-sel-item" data-pos="' + p + '" title="' + vbdIsoData[p].title + '"><small>' + p + '</small><span>–</span></div>';
  tab1 += '</div>';

  // Popis výsledku
  tab1 += '<div class="vbd-result" id="vbdResult"><div class="vbd-code" id="vbdCode">– – – – – – – – –</div>' +
    '<div class="vbd-desc" id="vbdDesc">Klikněte na pozici nebo zadejte kód výše</div>' +
    '<div class="vbd-holder-rec" id="vbdHolderRec" style="display:none"><strong>Doporučené držáky:</strong> <span id="vbdHolderList"></span></div></div>';
  tab1 += '</div>';

  // ── TAB 2: Dekodér Držáků ──
  var tab2 = '<div class="vbd-pane" id="pane-holderDec" style="display:none">';

  // Reverse lookup: z plátku najdi držák
  tab2 += '<div class="vbd-reverse-section">' +
    '<div class="cnc-table-label">🔍 Najdi držák podle plátku</div>' +
    '<div class="vbd-decode-row">' +
      '<input type="text" id="holderFromVbdInput" class="vbd-auto-input" placeholder="Kód plátku, např. CNMG nebo DNMG120408" maxlength="20" spellcheck="false" autocomplete="off">' +
      '<button class="vbd-decode-btn" id="holderFromVbdBtn">Najdi držák</button>' +
    '</div>' +
    '<div class="vbd-reverse-quick">' +
      '<small>Nebo vyberte tvar a úhel hřbetu:</small>' +
      '<div class="vbd-rev-selects">' +
        '<select id="holderRevShape"><option value="">Tvar…</option>' +
          '<option value="C">C – Kosočtverec 80°</option><option value="D">D – Kosočtverec 55°</option>' +
          '<option value="R">R – Kruhový</option><option value="S">S – Čtvercový</option>' +
          '<option value="T">T – Trojúhelníkový</option><option value="V">V – Kosočtverec 35°</option>' +
          '<option value="W">W – Šestiúhelníkový</option>' +
        '</select>' +
        '<select id="holderRevAngle"><option value="">Úhel…</option>' +
          '<option value="N">N – 0° Negativní</option><option value="B">B – 5° Pozitivní</option>' +
          '<option value="P">P – 11° Pozitivní</option><option value="C">C – 7°</option>' +
          '<option value="E">E – 20°</option><option value="M">M – 15°</option><option value="A">A – 25°</option>' +
        '</select>' +
      '</div>' +
    '</div>' +
    '<div class="vbd-reverse-result" id="holderFromVbdResult" style="display:none"></div>' +
  '</div>';

  // Separator
  tab2 += '<div class="vbd-section-sep"></div>';
  tab2 += '<div class="cnc-table-label">🔧 Dekodér značení držáku</div>';

  tab2 += '<div class="vbd-decode-row"><input type="text" id="holderAutoInput" class="vbd-auto-input" placeholder="Zadejte kód držáku, např. MCLNR2525" maxlength="20" spellcheck="false" autocomplete="off">';
  tab2 += '<button class="vbd-decode-btn" id="holderAutoBtn">Dekódovat</button></div>';

  tab2 += '<div class="vbd-sel-row" id="holderSelRow">';
  for (var h = 1; h <= 6; h++)
    tab2 += '<div class="vbd-sel-item vbd-sel-holder" data-pos="' + h + '" title="' + holderIso[h].title + '"><small>' + h + '</small><span>–</span></div>';
  tab2 += '</div>';

  tab2 += '<div class="vbd-result" id="holderResult"><div class="vbd-code" id="holderCode">– – – – – –</div>' +
    '<div class="vbd-desc" id="holderDesc">Klikněte na pozici nebo zadejte kód</div>' +
    '<div class="vbd-holder-rec" id="holderInsertRec" style="display:none"><strong>Vhodné plátky:</strong> <span id="holderInsertList"></span></div></div>';
  tab2 += '</div>';

  // ── TAB 3: Materiály VBD ──
  var tab3 = '<div class="vbd-pane" id="pane-vbdMat" style="display:none">';

  // ISO barevné skupiny
  tab3 += '<div class="cnc-table-label">ISO skupiny obráběných materiálů</div><div class="vbd-mat-groups">';
  for (var g = 0; g < isoMatGroups.length; g++) {
    var mg = isoMatGroups[g];
    tab3 += '<div class="vbd-mat-group"><div class="vbd-mat-badge" style="background:' + mg.color + '">' + mg.code + '</div>' +
      '<div><strong>' + mg.name + '</strong><br><small>' + mg.ex + '</small></div></div>';
  }
  tab3 += '</div>';

  // Porovnání materiálů VBD
  tab3 += '<div class="cnc-table-label" style="margin-top:14px">Porovnání materiálů VBD</div>';
  tab3 += '<div class="vbd-compare-wrap"><table class="vbd-compare-tbl"><thead><tr><th>Materiál</th><th>Tvrdost</th><th>Houž.</th><th>Teplo</th><th>Vc</th><th>Použití</th></tr></thead><tbody>';
  for (var c = 0; c < vbdMatCompare.length; c++) {
    var mc = vbdMatCompare[c];
    var stars = function(n) { var s = ''; for (var x = 0; x < 5; x++) s += x < n ? '★' : '☆'; return s; };
    tab3 += '<tr><td><strong>' + mc.n + '</strong></td><td class="vbd-stars">' + stars(mc.hard) + '</td><td class="vbd-stars">' + stars(mc.tough) + '</td><td class="vbd-stars">' + stars(mc.heat) + '</td><td>' + mc.vc + '</td><td><small>' + mc.use + '</small></td></tr>';
  }
  tab3 += '</tbody></table></div>';
  tab3 += '</div>';

  // ── TAB 4: Řezné podmínky ──
  var tab4 = '<div class="vbd-pane" id="pane-vbdCut" style="display:none">';
  tab4 += '<div class="cnc-table-label">Doporučené řezné podmínky dle materiálu</div>';
  tab4 += '<div class="cnc-fields"><label class="cnc-field cnc-field-full"><span>Materiál</span><select id="vbdCutMat"><option value="">-- vyberte --</option>';
  for (var mk in vbdCutCond) tab4 += '<option value="' + mk + '">' + vbdCutCond[mk].label + '</option>';
  tab4 += '</select></label></div>';

  tab4 += '<div id="vbdCutResult" style="display:none">';
  tab4 += '<div class="vbd-cut-grid">';
  tab4 += '<div class="vbd-cut-card"><div class="vbd-cut-title">Hrubování</div><table class="vbd-cut-tbl">' +
    '<tr><td>Vc</td><td id="cutRVc">–</td><td>m/min</td></tr>' +
    '<tr><td>f</td><td id="cutRF">–</td><td>mm/ot</td></tr>' +
    '<tr><td>ap</td><td id="cutRAp">–</td><td>mm</td></tr>' +
    '<tr><td>VBD</td><td id="cutRVbd" colspan="2">–</td></tr></table></div>';
  tab4 += '<div class="vbd-cut-card"><div class="vbd-cut-title vbd-cut-finish">Dokončování</div><table class="vbd-cut-tbl">' +
    '<tr><td>Vc</td><td id="cutFVc">–</td><td>m/min</td></tr>' +
    '<tr><td>f</td><td id="cutFF">–</td><td>mm/ot</td></tr>' +
    '<tr><td>ap</td><td id="cutFAp">–</td><td>mm</td></tr>' +
    '<tr><td>VBD</td><td id="cutFVbd" colspan="2">–</td></tr></table></div>';
  tab4 += '</div>';
  tab4 += '<div class="vbd-cut-note">⚠ Orientační hodnoty – závisí na stroji, chlazení a stabilitě upnutí.</div>';
  tab4 += '</div></div>';

  // ── TAB 5: Nápověda ──
  var tab5 = '<div class="vbd-pane" id="pane-vbdHelp" style="display:none">';

  // Úvod
  tab5 += '<div class="vbd-help-section">' +
    '<h4 class="vbd-help-h">📖 Co jsou obráběcí plátky (VBD)?</h4>' +
    '<p class="vbd-help-p">Vyměnitelné břitové destičky (VBD) jsou klíčovou součástí moderních obráběcích nástrojů. ' +
    'Používají se pro soustružení, frézování a vrtání kovových materiálů. Díky vyměnitelnosti umožňují rychlou ' +
    'výměnu opotřebeného břitu bez nutnosti měnit celý nástroj.</p>' +
  '</div>';

  // Schéma značení
  tab5 += '<div class="vbd-help-section">' +
    '<h4 class="vbd-help-h">🏷️ Systém značení ISO (9 pozic)</h4>' +
    '<p class="vbd-help-p">Příklad: <strong class="vbd-help-code">C N M G 12 04 08 - P M</strong></p>' +
    '<table class="vbd-help-tbl">' +
    '<tr><th>Poz.</th><th>Význam</th><th>Příklad</th><th>Popis</th></tr>' +
    '<tr><td>1</td><td>Tvar destičky</td><td>C</td><td>Kosočtverec 80°</td></tr>' +
    '<tr><td>2</td><td>Úhel hřbetu</td><td>N</td><td>0° – negativní geometrie</td></tr>' +
    '<tr><td>3</td><td>Tolerance</td><td>M</td><td>Střední přesnost rozměrů</td></tr>' +
    '<tr><td>4</td><td>Typ destičky</td><td>G</td><td>S dírou + utvařeč třísky</td></tr>' +
    '<tr><td>5</td><td>Velikost (IC)</td><td>12</td><td>12 mm vepsaná kružnice</td></tr>' +
    '<tr><td>6</td><td>Tloušťka</td><td>04</td><td>4 mm</td></tr>' +
    '<tr><td>7</td><td>Rádius špičky</td><td>08</td><td>0.8 mm</td></tr>' +
    '<tr><td>8</td><td>Úprava břitu</td><td>P</td><td>Pozitivní geometrie</td></tr>' +
    '<tr><td>9</td><td>Směr řezu</td><td>M</td><td>Střední obrábění</td></tr>' +
    '</table>' +
  '</div>';

  // Tvary s SVG
  tab5 += '<div class="vbd-help-section">' +
    '<h4 class="vbd-help-h">🔷 Tvary obráběcích plátků</h4>' +
    '<div class="vbd-help-shapes">';
  var helpShapes = [
    {v:'C',d:'Kosočtverec 80°',use:'Dokončovací soustružení. Nejrozšířenější tvar, dobrý kompromis mezi pevností a přístupností.'},
    {v:'D',d:'Kosočtverec 55°',use:'Kopírovací soustružení. Menší úhel špičky umožňuje obrábění složitých kontur.'},
    {v:'S',d:'Čtverec 90°',use:'Univerzální soustružení, srážení hran. 4 břity = ekonomický provoz.'},
    {v:'T',d:'Trojúhelník 60°',use:'Dokončovací soustružení s malým úběrem. 3 břity, dobrá univerzálnost.'},
    {v:'R',d:'Kruhový',use:'Kopírovací operace, zaoblené kontury. Proměnný úhel nastavení.'},
    {v:'V',d:'Kosočtverec 35°',use:'Přesné kopírovací soustružení. Nejostřejší, ale nejkřehčí špička.'},
    {v:'W',d:'Šestiúhelník',use:'Speciální aplikace, 6 břitů pro ekonomický provoz.'}
  ];
  var shapeData = vbdIsoData[1].options;
  for (var hs = 0; hs < helpShapes.length; hs++) {
    var sh = helpShapes[hs];
    var svgMatch = shapeData.find(function(o) { return o.v === sh.v; });
    tab5 += '<div class="vbd-help-shape-card">' +
      '<svg viewBox="0 0 70 70" width="48" height="48">' + (svgMatch ? svgMatch.svg : '') + '</svg>' +
      '<div><strong>' + sh.v + ' – ' + sh.d + '</strong><br><small>' + sh.use + '</small></div></div>';
  }
  tab5 += '</div></div>';

  // Geometrie břitu
  tab5 += '<div class="vbd-help-section">' +
    '<h4 class="vbd-help-h">📐 Geometrie břitu</h4>' +
    '<table class="vbd-help-tbl">' +
    '<tr><th>Typ</th><th>Vlastnosti</th><th>Vhodné pro</th></tr>' +
    '<tr><td><strong>Negativní (N, 0°)</strong></td><td>Vyšší pevnost břitu, oboustranné destičky (2× více břitů)</td><td>Stabilní podmínky, přerušované řezy, hrubování</td></tr>' +
    '<tr><td><strong>Pozitivní (P, 11°)</strong></td><td>Menší řezné síly, lepší odvod třísek, nižší příkon</td><td>Méně výkonné stroje, nestabilní upnutí, dokončování</td></tr>' +
    '<tr><td><strong>Kompromis (B, 5°)</strong></td><td>Mezi negativní a pozitivní</td><td>Univerzální použití</td></tr>' +
    '</table>' +
  '</div>';

  // Tolerance
  tab5 += '<div class="vbd-help-section">' +
    '<h4 class="vbd-help-h">🎯 Třídy tolerance</h4>' +
    '<table class="vbd-help-tbl">' +
    '<tr><th>Kód</th><th>Tloušťka</th><th>IC (vepsaná kružnice)</th><th>Použití</th></tr>' +
    '<tr><td><strong>A</strong></td><td>±0.05 mm</td><td>±0.13 mm</td><td>Přesné obrábění</td></tr>' +
    '<tr><td><strong>C</strong></td><td>±0.08 mm</td><td>±0.25 mm</td><td>Standardní přesnost</td></tr>' +
    '<tr><td><strong>G</strong></td><td>±0.13 mm</td><td>±0.25 mm</td><td>Běžné aplikace</td></tr>' +
    '<tr><td><strong>U</strong></td><td>±0.13 mm</td><td>±0.18 mm</td><td>Speciální</td></tr>' +
    '</table>' +
  '</div>';

  // Upínací systémy držáků
  tab5 += '<div class="vbd-help-section">' +
    '<h4 class="vbd-help-h">🔧 Značení držáků nástrojů (6 pozic)</h4>' +
    '<p class="vbd-help-p">Příklad: <strong class="vbd-help-code">M C L N R 2525</strong></p>' +
    '<table class="vbd-help-tbl">' +
    '<tr><th>Poz.</th><th>Význam</th><th>Příklad</th><th>Popis</th></tr>' +
    '<tr><td>1</td><td>Způsob upnutí</td><td>M</td><td>Upínací šroub přes otvor</td></tr>' +
    '<tr><td>2</td><td>Tvar destičky</td><td>C</td><td>Kosočtverec 80°</td></tr>' +
    '<tr><td>3</td><td>Orientace</td><td>L</td><td>Levé provedení</td></tr>' +
    '<tr><td>4</td><td>Provedení</td><td>N</td><td>Standardní / s chlazením</td></tr>' +
    '<tr><td>5</td><td>Výška</td><td>25</td><td>25 mm</td></tr>' +
    '<tr><td>6</td><td>Šířka</td><td>25</td><td>25 mm</td></tr>' +
    '</table>' +
    '<div class="vbd-help-note">💡 <strong>R/L</strong> = pravý/levý držák – závisí na orientaci soustruhu a způsobu obrábění.</div>' +
  '</div>';

  // Upínací systémy detail
  tab5 += '<div class="vbd-help-section">' +
    '<h4 class="vbd-help-h">🔩 Způsoby upnutí destičky</h4>' +
    '<table class="vbd-help-tbl">' +
    '<tr><th>Kód</th><th>Systém</th><th>Výhody</th><th>Nevýhody</th></tr>' +
    '<tr><td><strong>C</strong></td><td>Upínka shora</td><td>Rychlá výměna, bez otvoru</td><td>Menší přesnost polohování</td></tr>' +
    '<tr><td><strong>M</strong></td><td>Šroub přes otvor</td><td>Nejlepší přesnost, spolehlivost</td><td>Pomalejší výměna</td></tr>' +
    '<tr><td><strong>P</strong></td><td>Páčka</td><td>Rychlá výměna, přitahuje dolů</td><td>Složitější mechanismus</td></tr>' +
    '<tr><td><strong>S</strong></td><td>Boční šroub</td><td>Kompaktní, pro malé prostory</td><td>Omezená síla upnutí</td></tr>' +
    '<tr><td><strong>D</strong></td><td>Klín přes otvor</td><td>Velmi pevné upnutí</td><td>Nejpomalejší výměna</td></tr>' +
    '</table>' +
  '</div>';

  // Rádius špičky
  tab5 += '<div class="vbd-help-section">' +
    '<h4 class="vbd-help-h">⭕ Rádius špičky (rε)</h4>' +
    '<table class="vbd-help-tbl">' +
    '<tr><th>Rádius</th><th>Povrch</th><th>Použití</th></tr>' +
    '<tr><td>0.2–0.4 mm</td><td>Horší</td><td>Zapichování, úzké zápichy, jemné kontury</td></tr>' +
    '<tr><td>0.8 mm</td><td>Dobrý</td><td>Standardní soustružení – nejčastější volba</td></tr>' +
    '<tr><td>1.2 mm</td><td>Velmi dobrý</td><td>Dokončování s požadavkem na kvalitu povrchu</td></tr>' +
    '<tr><td>1.6–2.4 mm</td><td>Vynikající</td><td>Jemné dokončování, velké posuvy při zachování Ra</td></tr>' +
    '</table>' +
    '<div class="vbd-help-note">📏 Větší rádius = lepší povrch, ale vyšší řezné síly a tendence k vibracím.</div>' +
  '</div>';

  // Utvařeče třísek
  tab5 += '<div class="vbd-help-section">' +
    '<h4 class="vbd-help-h">🌀 Typy utvařečů třísky (poz. 8–9)</h4>' +
    '<table class="vbd-help-tbl">' +
    '<tr><th>Kód</th><th>Typ</th><th>Oblasti použití</th></tr>' +
    '<tr><td><strong>F / PF</strong></td><td>Jemné obrábění</td><td>ap 0.3–2 mm, f 0.05–0.2 mm/ot, dokončování</td></tr>' +
    '<tr><td><strong>M / PM</strong></td><td>Střední obrábění</td><td>ap 1–5 mm, f 0.15–0.4 mm/ot, univerzální</td></tr>' +
    '<tr><td><strong>R / PR</strong></td><td>Hrubé obrábění</td><td>ap 3–10 mm, f 0.3–0.8 mm/ot, hrubování</td></tr>' +
    '</table>' +
  '</div>';

  // Životnost a opotřebení
  tab5 += '<div class="vbd-help-section">' +
    '<h4 class="vbd-help-h">⏱️ Životnost a znaky opotřebení</h4>' +
    '<div class="vbd-help-grid">' +
    '<div class="vbd-help-card">' +
      '<strong style="color:#f38ba8">🔴 Kdy vyměnit destičku?</strong>' +
      '<ul class="vbd-help-list">' +
        '<li>Zhoršená kvalita povrchu (vyšší drsnost)</li>' +
        '<li>Změna rozměrů obrobku – nedodržení tolerancí</li>' +
        '<li>Viditelné opotřebení hřbetu (> 0.3 mm)</li>' +
        '<li>Tvorba nárůstku na břitu</li>' +
        '<li>Vyštípnutí nebo lom břitu</li>' +
        '<li>Zvýšený hluk nebo vibrace</li>' +
        '<li>Změna tvaru nebo barvy třísky</li>' +
      '</ul>' +
    '</div>' +
    '<div class="vbd-help-card">' +
      '<strong style="color:#a6e3a1">🟢 Jak prodloužit životnost?</strong>' +
      '<ul class="vbd-help-list">' +
        '<li>Nepřekračujte doporučené řezné rychlosti</li>' +
        '<li>Upravte posuv podle materiálu a stavu stroje</li>' +
        '<li>Používejte dostatečné chlazení správným směrem</li>' +
        '<li>Vyčistěte dosedací plochy před instalací</li>' +
        '<li>Správně dotáhněte upínací prvky</li>' +
        '<li>Pravidelně otáčejte břity (nevynechávejte)</li>' +
        '<li>U přerušovaných řezů snižte Vc o 20–30 %</li>' +
      '</ul>' +
    '</div>' +
    '</div>' +
  '</div>';

  // Vzorové aplikace
  tab5 += '<div class="vbd-help-section">' +
    '<h4 class="vbd-help-h">🏭 Vzorové aplikace</h4>' +
    '<table class="vbd-help-tbl">' +
    '<tr><th>Operace</th><th>VBD</th><th>Vc</th><th>f</th><th>ap</th></tr>' +
    '<tr><td>Hrubování hřídele (ocel)</td><td>CNMG 120408-PM</td><td>180 m/min</td><td>0.3 mm/ot</td><td>3 mm</td></tr>' +
    '<tr><td>Dokončování hřídele (ocel)</td><td>DNMG 110404-PF</td><td>240 m/min</td><td>0.15 mm/ot</td><td>0.8 mm</td></tr>' +
    '<tr><td>Zapichování (ocel)</td><td>MGMN 300-M</td><td>120 m/min</td><td>0.08 mm/ot</td><td>–</td></tr>' +
    '<tr><td>Hrubování (hliník)</td><td>DCGT 070204</td><td>300 m/min</td><td>0.4 mm/ot</td><td>5 mm</td></tr>' +
    '<tr><td>Dokončování (nerez)</td><td>CCMT 060204</td><td>180 m/min</td><td>0.12 mm/ot</td><td>0.8 mm</td></tr>' +
    '<tr><td>Kalená ocel (>45 HRC)</td><td>CNGA 120408</td><td>120 m/min</td><td>0.08 mm/ot</td><td>0.3 mm</td></tr>' +
    '</table>' +
  '</div>';

  // Povlaky
  tab5 += '<div class="vbd-help-section">' +
    '<h4 class="vbd-help-h">🧪 Typy povlaků VBD</h4>' +
    '<table class="vbd-help-tbl">' +
    '<tr><th>Povlak</th><th>Barva</th><th>Vlastnosti</th><th>Použití</th></tr>' +
    '<tr><td><strong>TiN</strong></td><td style="color:#f9e2af">zlatá</td><td>Nízké tření, dobrá viditelnost opotřebení</td><td>Univerzální, oceli</td></tr>' +
    '<tr><td><strong>TiCN</strong></td><td style="color:#a6adc8">šedá/fialová</td><td>Vyšší tvrdost než TiN, odolnost abrazi</td><td>Oceli, litiny</td></tr>' +
    '<tr><td><strong>TiAlN</strong></td><td style="color:#6c7086">tmavá</td><td>Velmi vysoká tepelná odolnost (do 800°C)</td><td>Suché obrábění, vysoké Vc</td></tr>' +
    '<tr><td><strong>Al₂O₃</strong></td><td style="color:#f38ba8">černá</td><td>Chemická odolnost, tepelná bariéra</td><td>Litiny, oceli při vysokých Vc</td></tr>' +
    '<tr><td><strong>Multi-layer</strong></td><td style="color:#89b4fa">různé</td><td>Kombinace výhod více vrstev</td><td>Univerzální, nejvyšší životnost</td></tr>' +
    '</table>' +
  '</div>';

  // FAQ
  tab5 += '<div class="vbd-help-section">' +
    '<h4 class="vbd-help-h">❓ Časté otázky</h4>' +
    '<div class="vbd-faq">' +
    '<div class="vbd-faq-item"><div class="vbd-faq-q">Jak vybrat správný rádius špičky?</div>' +
      '<div class="vbd-faq-a">Menší rádius (0.4 mm) pro malé průměry a kontury, větší (0.8–1.6 mm) pro vnější soustružení. ' +
      'Pravidlo: rádius by neměl být větší než hloubka řezu (ap). Pro optimální drsnost povrchu: Ra ≈ f²/(32·rε)·1000.</div></div>' +
    '<div class="vbd-faq-item"><div class="vbd-faq-q">Negativní nebo pozitivní destička?</div>' +
      '<div class="vbd-faq-a"><strong>Negativní:</strong> Stabilní stroj, hrubování, přerušované řezy – oboustranné použití (2× břitů). ' +
      '<strong>Pozitivní:</strong> Slabší stroj, dokončování, nestabilní upnutí – menší řezné síly.</div></div>' +
    '<div class="vbd-faq-item"><div class="vbd-faq-q">Jaký je rozdíl mezi povlakovanými a nepovlakovanými?</div>' +
      '<div class="vbd-faq-a">Povlakované: vyšší Vc (až 2×), delší životnost, lepší tepelná odolnost, vyšší cena. ' +
      'Nepovlakované: vhodné pro měkké materiály (hliník, měď), nižší cena, ostřejší břit.</div></div>' +
    '<div class="vbd-faq-item"><div class="vbd-faq-q">Jak přečíst kód plátku z krabičky?</div>' +
      '<div class="vbd-faq-a">Použijte tab „Dekodér VBD" – zadejte celý kód (např. CNMG120408-PM) a systém automaticky rozloží ' +
      'každou pozici s detailním popisem. Prvních 4 znaky = písmena, dalších 6 = číslice, za pomlčkou = utvařeč.</div></div>' +
    '</div>' +
  '</div>';

  tab5 += '</div>';

  // ── Quick search ──
  var searchBar = '<div class="vbd-search-row"><input type="text" id="vbdSearch" class="vbd-search-input" placeholder="Hledat v datech (kód, tvar, popis\u2026)" spellcheck="false">' +
    '<div class="vbd-search-results" id="vbdSearchResults" style="display:none"></div></div>';

  // ── Buttons ──
  var btns = '<div class="cnc-btns"><button class="cnc-btn cnc-btn-clear">Vyčistit</button><button class="cnc-btn cnc-btn-copy">📋 Kopírovat</button></div>';

  const body = searchBar + tabBar + tab1 + tab2 + tab3 + tab4 + btns;
  const overlay = makeOverlay('inserts', '🔩 VBD & Držáky – ISO dekodér', body, 'vbd-window');
  if (!overlay) return;

  // ── Selection state ──
  var sel = {1:'-',2:'-',3:'-',4:'-',5:'-',6:'-',7:'-',8:'-',9:'-'};
  var hSel = {1:'-',2:'-',3:'-',4:'-',5:'-',6:'-'};

  // ── DOM refs ──
  var vbdSelRow = overlay.querySelector('#vbdSelRow');
  var vbdCode = overlay.querySelector('#vbdCode');
  var vbdDesc = overlay.querySelector('#vbdDesc');
  var vbdHolderRec = overlay.querySelector('#vbdHolderRec');
  var vbdHolderList = overlay.querySelector('#vbdHolderList');
  var holderSelRow = overlay.querySelector('#holderSelRow');
  var holderCodeEl = overlay.querySelector('#holderCode');
  var holderDescEl = overlay.querySelector('#holderDesc');
  var holderInsertRec = overlay.querySelector('#holderInsertRec');
  var holderInsertList = overlay.querySelector('#holderInsertList');

  // ── Tab switching ──
  overlay.querySelectorAll('.vbd-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      overlay.querySelectorAll('.vbd-tab').forEach(function(t) { t.classList.remove('vbd-tab-active'); });
      overlay.querySelectorAll('.vbd-pane').forEach(function(p) { p.style.display = 'none'; });
      tab.classList.add('vbd-tab-active');
      overlay.querySelector('#pane-' + tab.dataset.tab).style.display = '';
    });
  });

  // ── FAQ accordion ──
  overlay.querySelectorAll('.vbd-faq-q').forEach(function(q) {
    q.addEventListener('click', function() {
      this.parentElement.classList.toggle('vbd-faq-open');
    });
  });

  // ── VBD position click → modal options ──
  function showPosOptions(pos, isoDb, selObj, updateFn) {
    // Build dropdown under the clicked item
    var existing = overlay.querySelector('.vbd-opts-popup');
    if (existing) existing.remove();
    var data = isoDb[pos];
    var popup = document.createElement('div');
    popup.className = 'vbd-opts-popup';
    popup.innerHTML = '<div class="vbd-opts-title">' + pos + '. ' + data.title + '</div>';
    for (var i = 0; i < data.options.length; i++) {
      var opt = data.options[i];
      var btn = document.createElement('button');
      btn.className = 'vbd-opt-btn';
      btn.textContent = opt.v + ' – ' + opt.d;
      btn.dataset.val = opt.v;
      btn.dataset.pos = pos;
      btn.addEventListener('click', function() {
        selObj[this.dataset.pos] = this.dataset.val;
        popup.remove();
        updateFn();
      });
      popup.appendChild(btn);
    }
    // Close
    var closeBtn = document.createElement('button');
    closeBtn.className = 'vbd-opt-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', function() { popup.remove(); });
    popup.prepend(closeBtn);
    overlay.querySelector('.calc-body').appendChild(popup);

    // Close on outside click
    setTimeout(function() {
      function outsideClick(e) {
        if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('mousedown', outsideClick); }
      }
      document.addEventListener('mousedown', outsideClick);
    }, 50);
  }

  // ── Update VBD display ──
  function updateVbd() {
    // Update sel row items
    for (var p = 1; p <= 9; p++) {
      var it = vbdSelRow.querySelector('[data-pos="' + p + '"] span');
      it.textContent = sel[p];
      it.parentElement.classList.toggle('vbd-sel-filled', sel[p] !== '-');
    }
    // Code
    vbdCode.textContent = sel[1]+sel[2]+sel[3]+sel[4]+' '+sel[5]+sel[6]+sel[7]+'–'+sel[8]+sel[9];
    // Description
    var desc = []; var validCount = 0;
    for (var i = 1; i <= 9; i++) {
      if (sel[i] !== '-') {
        validCount++;
        var found = vbdIsoData[i].options.find(function(o) { return o.v === sel[i]; });
        if (found) desc.push('<b>' + i + '. ' + vbdIsoData[i].title + ':</b> ' + found.d);
      }
    }
    vbdDesc.innerHTML = validCount > 0 ? desc.join(' · ') : 'Klikněte na pozici nebo zadejte kód výše';
    // Holder recommendations
    if (sel[1] !== '-' && sel[2] !== '-' && vbdToHolder[sel[1]] && vbdToHolder[sel[1]][sel[2]]) {
      vbdHolderRec.style.display = '';
      vbdHolderList.textContent = vbdToHolder[sel[1]][sel[2]];
    } else {
      vbdHolderRec.style.display = 'none';
    }
    // Highlight shape button
    overlay.querySelectorAll('.vbd-shape-btn').forEach(function(b) {
      b.classList.toggle('vbd-shape-active', b.dataset.shape === sel[1]);
    });
  }

  // ── Update Holder display ──
  function updateHolder() {
    for (var p = 1; p <= 6; p++) {
      var it = holderSelRow.querySelector('[data-pos="' + p + '"] span');
      it.textContent = hSel[p];
      it.parentElement.classList.toggle('vbd-sel-filled', hSel[p] !== '-');
    }
    holderCodeEl.textContent = hSel[1]+hSel[2]+hSel[3]+hSel[4]+hSel[5]+hSel[6];
    var desc = []; var cnt = 0;
    for (var i = 1; i <= 6; i++) {
      if (hSel[i] !== '-') {
        cnt++;
        var found = holderIso[i].options.find(function(o) { return o.v === hSel[i]; });
        if (found) desc.push('<b>' + i + '. ' + holderIso[i].title + ':</b> ' + found.d);
      }
    }
    holderDescEl.innerHTML = cnt > 0 ? desc.join(' · ') : 'Klikněte na pozici nebo zadejte kód';
    // Insert recommendation from holder
    if (hSel[2] !== '-' && hSel[1] !== '-') {
      var shape = hSel[2];
      var suitAngles = (hSel[1] === 'M' || hSel[1] === 'S') ? ['N'] : ['P','N'];
      var recs = suitAngles.map(function(a) { return shape + a + 'MG, ' + shape + a + 'MM'; });
      holderInsertRec.style.display = '';
      holderInsertList.textContent = recs.join(' | ');
    } else {
      holderInsertRec.style.display = 'none';
    }
  }

  // ── Position click handlers (VBD) ──
  vbdSelRow.querySelectorAll('.vbd-sel-item').forEach(function(item) {
    item.addEventListener('click', function() {
      showPosOptions(parseInt(this.dataset.pos), vbdIsoData, sel, updateVbd);
    });
  });

  // ── Position click handlers (Holder) ──
  holderSelRow.querySelectorAll('.vbd-sel-item').forEach(function(item) {
    item.addEventListener('click', function() {
      showPosOptions(parseInt(this.dataset.pos), holderIso, hSel, updateHolder);
    });
  });

  // ── Shape buttons ──
  overlay.querySelectorAll('.vbd-shape-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      sel[1] = this.dataset.shape;
      updateVbd();
    });
  });

  // ── Auto-decode VBD ──
  function autoDecodeVbd(code) {
    code = code.replace(/[\s\-]/g, '').toUpperCase();
    if (code.length < 4) return;
    // Positions 1-4 are single chars, 5-7 are 2 digits each, 8-9 are single chars
    sel[1] = code[0] || '-';
    sel[2] = code[1] || '-';
    sel[3] = code[2] || '-';
    sel[4] = code[3] || '-';
    if (code.length >= 6) sel[5] = code.substring(4, 6); else sel[5] = '-';
    if (code.length >= 8) sel[6] = code.substring(6, 8); else sel[6] = '-';
    if (code.length >= 10) sel[7] = code.substring(8, 10); else sel[7] = '-';
    if (code.length >= 11) sel[8] = code[10]; else sel[8] = '-';
    if (code.length >= 12) sel[9] = code[11]; else sel[9] = '-';
    updateVbd();
  }

  overlay.querySelector('#vbdAutoBtn').addEventListener('click', function() {
    autoDecodeVbd(overlay.querySelector('#vbdAutoInput').value);
  });
  overlay.querySelector('#vbdAutoInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') autoDecodeVbd(this.value);
  });

  // ── Auto-decode Holder ──
  function autoDecodeHolder(code) {
    code = code.replace(/[\s\-]/g, '').toUpperCase();
    if (code.length < 4) return;
    hSel[1] = code[0] || '-';
    hSel[2] = code[1] || '-';
    hSel[3] = code[2] || '-';
    hSel[4] = code[3] || '-';
    if (code.length >= 6) hSel[5] = code.substring(4, 6); else hSel[5] = '-';
    if (code.length >= 8) hSel[6] = code.substring(6, 8); else hSel[6] = '-';
    updateHolder();
  }

  overlay.querySelector('#holderAutoBtn').addEventListener('click', function() {
    autoDecodeHolder(overlay.querySelector('#holderAutoInput').value);
  });
  overlay.querySelector('#holderAutoInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') autoDecodeHolder(this.value);
  });

  // ── Reverse lookup: VBD → Holder ──
  var revResultEl = overlay.querySelector('#holderFromVbdResult');
  var revShapeEl = overlay.querySelector('#holderRevShape');
  var revAngleEl = overlay.querySelector('#holderRevAngle');

  function showHolderForVbd(shape, angle) {
    if (!shape) { revResultEl.style.display = 'none'; return; }
    var html = '';
    // Find SVG for shape
    var shapeInfo = vbdIsoData[1].options.find(function(o) { return o.v === shape; });
    var shapeSvg = shapeInfo ? '<svg viewBox="0 0 70 70" width="36" height="36">' + shapeInfo.svg + '</svg>' : '';

    html += '<div class="vbd-rev-header">' + shapeSvg +
      '<div><strong>Plátky tvaru ' + shape + '</strong>' + (shapeInfo ? ' – ' + shapeInfo.d : '') +
      (angle ? '<br><small>Úhel hřbetu: ' + angle + '</small>' : '') + '</div></div>';

    // Specific holders for shape+angle combo
    if (angle && vbdToHolder[shape] && vbdToHolder[shape][angle]) {
      html += '<div class="vbd-rev-match"><div class="vbd-rev-match-label">✅ Přesná shoda – doporučené držáky:</div>' +
        '<div class="vbd-rev-match-val">' + vbdToHolder[shape][angle] + '</div></div>';
    } else if (angle) {
      html += '<div class="vbd-rev-match"><div class="vbd-rev-match-label" style="color:#f9e2af">⚠ Pro kombinaci ' + shape + '+' + angle + ' nemáme specifické doporučení</div></div>';
    }

    // Show ALL holders that fit this shape (all angles)
    if (vbdToHolder[shape]) {
      html += '<div class="vbd-rev-all"><div class="vbd-rev-match-label">Všechny držáky pro tvar ' + shape + ':</div><table class="vbd-rev-tbl">';
      html += '<tr><th>Úhel</th><th>Typ upnutí</th><th>Doporučené držáky</th></tr>';
      for (var ak in vbdToHolder[shape]) {
        var angleDesc = ak === 'N' ? '0° Neg.' : ak === 'P' ? '11° Poz.' : ak === 'M' ? '15°' : ak;
        var isActive = (ak === angle);
        html += '<tr' + (isActive ? ' class="vbd-rev-active"' : '') + '><td><strong>' + ak + '</strong> ' + angleDesc + '</td><td>';
        // Infer clamping from holder prefix
        var holders = vbdToHolder[shape][ak].split(', ');
        var clamps = holders.map(function(h) {
          var c1 = h.charAt(0);
          if (c1 === 'C' || c1 === 'D' || c1 === 'P' || c1 === 'S' || c1 === 'M') return c1;
          return '?';
        });
        html += clamps.filter(function(v,i,a){ return a.indexOf(v)===i; }).join(', ');
        html += '</td><td>' + vbdToHolder[shape][ak] + '</td></tr>';
      }
      html += '</table></div>';
    }

    // Sizing recommendation
    html += '<div class="vbd-rev-tip">💡 <strong>Tip:</strong> Velikost držáku (25×25, 20×20…) volte dle stroje. R/L = pravý/levý.</div>';

    revResultEl.innerHTML = html;
    revResultEl.style.display = '';
  }

  // From text input
  function revFromCode(code) {
    code = code.replace(/[\s\-]/g, '').toUpperCase();
    if (code.length < 1) { revResultEl.style.display = 'none'; return; }
    var shape = code[0];
    var angle = code.length >= 2 ? code[1] : '';
    // Sync selects
    revShapeEl.value = shape;
    revAngleEl.value = angle;
    showHolderForVbd(shape, angle);
  }

  overlay.querySelector('#holderFromVbdBtn').addEventListener('click', function() {
    revFromCode(overlay.querySelector('#holderFromVbdInput').value);
  });
  overlay.querySelector('#holderFromVbdInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') revFromCode(this.value);
  });

  // From selects
  function revFromSelects() {
    showHolderForVbd(revShapeEl.value, revAngleEl.value);
  }
  revShapeEl.addEventListener('change', revFromSelects);
  revAngleEl.addEventListener('change', revFromSelects);

  // ── Cutting conditions select ──
  overlay.querySelector('#vbdCutMat').addEventListener('change', function() {
    var key = this.value;
    var resEl = overlay.querySelector('#vbdCutResult');
    if (!key) { resEl.style.display = 'none'; return; }
    var data = vbdCutCond[key];
    resEl.style.display = '';
    overlay.querySelector('#cutRVc').textContent = data.rough[0];
    overlay.querySelector('#cutRF').textContent = data.rough[1];
    overlay.querySelector('#cutRAp').textContent = data.rough[2];
    overlay.querySelector('#cutRVbd').textContent = data.rough[3];
    overlay.querySelector('#cutFVc').textContent = data.finish[0];
    overlay.querySelector('#cutFF').textContent = data.finish[1];
    overlay.querySelector('#cutFAp').textContent = data.finish[2];
    overlay.querySelector('#cutFVbd').textContent = data.finish[3];
  });

  // ── Search ──
  var searchInput = overlay.querySelector('#vbdSearch');
  var searchResults = overlay.querySelector('#vbdSearchResults');
  searchInput.addEventListener('input', function() {
    var q = this.value.toUpperCase().trim();
    if (q.length < 2) { searchResults.style.display = 'none'; return; }
    var results = [];
    // Search in VBD data
    for (var pk in vbdIsoData) {
      var pos = vbdIsoData[pk];
      for (var i = 0; i < pos.options.length; i++) {
        var opt = pos.options[i];
        if (opt.v.indexOf(q) >= 0 || opt.d.toUpperCase().indexOf(q) >= 0 || opt.dt.toUpperCase().indexOf(q) >= 0)
          results.push('<div class="vbd-sr"><b>' + pos.title + ':</b> ' + opt.v + ' – ' + opt.d + ' <small>(' + opt.dt + ')</small></div>');
      }
    }
    // Search in Holder data
    for (var hk in holderIso) {
      var hpos = holderIso[hk];
      for (var j = 0; j < hpos.options.length; j++) {
        var hopt = hpos.options[j];
        if (hopt.v.indexOf(q) >= 0 || hopt.d.toUpperCase().indexOf(q) >= 0 || hopt.dt.toUpperCase().indexOf(q) >= 0)
          results.push('<div class="vbd-sr"><b>Držák – ' + hpos.title + ':</b> ' + hopt.v + ' – ' + hopt.d + '</div>');
      }
    }
    if (results.length === 0) results.push('<div class="vbd-sr">Žádné shody</div>');
    searchResults.innerHTML = results.slice(0, 20).join('');
    searchResults.style.display = '';
  });
  searchInput.addEventListener('blur', function() { setTimeout(function() { searchResults.style.display = 'none'; }, 200); });

  // ── Clear ──
  overlay.querySelector('.cnc-btn-clear').addEventListener('click', function() {
    for (var i = 1; i <= 9; i++) sel[i] = '-';
    for (var j = 1; j <= 6; j++) hSel[j] = '-';
    updateVbd(); updateHolder();
    overlay.querySelector('#vbdAutoInput').value = '';
    overlay.querySelector('#holderAutoInput').value = '';
    overlay.querySelector('#holderFromVbdInput').value = '';
    revShapeEl.selectedIndex = 0; revAngleEl.selectedIndex = 0;
    revResultEl.style.display = 'none';
    overlay.querySelector('#vbdCutMat').selectedIndex = 0;
    overlay.querySelector('#vbdCutResult').style.display = 'none';
    searchInput.value = '';
    searchResults.style.display = 'none';
  });

  // ── Copy ──
  overlay.querySelector('.cnc-btn-copy').addEventListener('click', function() {
    var parts = [];
    var code1 = vbdCode.textContent.trim();
    if (code1 && code1.indexOf('–') !== 0) parts.push('VBD: ' + code1);
    var code2 = holderCodeEl.textContent.trim();
    if (code2 && code2.indexOf('–') !== 0) parts.push('Držák: ' + code2);
    var descText = vbdDesc.textContent;
    if (descText && descText.indexOf('Klikněte') < 0) parts.push(descText);
    if (parts.length) navigator.clipboard.writeText(parts.join(' | ')).then(function() { showToast('Zkopírováno'); });
  });
}