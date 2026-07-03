/**
 * Synthesizes placeholder audio (16-bit PCM WAV, mono 22050 Hz) for any sound
 * the downloaded packs don't cover. Never overwrites existing files; every
 * generated file must be listed as TODO in CREDITS.md.
 *
 * Run: npx tsx tools/make-audio-placeholders.ts
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
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const seconds = (s: number) => new Float32Array(Math.floor(SR * s));

// deterministic noise
let seed = 12345;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff - 0.5;
};

function chop(): Float32Array {
  const s = seconds(0.16);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 40);
    s[i] = (rnd() * 0.8 + Math.sin(2 * Math.PI * 90 * t) * 0.5) * env * 0.8;
  }
  return s;
}

function harvest(): Float32Array {
  const s = seconds(0.14);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const f = 400 + 500 * (t / 0.14);
    s[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 18) * 0.5;
  }
  return s;
}

function craft(): Float32Array {
  const s = seconds(0.35);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const n1 = t < 0.18 ? Math.sin(2 * Math.PI * 660 * t) * Math.exp(-t * 10) : 0;
    const t2 = t - 0.12;
    const n2 = t2 > 0 ? Math.sin(2 * Math.PI * 880 * t2) * Math.exp(-t2 * 8) : 0;
    s[i] = (n1 + n2) * 0.35;
  }
  return s;
}

function place(): Float32Array {
  const s = seconds(0.22);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] = (Math.sin(2 * Math.PI * 110 * t) * 0.8 + rnd() * 0.15) * Math.exp(-t * 22) * 0.9;
  }
  return s;
}

function blip(): Float32Array {
  const s = seconds(0.07);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] = Math.sin(2 * Math.PI * 1250 * t) * Math.exp(-t * 45) * 0.4;
  }
  return s;
}

/** 16 s loopable ambient bed: filtered noise "canopy hiss" + crickets + birds */
function ambient(): Float32Array {
  const s = seconds(16);
  let lp = 0;
  for (let i = 0; i < s.length; i++) {
    lp += (rnd() * 0.5 - lp) * 0.04; // low-passed noise
    s[i] = lp * 0.55;
  }
  // cricket pulses (periodic so the loop seam is invisible)
  for (let c = 0; c < 64; c++) {
    const start = Math.floor((c / 64) * s.length);
    for (let i = 0; i < SR * 0.05; i++) {
      const t = i / SR;
      const v = Math.sin(2 * Math.PI * 4200 * t) * Math.exp(-t * 60) * 0.05;
      if (start + i < s.length) s[start + i] += v;
    }
  }
  // bird chirps away from the seam
  const chirpAt = [2.1, 4.8, 7.3, 9.9, 12.4, 14.2];
  for (const at of chirpAt) {
    const start = Math.floor(at * SR);
    const dir = at % 2 < 1 ? 1 : -1;
    for (let i = 0; i < SR * 0.18; i++) {
      const t = i / SR;
      const f = 1800 + dir * 600 * Math.sin(t * 30);
      const v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 9) * 0.09;
      if (start + i < s.length) s[start + i] += v;
    }
  }
  return s;
}

const outDir = path.resolve(import.meta.dirname, '../public/assets/audio');
fs.mkdirSync(outDir, { recursive: true });
const sounds: Record<string, () => Float32Array> = {
  'chop.wav': chop,
  'harvest.wav': harvest,
  'craft.wav': craft,
  'place.wav': place,
  'blip.wav': blip,
  'jungle-ambient.wav': ambient,
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
console.log(made.length ? `Audio placeholders (add as TODO to CREDITS.md): ${made.join(', ')}` : 'No audio gaps.');
