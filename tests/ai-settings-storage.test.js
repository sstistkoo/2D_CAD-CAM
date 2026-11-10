// @vitest-environment happy-dom
// AI nastavení (js/ai/aiSettings.js): „Pamatovat klíče v tomto prohlížeči".
// Zapnuto (výchozí, i pro data uložená před 10. 11. 2026) = vše v localStorage.
// Vypnuto = klíče jen v sessionStorage, v localStorage zbytek bez klíčů.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAISettings, saveAISettings } from '../js/ai/aiSettings.js';

const LS = 'skica_ai_settings';
const SS = 'skica_ai_keys_session';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('AI nastavení – úložiště klíčů', () => {
  it('stará uložená data (bez rememberKeys) = pamatovat, klíč se načte', () => {
    localStorage.setItem(LS, JSON.stringify({ active: 'groq', providers: { groq: { apiKey: 'gsk_123456', model: 'm' } } }));
    const s = loadAISettings();
    expect(s.rememberKeys).toBe(true);
    expect(s.providers.groq.apiKey).toBe('gsk_123456');
    expect(s.providers.groq.apiKeys).toEqual(['gsk_123456']);
  });

  it('nepamatovat: v localStorage žádný klíč, model zůstane; po načtení klíč ze sessionStorage', () => {
    const s = loadAISettings();
    s.rememberKeys = false;
    s.active = 'gemini';
    s.providers.gemini = { ...s.providers.gemini, apiKey: 'AIza_secret', apiKeys: ['AIza_secret'], model: 'gemini-x' };
    expect(saveAISettings(s)).toBe(true);

    const local = localStorage.getItem(LS);
    expect(local).not.toMatch(/AIza_secret/);
    expect(JSON.parse(local).providers.gemini.model).toBe('gemini-x');
    expect(sessionStorage.getItem(SS)).toMatch(/AIza_secret/);

    const back = loadAISettings();
    expect(back.rememberKeys).toBe(false);
    expect(back.providers.gemini.apiKey).toBe('AIza_secret');
    expect(back.providers.gemini.model).toBe('gemini-x');
  });

  it('nepamatovat + zavřená karta (prázdná sessionStorage) = bez klíče, zbytek drží', () => {
    const s = loadAISettings();
    s.rememberKeys = false;
    s.providers.openrouter.apiKey = 'sk-or-1';
    s.providers.openrouter.model = 'free-model';
    saveAISettings(s);
    sessionStorage.clear();
    const back = loadAISettings();
    expect(back.providers.openrouter.apiKey).toBe('');
    expect(back.providers.openrouter.apiKeys).toEqual([]);
    expect(back.providers.openrouter.model).toBe('free-model');
  });

  it('okno: zaškrtávátko odpovídá nastavení a „Uložit a zavřít" ho uloží', async () => {
    const { installUiDom } = await import('./helpers/uiDom.mjs');
    installUiDom();
    const { openAISettings } = await import('../js/ai/aiSettings.js');
    openAISettings();
    const box = document.querySelector('#aiRememberKeys');
    expect(box.checked).toBe(true);
    document.querySelector('#aiApiKey').value = 'sk-or-okno';
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    document.querySelector('#aiSaveClose').click();
    expect(localStorage.getItem(LS)).not.toMatch(/sk-or-okno/);
    expect(sessionStorage.getItem(SS)).toMatch(/sk-or-okno/);
    expect(document.querySelector('#aiRememberKeys')).toBeNull();   // okno zavřené
  });

  it('znovu zapnout pamatování: klíče zpět do localStorage, sessionStorage se vyčistí', () => {
    const s = loadAISettings();
    s.rememberKeys = false;
    s.providers.groq.apiKey = 'gsk_abc';
    saveAISettings(s);
    const again = loadAISettings();
    again.rememberKeys = true;
    saveAISettings(again);
    expect(localStorage.getItem(LS)).toMatch(/gsk_abc/);
    expect(sessionStorage.getItem(SS)).toBeNull();
    expect(loadAISettings().providers.groq.apiKey).toBe('gsk_abc');
  });
});
