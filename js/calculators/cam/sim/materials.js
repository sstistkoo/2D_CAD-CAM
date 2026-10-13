// Materiály pro předvolbu řezných podmínek v záložce ⚙ Parametry CAM simulátoru
// (vyňato z camSimulator.js, docs/plan-rozdeleni-cam-simulatoru.md).
export const MATERIALS = {
  'Ocel 11 373 (S235)':   { speed: 200, feed: 0.25, depth: 2.5, name: "Ocel (Měkká)" },
  'Ocel 14 220 (Cement)': { speed: 160, feed: 0.2,  depth: 1.5, name: "Ocel (Tvrdší)" },
  'Nerez 17 240 (304)':   { speed: 120, feed: 0.15, depth: 1.0, name: "Nerez" },
  'Hliník (AlSi)':        { speed: 400, feed: 0.35, depth: 4.0, name: "Hliník" },
  'Mosaz':                { speed: 300, feed: 0.2,  depth: 2.5, name: "Mosaz" },
  'Plast (POM)':          { speed: 500, feed: 0.4,  depth: 5.0, name: "Plast" }
};
