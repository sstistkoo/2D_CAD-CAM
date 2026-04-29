import { makeOverlay } from '../dialogFactory.js';

// ── Data: Ukázky CNC kódů (Sinumerik 840D – soustruh) ──────
const examples = [
  {
    title: 'Podložky',
    code: `G54 T1 D1 G95 M41
G97 S60 M4
G91 G1 X-300 F1
M30`,
    notes: [
      'G54 – Volba pracovního nulového bodu',
      'T1 D1 – Výběr nástroje 1 a korekce 1',
      'G95 – Posuv v mm/ot',
      'M41 – Nízký převodový stupeň',
      'G97 – Konstantní otáčky vřetena',
      'S60 – Otáčky 60/min',
      'M4 – Vřeteno vlevo (CCW)',
      'G91 – Přírůstkový režim',
      'G1 – Lineární interpolace',
      'X-300 – Posun v X o −300 mm',
      'F1 – Posuv 1 mm/ot',
      'M30 – Konec programu'
    ]
  },
  {
    title: 'Základní vnější soustružení',
    code: `G54
G90 G95
G96 S200 LIMS=2000
T1 D1
G0 X100 Z2
G1 Z0 F0.2
X-0.4
G0 X100 Z2`
  },
  {
    title: 'GOTO – Nepodmíněný skok',
    code: `N10 G0 X100 Z2       ; Rychloposuv na pozici
STARTPOINT:          ; Návěští pro skok
N20 G1 X80 F0.2     ; Pracovní posuv
N30 G0 X100         ; Odjezd
N40 Z-10            ; Posun v Z
N50 GOTO STARTPOINT ; Skok zpět na návěští
N60 M30             ; Konec programu (nikdy se neprovede)`
  },
  {
    title: 'GOTOB – Skok zpět s počítadlem',
    code: `N10 R1=0             ; Počítadlo cyklů
LOOP_START:          ; Návěští pro skok
N20 G1 X80 F0.2     ; Pracovní posuv
N30 G0 X100         ; Odjezd
N40 Z-10            ; Posun v Z
N50 R1=R1+1         ; Zvýšení počítadla
N60 IF R1<5 GOTOB LOOP_START  ; Skok zpět, pokud R1 < 5
N70 M30             ; Konec programu`
  },
  {
    title: 'FOR cyklus s transformací',
    code: `TRANS X100 Z50      ; Absolutní posunutí nulového bodu
FOR R1=1 TO 10     ; Začátek cyklu, 10 opakování
  G1 X80 F0.2      ; Pracovní posuv
  ATRANS X-5       ; Přírůstkové posunutí v X o -5mm
  G1 Z-10          ; Posun v Z
ENDFOR            ; Konec FOR cyklu
TRANS             ; Zrušení všech transformací
M30               ; Konec programu`
  },
  {
    title: 'GOTOF – Skok vpřed',
    code: `N10 R1=0             ; Nastavení proměnné
N20 G1 X100 F0.2    ; První řez
N30 IF R1>5 GOTOF ENDPOS  ; Skok na konec
N40 G1 X90          ; Další řez
N50 R1=R1+1         ; Zvýšení počítadla
N60 GOTO N30        ; Skok zpět na test
ENDPOS:             ; Návěští pro konec
N70 G0 X100 Z50     ; Koncová pozice
N80 M30             ; Konec programu`
  },
  {
    title: 'WHILE cyklus s výpisem parametrů',
    code: `G0 X0 Z0            ; Nájezd do počáteční pozice
R1=$AA_IW[X]       ; Uložení aktuální pozice X do R1
MSG("hodnoty osy X "<<R1<<" mm")

WHILE $AA_IW[X] < 100
    MSG("pocitadlo "<<R1<<" drazek")
    G1 X=R1 F0.2    ; Lineární pohyb v X
    G4 F0.5         ; Krátká prodleva
    R1=R1+10        ; Zvýšení počítadla o 10
ENDWHILE

MSG()              ; Vypnutí výpisu
G0 X200 Z50       ; Odjezd do bezpečné pozice
M30               ; Konec programu`
  },
  {
    title: 'Příklady výpisu MSG',
    code: `MSG("Aktualni hodnota: "<<R1)         ; Základní výpis proměnné
MSG("Pocet kusu: "<<R2<<" ks")        ; Výpis s jednotkami
MSG("Prumer: "<<$AA_IW[X]<<" mm")     ; Výpis systémové proměnné
MSG("Poloha Z: "<<R3<<" od nuly")     ; Výpis s dodatečným textem
MSG()                                  ; Vypnutí/vymazání zprávy`
  }
];

// ── Helpers ─────────────────────────────────────────────────
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ── Hlavní funkce ───────────────────────────────────────────
export function openCncExamples() {
  const bodyHTML = `
    <div class="gc-search-wrap">
      <input type="search" class="gc-search ex-search" id="exSearch" placeholder="Hledat ukázku…" autocomplete="off">
    </div>
    <div class="gc-list" id="exList"></div>
  `;

  const overlay = makeOverlay('cncexamples', '📝 Ukázky CNC kódů – Sinumerik 840D', bodyHTML, 'gc-window ex-window');
  if (!overlay) return;

  const searchEl = overlay.querySelector('#exSearch');
  const listEl   = overlay.querySelector('#exList');

  function render() {
    const q = searchEl.value.trim().toLowerCase();
    const filtered = examples.filter(ex =>
      !q || ex.title.toLowerCase().includes(q) || ex.code.toLowerCase().includes(q)
    );

    if (!filtered.length) {
      listEl.innerHTML = '<div class="gc-empty">Žádné výsledky</div>';
      return;
    }

    listEl.innerHTML = filtered.map(ex => {
      const notesHTML = (ex.notes || []).map(n => `<li>${esc(n)}</li>`).join('');
      return `
        <div class="gc-card gc-card-open ex-card" data-name="${esc(ex.title)}">
          <div class="gc-card-header ex-card-header">
            <span class="gc-card-name ex-card-name">${esc(ex.title)}</span>
            <button class="mc-copy-btn" data-code="${esc(ex.code)}" title="Kopírovat kód">📋</button>
          </div>
          <div class="gc-card-detail" style="display:block">
            <pre class="gc-ex-code ex-code-block">${esc(ex.code)}</pre>
            ${notesHTML ? `<ul class="ex-notes">${notesHTML}</ul>` : ''}
          </div>
        </div>`;
    }).join('');

    listEl.querySelectorAll('.mc-copy-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        navigator.clipboard.writeText(btn.dataset.code).then(() => {
          btn.textContent = '✓'; setTimeout(() => { btn.textContent = '📋'; }, 1200);
        });
      });
    });
  }

  searchEl.addEventListener('input', render);
  render();
  searchEl.focus();
}
