// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – AI nastavení (Groq / Gemini / OpenRouter)         ║
// ║  Modal pro API klíče + výběr modelu s dynamickým           ║
// ║  načítáním aktuálního seznamu free modelů.                 ║
// ╚══════════════════════════════════════════════════════════════╝

import { showToast } from '../state.js';
import { makeOverlay } from '../dialogFactory.js';

const STORAGE_KEY = 'skica_ai_settings';

/** Konfigurace podporovaných AI providerů. */
export const AI_PROVIDERS = {
  groq: {
    name: 'Groq',
    keyUrl: 'https://console.groq.com/keys',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    keyRequiredForList: true,
  },
  gemini: {
    name: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    keyRequiredForList: true,
  },
  openrouter: {
    name: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/keys',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    keyRequiredForList: false,
  },
};

function emptyProvider() {
  return { apiKey: '', model: '', apiKeys: [], temperature: 0 };
}

// Sloučí uložená data providera s výchozími a normalizuje seznam klíčů.
function normProvider(o) {
  const r = { ...emptyProvider(), ...(o || {}) };
  if (!Array.isArray(r.apiKeys)) r.apiKeys = [];
  if (r.apiKey && !r.apiKeys.includes(r.apiKey)) r.apiKeys.unshift(r.apiKey);
  const t = Number(r.temperature);
  r.temperature = isFinite(t) ? Math.min(2, Math.max(0, t)) : 0;
  return r;
}

/** Načte uložené AI nastavení (localStorage). */
export function loadAISettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const s = raw ? JSON.parse(raw) : {};
    const p = s.providers || {};
    return {
      active: AI_PROVIDERS[s.active] ? s.active : 'openrouter',
      providers: {
        groq: normProvider(p.groq),
        gemini: normProvider(p.gemini),
        openrouter: normProvider(p.openrouter),
      },
    };
  } catch {
    return {
      active: 'openrouter',
      providers: { groq: emptyProvider(), gemini: emptyProvider(), openrouter: emptyProvider() },
    };
  }
}

/** Uloží AI nastavení do localStorage. */
export function saveAISettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

/** Vrátí aktivního providera + jeho konfiguraci (klíč, model). */
export function getActiveAIConfig() {
  const s = loadAISettings();
  return { provider: s.active, ...s.providers[s.active], meta: AI_PROVIDERS[s.active] };
}

