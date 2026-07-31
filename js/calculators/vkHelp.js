// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Nápověda k modulu VK (Volná kontura)                ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Statická referenční data pro dialog VK (js/calculators/vkContour.js) –
// vykreslují se líně, až uživatel rozbalí sekci nápovědy v editoru.

const basicsSection = {
  icon: '📝', color: 'text',
  title: 'Základní příkazy a zápis',
  items: [
    {
      title: 'Význam základních příkazů',
      desc: '• <strong>G0</strong> = Počáteční bod (poloha v klidu) – první prvek kontury, řádky <code>X?</code>/<code>Z?</code> nebo <code>PA/PR</code>.<br>' +
            '• <strong>G111</strong> = Definice pólu (VPOL) pro určení úhlů a konstrukčních drah.<br>' +
            '• <strong>G11</strong> = Volná úsečka bez rozměrů (<code>X?</code>, <code>Z?</code>) nebo polárně přes <code>PA/PR</code>.<br>' +
            '• <strong>G2 / G3</strong> = Volný oblouk s poloměrem <code>R</code>.',
    },
    {
      title: 'Možnosti zápisu geometrie',
      desc: '• <strong>Průsečíky (?)</strong>: Neznámé se ručně přepíší po externím výpočtu.<br>' +
            '• <strong>Tečnost (T)</strong>: Plynulé napojení na předchozí prvek.<br>' +
            '• <strong>Konverze</strong>: Po doplnění hodnot lze kód převést na čistý standardní ISO G-kód.',
    },
    {
      title: 'Formáty pro uložení (export)',
      desc: '• <code>.NC</code> / <code>.TXT</code> = Univerzální textový ISO G-kód.<br>' +
            '• <code>.DIN</code> = Standard dle normy DIN 66025.<br>' +
            '• <code>.MPF</code> = Hlavní program kontury (Siemens).<br>' +
            '• <code>.SPF</code> = Technologický podprogram.',
    },
  ],
};

const vpolSection = {
  icon: '🔍', color: 'blue',
  title: 'Význam parametru VPOL',
  items: [
    {
      title: 'Kdy je VPOL nutný?',
      desc: 'Při křížení prvků se dvěma matematickými řešeními. Určuje jednoznačnou dráhu:<br>' +
            '• <strong>VPOL1</strong> = První řešení (bližší bod od počátku / spodní průsečík).<br>' +
            '• <strong>VPOL2</strong> = Druhé řešení (vzdálenější / horní průsečík).',
    },
  ],
};

const linearSection = {
  icon: '📐', color: 'orange',
  title: '1. Lineární kombinace (přímky)',
  items: [
    { title: 'Úsečka (?) ➔ Úsečka (známá)', syntax: 'G11 X40.0 Z?\nG11 X60.0 Z-20.0' },
    { title: 'Úsečka (?) ➔ Kužel (známý)', syntax: 'G11 X30.0 Z?\nG11 X50.0 Z-30.0 PA135' },
    { title: 'Kužel (?) ➔ Úsečka (známá)', syntax: 'G11 X? Z? PA150\nG11 X60.0 Z-40.0' },
    { title: 'Kužel (?) ➔ Kužel (známý)', syntax: 'G11 X? Z? PA140\nG11 X80.0 Z-50.0 PA165' },
  ],
};

const arcSection = {
  icon: '⭕', color: 'green',
  title: '2. Jeden tečný oblouk',
  items: [
    { title: 'Úsečka (?) ➔ Oblouk (známý)', syntax: 'G11 X40.0 Z?\nG2 X50.0 Z-25.0 R5.0 T' },
    { title: 'Úsečka (?) ➔ Oblouk ➔ Kužel', badge: 'VPOL', syntax: 'G11 X20.0 Z?\nG2 X? Z? R3.0 T VPOL1\nG11 X40.0 Z-30.0 PA150 T' },
    { title: 'Kužel (?) ➔ Oblouk ➔ Úsečka', syntax: 'G11 X? Z? PA135\nG3 X? Z? R4.0 T\nG11 X50.0 Z-40.0 T' },
    { title: 'Kužel (?) ➔ Oblouk ➔ Kužel', badge: 'VPOL', syntax: 'G11 X? Z? PA160\nG2 X? Z? R5.0 T VPOL2\nG11 X70.0 Z-45.0 PA130 T' },
  ],
};

const sSection = {
  icon: '〰️', color: 'mauve',
  title: '3. Pokročilá esíčka',
  items: [
    { title: 'Oblouk (?) ➔ Oblouk (známý)', badge: 'VPOL', syntax: 'G2 X? Z? R8.0\nG3 X50.0 Z-30.0 R6.0 T VPOL1' },
    { title: 'Úsečka ➔ Oblouk ➔ Oblouk ➔ Úsečka', badge: 'VPOL', syntax: 'G11 X20.0 Z?\nG2 X? Z? R5.0 T VPOL1\nG3 X? Z? R5.0 T VPOL2\nG11 X60.0 Z-40.0 T' },
  ],
};

const nonTangentSection = {
  icon: '⚡', color: 'red',
  title: '4. Netečná napojení',
  items: [
    { title: 'Úsečka (?) ➔ Oblouk (netečný)', badge: 'VPOL', syntax: 'G11 X30.0 Z?\nG2 X50.0 Z-20.0 R10.0 VPOL2' },
    { title: 'Oblouk (?) ➔ Kužel (netečný)', badge: 'VPOL', syntax: 'G3 X? Z? R12.0\nG11 X70.0 Z-35.0 PA120 VPOL1' },
  ],
};

const sections = [basicsSection, vpolSection, linearSection, arcSection, sSection, nonTangentSection];

function renderItem(item) {
  const badge = item.badge ? `<span class="vk-badge">${item.badge}</span>` : '';
  const syntax = item.syntax ? `<div class="vk-syntax-box">${item.syntax}</div>` : '';
  const desc = item.desc ? `<div class="vk-combo-desc">${item.desc}</div>` : '';
  return `
    <div class="vk-combo-block">
      <div class="vk-combo-title">${item.title}${badge}</div>
      ${desc}
      ${syntax}
    </div>`;
}

function renderSection(sec, idx) {
  return `
    <details class="sn-help-details" ${idx === 0 ? 'open' : ''}>
      <summary class="sn-help-summary"><span class="vk-help-c-${sec.color}">${sec.icon} ${sec.title}</span></summary>
      <div class="sn-help-body vk-help-section-body">
        ${sec.items.map(renderItem).join('')}
      </div>
    </details>`;
}

/** Vrátí HTML nápovědy VK (přehled syntaxe a kombinací). Volá se líně při rozbalení sekce. */
export function renderVkHelp() {
  return `
    <div class="sn-help-intro">Přehled zápisu volné kontury – od základních příkazů po kombinace s VPOL.</div>
    ${sections.map(renderSection).join('')}
  `;
}
