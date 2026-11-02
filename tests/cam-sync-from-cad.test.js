import { describe, it, expect } from 'vitest';
import { syncParamsFromCad, _defaultCamParams } from '../js/calculators/cam/camDefaults.js';

describe('syncParamsFromCad — CAM přebírá typ stroje a mód X z CAD', () => {
  it('karusel v CAD → karusel v CAM (dřív se otevřel soustruh)', () => {
    const p = _defaultCamParams();
    syncParamsFromCad(p, { machineType: 'karusel', xDisplayMode: 'diameter' });
    expect(p.machineStructure).toBe('carousel');
    expect(p.mode).toBe('DIAMON');
  });
  it('soustruh v CAD přepíše karusel naposledy zvolený v CAM', () => {
    const p = { ..._defaultCamParams(), machineStructure: 'carousel' };
    syncParamsFromCad(p, { machineType: 'soustruh', xDisplayMode: 'radius' });
    expect(p.machineStructure).toBe('lathe');
    expect(p.mode).toBe('RADIUS');
  });
  it('neznámé hodnoty nic nemění', () => {
    const p = _defaultCamParams();
    syncParamsFromCad(p, {});
    expect(p.machineStructure).toBe('lathe');
    expect(p.mode).toBe('DIAMON');
  });
});
