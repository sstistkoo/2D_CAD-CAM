// Debug: generate internal gear profile and check for issues
import { writeFileSync } from 'fs';

const inv = phi => Math.tan(phi) - phi;
const invAt = (rb, r) => r <= rb ? 0 : (p => Math.tan(p) - p)(Math.acos(rb / r));

const m = 3, z = 20, alpha = 20, x = 0;
const aRad = alpha * Math.PI / 180;
const rp = (m * z) / 2, rb = rp * Math.cos(aRad);
const ra = rp - m * (1 + x), rf = rp + m * (1.25 - x);
const angularPitch = (2 * Math.PI) / z;
const halfThickAngle = (Math.PI + 4 * x * Math.tan(aRad)) / (2 * z);
const invAlpha = inv(aRad);

console.log(`Internal gear: rp=${rp} rb=${rb.toFixed(2)} ra=${ra} rf=${rf}`);
console.log(`angPitch=${(angularPitch * 180 / Math.PI).toFixed(2)}deg halfThick=${(halfThickAngle * 180 / Math.PI).toFixed(2)}deg`);

const verts = [];
const steps = 5;

for (let space = 0; space < z; space++) {
  const tc = space * angularPitch;
  const rightBase = tc - halfThickAngle - invAlpha;
  const leftBase = tc + halfThickAngle + invAlpha;

  // Right flank rf->ra
  for (let i = 0; i <= steps; i++) {
    const r = rf - (rf - ra) * (i / steps);
    const ia = invAt(rb, r);
    const a = rightBase + ia;
    verts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  // Bottom
  verts.push({ x: ra * Math.cos(tc), y: ra * Math.sin(tc) });
  // Left flank ra->rf
  for (let i = 0; i <= steps; i++) {
    const r = ra + (rf - ra) * (i / steps);
    const ia = invAt(rb, r);
    const a = leftBase - ia;
    verts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  // Body mid
  const bodyMid = tc + angularPitch / 2;
  verts.push({ x: rf * Math.cos(bodyMid), y: rf * Math.sin(bodyMid) });
}

// Check backward angle steps
let crossings = 0;
for (let i = 1; i < verts.length; i++) {
  const a0 = Math.atan2(verts[i - 1].y, verts[i - 1].x);
  const a1 = Math.atan2(verts[i].y, verts[i].x);
  let da = a1 - a0;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  if (da < -0.02) {
    if (crossings < 10) console.log(`BACKWARD at #${i}: ${(a0 * 180 / Math.PI).toFixed(2)}° -> ${(a1 * 180 / Math.PI).toFixed(2)}° (da=${(da * 180 / Math.PI).toFixed(2)}°)`);
    crossings++;
  }
}
console.log(`Total backward steps: ${crossings} out of ${verts.length}`);

// Print first 2 spaces worth of vertices
console.log('\nFirst 2 spaces:');
for (let i = 0; i < Math.min(28, verts.length); i++) {
  const r = Math.sqrt(verts[i].x ** 2 + verts[i].y ** 2);
  const a = Math.atan2(verts[i].y, verts[i].x) * 180 / Math.PI;
  console.log(`  #${i.toString().padStart(2)}: r=${r.toFixed(2)} a=${a.toFixed(2)}°  (${verts[i].x.toFixed(2)}, ${verts[i].y.toFixed(2)})`);
}

// Generate SVG
const points = verts.map(v => `${v.x.toFixed(2)},${v.y.toFixed(2)}`).join(' ');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="-45 -45 90 90">
  <circle cx="0" cy="0" r="${rp}" fill="none" stroke="gray" stroke-width="0.15" stroke-dasharray="0.5,0.5"/>
  <circle cx="0" cy="0" r="${ra}" fill="none" stroke="blue" stroke-width="0.1"/>
  <circle cx="0" cy="0" r="${rf}" fill="none" stroke="red" stroke-width="0.1"/>
  <polygon points="${points}" fill="none" stroke="lime" stroke-width="0.25"/>
</svg>`;
writeFileSync('internal_gear_test.svg', svg);
console.log('\nSVG saved to internal_gear_test.svg');
