// Comprehensive intersection check for internal gear & sprocket
import { writeFileSync } from 'fs';

const inv = phi => Math.tan(phi) - phi;
const invAt = (rb, r) => r <= rb ? 0 : (p => Math.tan(p) - p)(Math.acos(rb / r));

// Check if two line segments (p1-p2) and (p3-p4) intersect
function segmentsIntersect(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-12) return false;
  const dx = p3.x - p1.x, dy = p3.y - p1.y;
  const t = (dx * d2y - dy * d2x) / cross;
  const u = (dx * d1y - dy * d1x) / cross;
  return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
}

function checkCrossings(name, verts) {
  const n = verts.length;
  let crossCount = 0;
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    for (let j = i + 2; j < n; j++) {
      if (j === i || (j + 1) % n === i) continue;
      const j2 = (j + 1) % n;
      if (segmentsIntersect(verts[i], verts[i2], verts[j], verts[j2])) {
        crossCount++;
        if (crossCount <= 5) {
          console.log(`  CROSS: seg ${i}-${i2} × seg ${j}-${j2}`);
        }
      }
    }
  }
  console.log(`${name}: ${crossCount} segment crossings in ${n} vertices`);
  return crossCount;
}

function genInternal(m, z, alpha, x, steps) {
  const aRad = alpha * Math.PI / 180;
  const rp = m*z/2, rb = rp*Math.cos(aRad);
  const ra = rp - m*(1+x), rf = rp + m*(1.25-x);
  const ap = 2*Math.PI/z;
  const hta = (Math.PI + 4*x*Math.tan(aRad))/(2*z);
  const invA = inv(aRad);
  const verts = [];
  for (let s = 0; s < z; s++) {
    const tc = s*ap;
    const rB = tc - hta - invA, lB = tc + hta + invA;
    for (let i = 0; i <= steps; i++) {
      const r = rf - (rf-ra)*(i/steps);
      verts.push({x:r*Math.cos(rB+invAt(rb,r)), y:r*Math.sin(rB+invAt(rb,r))});
    }
    verts.push({x:ra*Math.cos(tc), y:ra*Math.sin(tc)});
    for (let i = 0; i <= steps; i++) {
      const r = ra + (rf-ra)*(i/steps);
      verts.push({x:r*Math.cos(lB-invAt(rb,r)), y:r*Math.sin(lB-invAt(rb,r))});
    }
    verts.push({x:rf*Math.cos(tc+ap/2), y:rf*Math.sin(tc+ap/2)});
  }
  return verts;
}

console.log('=== Segment crossing check ===');
const v20 = genInternal(3, 20, 20, 0, 10);
checkCrossings('Internal m=3 z=20 steps=10', v20);

const v40 = genInternal(3, 40, 20, 0, 10);
checkCrossings('Internal m=3 z=40 steps=10', v40);

const v12 = genInternal(5, 12, 20, 0, 10);
checkCrossings('Internal m=5 z=12 steps=10', v12);

// Generate HTML visualization
function toSVG(name, verts, viewBox) {
  const pts = verts.map(v => `${v.x.toFixed(3)},${v.y.toFixed(3)}`).join(' ');
  return `<div style="display:inline-block;text-align:center;margin:10px">
    <div style="color:#cdd6f4;font-size:13px;margin-bottom:4px">${name} (${verts.length}v)</div>
    <svg width="350" height="350" viewBox="${viewBox}" style="background:#181825;border:1px solid #45475a">
      <polygon points="${pts}" fill="none" stroke="#a6e3a1" stroke-width="0.3"/>
    </svg></div>`;
}

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Gear Profiles</title></head>
<body style="background:#1e1e2e;font-family:sans-serif;display:flex;flex-wrap:wrap;padding:10px">
${toSVG('Internal m=3 z=20', v20, '-40 -40 80 80')}
${toSVG('Internal m=3 z=40', v40, '-70 -70 140 140')}
${toSVG('Internal m=5 z=12', v12, '-50 -50 100 100')}
</body></html>`;
writeFileSync('gear_profiles.html', html);
console.log('\nHTML saved to gear_profiles.html');
