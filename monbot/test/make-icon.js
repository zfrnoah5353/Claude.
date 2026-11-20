// Génère l'icône du panel (256x256)
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
const c = createCanvas(256, 256); const x = c.getContext('2d');
const g = x.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, '#7b5cff'); g.addColorStop(1, '#3a7bfd');
x.fillStyle = g; x.beginPath(); x.roundRect(8, 8, 240, 240, 56); x.fill();
x.fillStyle = '#fff'; x.beginPath(); x.moveTo(146, 34); x.lineTo(74, 142); x.lineTo(122, 142); x.lineTo(104, 222); x.lineTo(184, 106); x.lineTo(134, 106); x.closePath(); x.fill();
writeFileSync(process.argv[2], await c.encode('png'));
console.log('icône OK');
