// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – IndexedDB abstrakční vrstva                        ║
// ╚══════════════════════════════════════════════════════════════╝

const DB_NAME = 'skica-db';
const DB_VERSION = 1;

const STORE_PROJECTS = 'projects';   // key: name → project data
const STORE_META     = 'meta';       // key-value store (currentProject, helpShown, calcHistory…)

let _db = null;

/** Otevře / vytvoří databázi. Vrací Promise<IDBDatabase>. */
function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS);
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

// ── Generické operace ──

async function _put(storeName, key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, 'readwrite');
    } catch (e) {
      return reject(e);
    }
    const req = tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => {
      const err = e.target.error;
      if (err && err.name === 'QuotaExceededError') {
        reject(new DOMException('Uložiště je plné – nelze uložit data', 'QuotaExceededError'));
      } else {
        reject(err);
      }
    };
    req.onerror = (e) => {
      const err = e.target.error;
      if (err && err.name === 'QuotaExceededError') {
        reject(new DOMException('Uložiště je plné – nelze uložit data', 'QuotaExceededError'));
      }
    };
  });
}

async function _get(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function _delete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function _getAllKeys(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function _getAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const keys = [];
    const values = [];
    const reqKeys = store.getAllKeys();
    const reqVals = store.getAll();
    let done = 0;
    function check() {
      if (++done === 2) {
        const result = {};
        for (let i = 0; i < keys.length; i++) result[keys[i]] = values[i];
        resolve(result);
      }
    }
    reqKeys.onsuccess = () => { keys.push(...reqKeys.result); check(); };
    reqVals.onsuccess = () => { values.push(...reqVals.result); check(); };
    tx.onerror = (e) => reject(e.target.error);
  });
}

// ── Projects API ──

/** Uloží projekt pod daným názvem. */
export async function saveProjectToDB(name, data) {
  await _put(STORE_PROJECTS, name, data);
}

/** Načte projekt podle názvu. Vrátí null pokud neexistuje. */
export async function loadProjectFromDB(name) {
  const val = await _get(STORE_PROJECTS, name);
  return val ?? null;
}

/** Smaže projekt. */
export async function deleteProjectFromDB(name) {
  await _delete(STORE_PROJECTS, name);
}

/** Vrátí objekt { name: data, … } se všemi projekty. */
export async function getAllProjects() {
  return _getAll(STORE_PROJECTS);
}

/** Vrátí pole názvů projektů. */
export async function getProjectNames() {
  return _getAllKeys(STORE_PROJECTS);
}

// ── Meta (key-value) API ──

/** Uloží libovolnou hodnotu pod klíčem (calcHistory, helpShown, currentProject…). */
export async function setMeta(key, value) {
  await _put(STORE_META, key, value);
}

/** Přečte meta hodnotu. Vrátí undefined pokud neexistuje. */
export async function getMeta(key) {
  return _get(STORE_META, key);
}

// ── Migrace z localStorage ──

/** Jednorázově přesune data z localStorage do IndexedDB, pak je z localStorage smaže. */
export async function migrateFromLocalStorage() {
  const migrated = await getMeta('_migrated');
  if (migrated) return { skipped: true };

  const report = { projects: 0, errors: [] };

  // Migrate skica_projects
  try {
    const raw = localStorage.getItem('skica_projects');
    if (raw) {
      const projects = JSON.parse(raw);
      for (const [name, data] of Object.entries(projects)) {
        try {
          await saveProjectToDB(name, data);
          report.projects++;
        } catch (e) {
          report.errors.push(`Projekt '${name}': ${e.message}`);
        }
      }
    }
  } catch (e) {
    report.errors.push(`skica_projects: ${e.message}`);
  }

  // Migrate skica_project (single/current project)
  try {
    const raw = localStorage.getItem('skica_project');
    if (raw) {
      await setMeta('currentProjectData', JSON.parse(raw));
    }
  } catch (e) {
    report.errors.push(`skica_project: ${e.message}`);
  }

  // Migrate calcHistory
  try {
    const raw = localStorage.getItem('calcHistory');
    if (raw) await setMeta('calcHistory', JSON.parse(raw));
  } catch (e) {
    report.errors.push(`calcHistory: ${e.message}`);
  }

  // Migrate helpShown flag
  try {
    const val = localStorage.getItem('skica_helpShown');
    if (val) await setMeta('helpShown', val);
  } catch (e) {
    report.errors.push(`helpShown: ${e.message}`);
  }

  // Mark as migrated
  await setMeta('_migrated', true);

  // Clean up localStorage
  localStorage.removeItem('skica_project');
  localStorage.removeItem('skica_projects');
  localStorage.removeItem('calcHistory');
  localStorage.removeItem('skica_helpShown');

  if (report.errors.length > 0) {
    console.warn('Migrace z localStorage - chyby:', report.errors);
  }
  return report;
}
