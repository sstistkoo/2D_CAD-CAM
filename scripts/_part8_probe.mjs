import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from '../tests/helpers/camHeadless.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const fx = join(__dirname, '..', 'tests', 'fixtures', 'cam', 'part-8.camprog');

async function run(flag){
  const prog = JSON.parse(readFileSync(fx,'utf8'));
  prog.params.booleanRoughing = flag;
  const r = await runCamProg(prog);
  return r.calc;
}
const dump = (calc,label)=>{
  const longs=(calc.passes||[]).filter(p=>p.type==='long');
  console.log(`\n=== ${label}: ${longs.length} long passes ===`);
  longs.forEach((p,i)=>{
    const deg = Math.abs(p.zStart-p.zEnd)<1e-3;
    console.log(`${String(i).padStart(2)} ${deg?'DEGEN':'     '} x=${(+p.x).toFixed(3)} zS=${(+p.zStart).toFixed(3)} zE=${(+p.zEnd).toFixed(3)}`
      +` ${p.blocked?'blocked ':''}${p.pocketClean?'pocketClean ':''}${p.pocketEntry?'pocketEntry ':''}${p.contourLeadIn?`LeadIn(${p.contourLeadIn.length}) `:''}${p.ramp?'ramp ':''}`);
  });
};
const cScan = await run(false);
const cBool = await run(true);
dump(cScan,'SCAN');
dump(cBool,'BOOL');
