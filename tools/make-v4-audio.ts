/**
 * Synthesizes the v4 placeholder audio — 16-bit PCM WAV, mono 22050 Hz, same
 * pipeline as make-v2-audio.ts. Never overwrites existing files, so downloaded
 * CC0 replacements always win. Every file generated here is listed as TODO in
 * CREDITS.md.
 *
 * Run: npx tsx tools/make-v4-audio.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const SR = 22050;

function wav(samples: Float32Array): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const seconds = (s: number) => new Float32Array(Math.floor(SR * s));

let seed = 917531;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff - 0.5;
};

/**
 * Pick striking stone: a sharp broadband CRACK transient over a gravelly noise
 * crunch and a fast low knock — noise-dominated so it reads as pickaxe-on-rock,
 * not a tonal "bottle tap". No sustained sine partials (those rang like glass).
 */
function pick(): Float32Array {
  const s = seconds(0.18);
  let lp = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    // sharp broadband crack (white noise, ultra-fast decay) — the strike itself
    const crack = rnd() * Math.exp(-t * 120) * 0.9;
    // gravelly crunch: noise through a gentle lowpass, medium decay (chips/dust)
    lp += (rnd() - lp) * 0.6;
    const crunch = lp * Math.exp(-t * 55) * 0.6;
    // low impact knock — decays fast so it thumps, never rings
    const knock = Math.sin(2 * Math.PI * 118 * t) * Math.exp(-t * 72) * 0.5;
    s[i] = (crack + crunch + knock) * 0.9;
  }
  return s;
}

const outDir = path.resolve(import.meta.dirname, '../public/assets/audio');
fs.mkdirSync(outDir, { recursive: true });
const sounds: Record<string, () => Float32Array> = {
  'pick.wav': pick,
};
const made: string[] = [];
for (const [file, gen] of Object.entries(sounds)) {
  const target = path.join(outDir, file);
  const oggTwin = target.replace(/\.wav$/, '.ogg');
  const mp3Twin = target.replace(/\.wav$/, '.mp3');
  if (fs.existsSync(target) || fs.existsSync(oggTwin) || fs.existsSync(mp3Twin)) continue;
  fs.writeFileSync(target, wav(gen()));
  made.push(file);
}
console.log(made.length ? `v4 audio placeholders (listed as TODO in CREDITS.md): ${made.join(', ')}` : 'No v4 audio gaps.');