function dedupeSort(list) {
  const seen = new Set();
  const out = [];
  for (const m of list) {
    if (!m.id || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

/**
 * Načte aktuální seznam free / dostupných modelů daného providera.
 * @param {string} providerId - 'groq' | 'gemini' | 'openrouter'
 * @param {string} apiKey
 * @returns {Promise<{id:string,label:string}[]>}
 */
export async function fetchFreeModels(providerId, apiKey, includePaid = false) {
  const p = AI_PROVIDERS[providerId];
  if (!p) throw new Error('Neznámý provider');

  // ── OpenRouter: seznam i bez klíče, free = nulová cena nebo ":free" ──
  if (providerId === 'openrouter') {
    const res = await fetch(p.modelsUrl, {
      headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {},
    });
    if (!res.ok) throw new Error('OpenRouter: HTTP ' + res.status);
    const json = await res.json();
    const list = (json.data || [])
      .filter((m) => {
        if (includePaid) return true;
        const pr = m.pricing || {};
        const isZero = (v) => v === '0' || v === 0;
        const free = isZero(pr.prompt) && isZero(pr.completion);
        return free || /:free$/.test(m.id || '');
      })
      .map((m) => {
        const arch = m.architecture || {};
        const inMod = arch.input_modalities || [];
        const vision = inMod.includes('image') || /image/i.test(arch.modality || '');
        return { id: m.id, label: m.name || m.id, vision };
      });
    return dedupeSort(list);
  }

  // ── Groq: OpenAI-kompatibilní /models, klíč povinný ──
  if (providerId === 'groq') {
    if (!apiKey) throw new Error('Groq vyžaduje API klíč pro načtení modelů');
    const res = await fetch(p.modelsUrl, {
      headers: { Authorization: 'Bearer ' + apiKey },
    });
    if (!res.ok) {
      throw new Error('Groq: HTTP ' + res.status + (res.status === 401 ? ' (neplatný klíč)' : ''));
    }
    const json = await res.json();
    const list = (json.data || [])
      // jen jazykové/vision modely (vynech audio: whisper, tts)
      .filter((m) => !/whisper|tts|playai|guard/i.test(m.id || ''))
      .map((m) => ({ id: m.id, label: m.id, vision: /vision|llama-4|scout|maverick/i.test(m.id || '') }));
    return dedupeSort(list);
  }

  // ── Gemini: ListModels, klíč povinný, jen generateContent ──
  if (providerId === 'gemini') {
    if (!apiKey) throw new Error('Gemini vyžaduje API klíč pro načtení modelů');
    const url = p.modelsUrl + '?pageSize=200&key=' + encodeURIComponent(apiKey);
    const res = await fetch(url);
    if (!res.ok) {
      const bad = res.status === 400 || res.status === 403;
      throw new Error('Gemini: HTTP ' + res.status + (bad ? ' (neplatný klíč)' : ''));
    }
    const json = await res.json();
    const list = (json.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => {
        const id = (m.name || '').replace(/^models\//, '');
        // Gemini 1.5/2.x i Gemma 3 jsou multimodální; vynech embedding/aqa/tts/imagen
        const vision = /gemini|vision|gemma-3/i.test(id) && !/embedding|aqa|imagen|tts/i.test(id);
        return {
          id,
          label: (m.displayName || m.name || '').replace(/^models\//, ''),
          vision,
        };
      });
    return dedupeSort(list);
  }

  return [];
}

const BODY_HTML = `
  <div class="ai-settings">
    <label class="ai-row">
      <span>Provider</span>
      <select id="aiProvider">
        <option value="groq">Groq</option>
        <option value="gemini">Google Gemini</option>
        <option value="openrouter">OpenRouter</option>
      </select>
    </label>

    <label class="ai-row" id="aiSavedRow">
      <span>Uložené klíče</span>
      <select id="aiSavedKeys"></select>
    </label>

    <label class="ai-row">
      <span>API klíč</span>
      <input type="password" id="aiApiKey" autocomplete="off" spellcheck="false" placeholder="vlož API klíč" />
    </label>
    <div class="ai-actions">
      <button class="btn-ok" id="aiSaveKey" type="button">💾 Uložit klíč</button>
      <button class="btn-ok" id="aiDeleteKey" type="button">🗑 Smazat</button>
    </div>
    <div class="ai-row-link">
      <a id="aiKeyLink" href="#" target="_blank" rel="noopener noreferrer">Získat klíč</a>
    </div>

    <label class="ai-row">
      <span>Model</span>
      <select id="aiModel"></select>
    </label>

    <label class="ai-row">
      <span>Teplota (0 = přesné, vyšší = kreativnější)</span>
      <input type="number" id="aiTemp" min="0" max="2" step="0.1" />
    </label>

    <div class="ai-actions">
      <button class="btn-ok" id="aiLoadModels" type="button">↻ Načíst free modely</button>
      <button class="btn-ok" id="aiLoadAll" type="button">↻ I placené</button>
    </div>

    <div class="ai-status" id="aiStatus"></div>

    <div class="ai-actions ai-actions-bottom">
      <button class="btn-ok btn-primary" id="aiSaveClose" type="button">Uložit a zavřít</button>
    </div>

    <p class="ai-note">🖼 = model umí číst obrázky (potřebné pro analýzu výkresu).</p>
    <p class="ai-note">🔒 API klíče se ukládají pouze lokálně v tomto prohlížeči (localStorage).</p>
  </div>
`;

/** Otevře modal s nastavením AI providerů. */
export function openAISettings() {
  const overlay = makeOverlay('ai-settings', '🤖 AI – nastavení', BODY_HTML, 'ai-window');
  if (!overlay) return; // už je otevřený

  const settings = loadAISettings();
  const $ = (sel) => overlay.querySelector(sel);

  const provSel = $('#aiProvider');
  const keyInput = $('#aiApiKey');
  const savedSel = $('#aiSavedKeys');
  const modelSel = $('#aiModel');
  const tempInput = $('#aiTemp');
  const statusEl = $('#aiStatus');
  const keyLink = $('#aiKeyLink');

  let current = settings.active;
  let lastModels = []; // naposledy načtené modely aktuálního providera

  // Uloží rozpracované hodnoty aktuálního providera do paměti (ne na disk).
  function stashCurrent() {
    settings.providers[current].apiKey = keyInput.value.trim();
    settings.providers[current].model = modelSel.value;
    const t = parseFloat(tempInput.value);
    settings.providers[current].temperature = isFinite(t) ? Math.min(2, Math.max(0, t)) : 0;
  }

  const maskKey = (k) => (k && k.length > 6 ? '••••' + k.slice(-4) : '••••');

  // Naplní dropdown uložených klíčů (maskovaně) pro aktuálního providera.
  function renderSavedKeys() {
    const keys = settings.providers[current].apiKeys || [];
    savedSel.innerHTML = '';
    const head = document.createElement('option');
    head.value = '';
    head.textContent = keys.length ? '— vybrat uložený klíč —' : '— žádné uložené klíče —';
    savedSel.appendChild(head);
    keys.forEach((k, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = maskKey(k);
      savedSel.appendChild(o);
    });
  }

  function saveKey() {
    const k = keyInput.value.trim();
    if (!k) { showToast('Zadej API klíč'); return; }
    const cfg = settings.providers[current];
    if (!Array.isArray(cfg.apiKeys)) cfg.apiKeys = [];
    if (!cfg.apiKeys.includes(k)) cfg.apiKeys.push(k);
    cfg.apiKey = k;
    saveAISettings(settings);
    renderSavedKeys();
    showToast('Klíč uložen ✓');
  }

  function deleteKey() {
    const cfg = settings.providers[current];
    const cur = keyInput.value.trim();
    const before = (cfg.apiKeys || []).length;
    cfg.apiKeys = (cfg.apiKeys || []).filter((k) => k !== cur);
    if (cfg.apiKey === cur) cfg.apiKey = cfg.apiKeys[0] || '';
    keyInput.value = cfg.apiKey;
    saveAISettings(settings);
    renderSavedKeys();
    showToast(before === cfg.apiKeys.length ? 'Tento klíč není uložený' : 'Klíč smazán');
  }

  // Vykreslí <option> ze lastModels: vision modely nahoru, značka 🖼.
  function renderModelOptions() {
    const prevModel = settings.providers[current].model || modelSel.value;
    const list = lastModels.slice();
    list.sort((a, b) => (b.vision === a.vision ? a.label.localeCompare(b.label) : b.vision - a.vision));
    modelSel.innerHTML = '';
    if (!list.length) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = '(žádné modely)';
      modelSel.appendChild(o);
      return;
    }
    for (const m of list) {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = (m.vision ? '🖼 ' : '') + m.label;
      if (m.id === prevModel) o.selected = true;
      modelSel.appendChild(o);
    }
  }

  function renderProvider(pid) {
    current = pid;
    provSel.value = pid;
    lastModels = []; // při přepnutí providera zahoď starý seznam
    const p = AI_PROVIDERS[pid];
    const cfg = settings.providers[pid];

    keyInput.value = cfg.apiKey || '';
    tempInput.value = cfg.temperature ?? 0;
    renderSavedKeys();
    keyLink.href = p.keyUrl;
    keyLink.textContent = '↗ Získat API klíč (' + p.name + ')';

    // Model dropdown: dokud se nenačtou modely, ukaž uložený / placeholder
    modelSel.innerHTML = '';
    const opt = document.createElement('option');
    if (cfg.model) {
      opt.value = cfg.model;
      opt.textContent = cfg.model;
      opt.selected = true;
    } else {
      opt.value = '';
      opt.textContent = '— načti modely —';
    }
    modelSel.appendChild(opt);

    statusEl.textContent = p.keyRequiredForList
      ? 'Pro načtení modelů zadej API klíč a klikni „Načíst free modely“.'
      : 'Modely lze načíst i bez klíče.';
    statusEl.className = 'ai-status';
  }

  async function loadModels(includePaid) {
    const pid = current;
    const key = keyInput.value.trim();
    statusEl.textContent = 'Načítám modely…';
    statusEl.className = 'ai-status ai-status-busy';
    const btnFree = $('#aiLoadModels'), btnAll = $('#aiLoadAll');
    btnFree.disabled = btnAll.disabled = true;
    try {
      lastModels = await fetchFreeModels(pid, key, includePaid);
      renderModelOptions();
      const visCount = lastModels.filter((m) => m.vision).length;
      const kind = includePaid ? 'modelů (vč. placených)' : 'free modelů';
      statusEl.textContent = `Načteno ${lastModels.length} ${kind} (🖼 ${visCount} pro obrázky).`;
      statusEl.className = 'ai-status ai-status-ok';
    } catch (e) {
      statusEl.textContent = 'Chyba: ' + e.message;
      statusEl.className = 'ai-status ai-status-err';
      showToast('AI: ' + e.message);
    } finally {
      btnFree.disabled = btnAll.disabled = false;
    }
  }

  function save() {
    stashCurrent();
    // aktivní klíč rovnou ulož mezi uložené (ať se neztratí)
    const cfg = settings.providers[current];
    const k = (cfg.apiKey || '').trim();
    if (!Array.isArray(cfg.apiKeys)) cfg.apiKeys = [];
    if (k && !cfg.apiKeys.includes(k)) cfg.apiKeys.push(k);
    settings.active = current;
    const ok = saveAISettings(settings);
    showToast(ok ? 'AI nastavení uloženo' : 'Nelze uložit AI nastavení');
    return ok;
  }

  provSel.addEventListener('change', () => {
    stashCurrent();
    renderProvider(provSel.value);
  });
  savedSel.addEventListener('change', () => {
    if (savedSel.value === '') return;
    const k = (settings.providers[current].apiKeys || [])[Number(savedSel.value)];
    if (k) { keyInput.value = k; settings.providers[current].apiKey = k; }
  });
  $('#aiSaveKey').addEventListener('click', saveKey);
  $('#aiDeleteKey').addEventListener('click', deleteKey);
  $('#aiLoadModels').addEventListener('click', () => loadModels(false));
  $('#aiLoadAll').addEventListener('click', () => loadModels(true));
  $('#aiSaveClose').addEventListener('click', () => {
    if (save()) overlay.remove();
  });
  // Stop propagace kláves (aby needitovaly plátno)
  overlay.querySelectorAll('input, select').forEach((el) => {
    el.addEventListener('keydown', (e) => e.stopPropagation());
  });

  renderProvider(current);
}
