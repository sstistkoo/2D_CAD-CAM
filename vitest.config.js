import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // CAM testy pouští CELÝ pipeline nad .camprog fixtures — jeden běh trvá
    // jednotky až desítky sekund a při plné sadě (soubory běží paralelně) se
    // ještě natáhne. S výchozím limitem 5 s pak testy padaly PODLE VYTÍŽENÍ
    // STROJE, ne podle kódu: izolovaně prošly, v sadě ne. Přesně tak vypadala
    // „historická nestabilita" boolean-roughing-wiring (padal na 6,4 s).
    // Části testů se to obcházelo třetím argumentem `it(..., 120000)`;
    // tímhle to platí globálně a na nový test se nezapomene.
    testTimeout: 120000,
    hookTimeout: 120000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
