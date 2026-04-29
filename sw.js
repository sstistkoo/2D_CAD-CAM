// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Service Worker (PWA offline cache)                 ║
// ╚══════════════════════════════════════════════════════════════╝

const CACHE_NAME = 'skica-v170';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/bridge.js',
  './js/calculators/camSimulator.js',
  './js/calculators/cncEditor.js',
  './js/calculators/cncExamples.js',
  './js/calculators/commands.js',
  './js/calculators/convert.js',
  './js/calculators/cutting.js',
  './js/calculators/gcode.js',
  './js/calculators/help.js',
  './js/calculators/insert.js',
  './js/calculators/mcode.js',
  './js/calculators/roughness.js',
  './js/calculators/shortcuts.js',
  './js/calculators/sinumerikHub.js',
  './js/calculators/sysvar.js',
  './js/calculators/taper.js',
  './js/calculators/thread.js',
  './js/calculators/threadData.js',
  './js/calculators/tolerance.js',
  './js/calculators/weight.js',
  './js/canvas.js',
  './js/cnc-calcs.js',
  './js/constants.js',
  './js/dialogFactory.js',
  './js/dialogs.js',
  './js/dialogs/autoDetect.js',
  './js/dialogs/booleanDialog.js',
  './js/dialogs/bulge.js',
  './js/dialogs/circleRadius.js',
  './js/dialogs/dimension.js',
  './js/dialogs/gearDialog.js',
  './js/dialogs/measure.js',
  './js/dialogs/mobileEdit.js',
  './js/dialogs/numericalInput.js',
  './js/dialogs/objectDialogs.js',
  './js/dialogs/polarDrawing.js',
  './js/dialogs/postDrawDialog.js',
  './js/dialogs/tangentDialogs.js',
  './js/dialogs/textDialog.js',
  './js/dxf.js',
  './js/events.js',
  './js/geometry.js',
  './js/idb.js',
  './js/lib/dxf-parser.min.js',
  './js/lib/jspdf.umd.min.js',
  './js/objects.js',
  './js/render.js',
  './js/state.js',
  './js/storage.js',
  './js/storage/autoSave.js',
  './js/storage/exportImage.js',
  './js/storage/fileIO.js',
  './js/storage/projectManager.js',
  './js/tools/anchorClick.js',
  './js/tools/arcClick.js',
  './js/tools/booleanClick.js',
  './js/tools/breakClick.js',
  './js/tools/centerMarkClick.js',
  './js/tools/circleClick.js',
  './js/tools/circularArrayClick.js',
  './js/tools/copyPlaceClick.js',
  './js/tools/dimensionClick.js',
  './js/tools/extendClick.js',
  './js/tools/filletClick.js',
  './js/tools/filletChamferClick.js',
  './js/tools/gearClick.js',
  './js/tools/gearGenerator.js',
  './js/tools/helpers.js',
  './js/tools/horizontalClick.js',
  './js/tools/chainDimensionClick.js',
  './js/tools/chamferClick.js',
  './js/tools/index.js',
  './js/tools/lineClick.js',
  './js/tools/measureClick.js',
  './js/tools/moveClick.js',
  './js/tools/offsetClick.js',
  './js/tools/parallelClick.js',
  './js/tools/perpClick.js',
  './js/tools/polylineClick.js',
  './js/tools/profileTraceClick.js',
  './js/tools/rectClick.js',
  './js/tools/scaleClick.js',
  './js/tools/snapPointClick.js',
  './js/tools/tangentClick.js',
  './js/tools/textClick.js',
  './js/tools/trimClick.js',
  './js/touch.js',
  './js/types.js',
  './js/ui.js',
  './js/utils.js',
  './dxf-json.html',
  './gear_debug.html',
  './gear_profiles.html',
  './internal_gear_test.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
];

// ── Install: nacachovat všechny assets ──
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  // Nečekat na zavření starých tabů – aktivovat ihned
  self.skipWaiting();
});

// ── Activate: smazat staré verze cache ──
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first pro localhost, stale-while-revalidate pro produkci ──
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Jen GET requesty ze stejného originu
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Na localhostu preferovat síť (development)
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    e.respondWith(
      fetch(e.request).then((resp) => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Produkce: stale-while-revalidate
  // Vrátit cache ihned (rychlé načtení), na pozadí stáhnout aktuální verzi
  e.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(e.request).then((cached) => {
        const fetchPromise = fetch(e.request).then((resp) => {
          if (resp && resp.status === 200) {
            cache.put(e.request, resp.clone());
          }
          return resp;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    )
  );
});
