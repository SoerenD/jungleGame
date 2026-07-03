/**
 * Synthesizes the v2 (Guardian) placeholder audio — 16-bit PCM WAV, mono
 * 22050 Hz, same pipeline as make-audio-placeholders.ts. Never overwrites
 * existing files, so downloaded CC0 replacements always win. Every file
 * generated here must be listed as TODO in CREDITS.md.
 *
 * Run: npx tsx tools/make-v2-audio.ts
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

let seed = 424242;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff - 0.5;
};

/** low rumbling roar with a rising snarl — the Guardian wakes / slams */
function roar(): Float32Array {
  const s = seconds(1.4);
  let lp = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const env = Math.min(1, t * 12) * Math.exp(-Math.max(0, t - 0.35) * 3.2);
    const f = 55 + 40 * Math.sin(t * 9) + 25 * t;
    lp += (rnd() - lp) * 0.18; // growl noise
    s[i] = (Math.sin(2 * Math.PI * f * t) * 0.55 + Math.sin(2 * Math.PI * f * 0.5 * t) * 0.35 + lp * 0.6) * env * 0.8;
  }
  return s;
}

/** deep ceremonial gong — the Seal breaks */
function gong(): Float32Array {
  const s = seconds(2.4);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 1.6);
    s[i] =
      (Math.sin(2 * Math.PI * 98 * t) * 0.5 +
        Math.sin(2 * Math.PI * 147.3 * t) * 0.3 +
        Math.sin(2 * Math.PI * 221 * t) * 0.18 +
        Math.sin(2 * Math.PI * 329 * t) * 0.1) *
      env *
      0.8;
  }
  return s;
}

/** small water splash — a catch is landed */
function splash(): Float32Array {
  const s = seconds(0.4);
  let lp = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    lp += (rnd() - lp) * (0.35 + 0.4 * Math.exp(-t * 8));
    const plop = t < 0.06 ? Math.sin(2 * Math.PI * (300 - t * 2200) * t) * 0.5 : 0;
    s[i] = (lp * 0.7 * Math.exp(-t * 9) + plop) * 0.8;
  }
  return s;
}

/** soft munch — eating cooked fish */
function munch(): Float32Array {
  const s = seconds(0.35);
  for (let bite = 0; bite < 2; bite++) {
    const start = Math.floor(bite * 0.16 * SR);
    for (let i = 0; i < SR * 0.09; i++) {
      const t = i / SR;
      const v = rnd() * Math.exp(-t * 55) * 0.5;
      if (start + i < s.length) s[start + i] += v;
    }
  }
  return s;
}

/** 9.6 s loopable war-drum bed — plays while the Guardian is awake */
function drums(): Float32Array {
  const s = seconds(9.6);
  const beat = (at: number, freq: number, vol: number, decay: number) => {
    const start = Math.floor(at * SR);
    for (let i = 0; i < SR * 0.4; i++) {
      const t = i / SR;
      const v = (Math.sin(2 * Math.PI * freq * t) + rnd() * 0.25) * Math.exp(-t * decay) * vol;
      if (start + i < s.length) s[start + i] += v;
    }
  };
  const bar = 1.2; // 8 bars of boom — boom — boom-ba
  for (let b = 0; b < 8; b++) {
    const t0 = b * bar;
    beat(t0, 62, 0.55, 14);
    beat(t0 + 0.45, 58, 0.4, 16);
    beat(t0 + 0.82, 66, 0.45, 15);
    beat(t0 + 1.0, 92, 0.25, 22);
  }
  // low drone underneath, periodic so the loop seam is invisible
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] += Math.sin(2 * Math.PI * 41.2 * t) * 0.09 * (1 + 0.3 * Math.sin((2 * Math.PI * t) / 9.6));
  }
  return s;
}

const outDir = path.resolve(import.meta.dirname, '../public/assets/audio');
fs.mkdirSync(outDir, { recursive: true });
const sounds: Record<string, () => Float32Array> = {
  'roar.wav': roar,
  'seal-gong.wav': gong,
  'splash.wav': splash,
  'munch.wav': munch,
  'guardian-drums.wav': drums,
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
console.log(made.length ? `v2 audio placeholders (listed as TODO in CREDITS.md): ${made.join(', ')}` : 'No v2 audio gaps.');
