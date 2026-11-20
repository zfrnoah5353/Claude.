// Images générées : carte de bienvenue, carte de rang, captcha.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';

async function safeLoad(url) { try { return url ? await loadImage(url) : null; } catch { return null; } }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function shade(hex, amt) {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0x5865F2;
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
async function avatarCircle(ctx, url, x, y, r, ring = '#fff') {
  const img = await safeLoad(url);
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r + 6, 0, Math.PI * 2); ctx.fillStyle = ring; ctx.fill(); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  if (img) ctx.drawImage(img, x - r, y - r, r * 2, r * 2); else { ctx.fillStyle = '#444'; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
  ctx.restore();
}
function fitText(ctx, text, max, size, weight = 'bold') {
  do { ctx.font = `${weight} ${size}px sans-serif`; size -= 2; } while (ctx.measureText(text).width > max && size > 10);
}

export async function welcomeCard(member, { title = 'BIENVENUE', bg = '', color = '#5865F2' } = {}) {
  const W = 1024, H = 450; const cv = createCanvas(W, H); const ctx = cv.getContext('2d');
  const img = await safeLoad(bg);
  if (img) { const s = Math.max(W / img.width, H / img.height); ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H); }
  else { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, shade(color, 30)); g.addColorStop(1, shade(color, -90)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  await avatarCircle(ctx, member.user.displayAvatarURL({ extension: 'png', size: 256 }), W / 2, 150, 100);
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 8;
  fitText(ctx, title, W - 80, 64); ctx.fillText(title, W / 2, 320);
  fitText(ctx, member.user.username, W - 80, 44, '600'); ctx.fillText(member.user.username, W / 2, 375);
  ctx.font = '28px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(`Membre n°${member.guild.memberCount}`, W / 2, 418);
  return new AttachmentBuilder(await cv.encode('png'), { name: 'bienvenue.png' });
}

export async function rankCard(user, { level, xp, need, rank, color = '#5865F2' }) {
  const W = 934, H = 282; const cv = createCanvas(W, H); const ctx = cv.getContext('2d');
  ctx.fillStyle = '#1e1f22'; roundRect(ctx, 0, 0, W, H, 24); ctx.fill();
  ctx.fillStyle = '#2b2d31'; roundRect(ctx, 20, 20, W - 40, H - 40, 18); ctx.fill();
  await avatarCircle(ctx, user.displayAvatarURL({ extension: 'png', size: 256 }), 140, H / 2, 85, color);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; fitText(ctx, user.username, 380, 42); ctx.fillText(user.username, 260, 125);
  ctx.textAlign = 'right'; ctx.font = 'bold 30px sans-serif'; ctx.fillStyle = color;
  ctx.fillText(`RANG #${rank}   NIVEAU ${level}`, W - 50, 70);
  ctx.fillStyle = '#b5bac1'; ctx.font = '26px sans-serif'; ctx.fillText(`${xp.toLocaleString('fr-FR')} / ${need.toLocaleString('fr-FR')} XP`, W - 50, 125);
  const bx = 260, by = 160, bw = W - 310, bh = 40;
  ctx.fillStyle = '#4e5058'; roundRect(ctx, bx, by, bw, bh, 20); ctx.fill();
  ctx.fillStyle = color; roundRect(ctx, bx, by, Math.max(bh, bw * Math.min(1, xp / need)), bh, 20); ctx.fill();
  return new AttachmentBuilder(await cv.encode('png'), { name: 'rang.png' });
}

export async function captchaImage(code) {
  const W = 360, H = 130; const cv = createCanvas(W, H); const ctx = cv.getContext('2d');
  ctx.fillStyle = '#23272a'; ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 8; k++) { ctx.strokeStyle = `hsla(${Math.random() * 360},70%,60%,.6)`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(Math.random() * W, Math.random() * H); ctx.bezierCurveTo(Math.random() * W, Math.random() * H, Math.random() * W, Math.random() * H, Math.random() * W, Math.random() * H); ctx.stroke(); }
  ctx.font = 'bold 58px sans-serif'; ctx.textBaseline = 'middle';
  [...code].forEach((ch, idx) => { ctx.save(); ctx.translate(40 + idx * 52, H / 2 + (Math.random() * 20 - 10)); ctx.rotate((Math.random() - 0.5) * 0.6); ctx.fillStyle = `hsl(${Math.random() * 360},80%,70%)`; ctx.fillText(ch, 0, 0); ctx.restore(); });
  return new AttachmentBuilder(await cv.encode('png'), { name: 'captcha.png' });
}
