// Composição dos vídeos da SÉRIE 4: cartão de gancho + cenas emolduradas +
// cartão de fecho, concatenados num 1080×1920 h264/30fps SEM áudio (o áudio do
// feed é o trending audio, escolhido no app do IG na hora de publicar).
//
// É a receita do brand-reels (SPEED=1.25 · WIN=28,640,1024×576 · BG=0x11070a)
// com dois acréscimos: os cartões (PNG parado virando clipe) e o concat.
//
//   node marketing/video-tools/compose-serie4.mjs v1
//
// Entrada:  <KIT>/video/serie4/raw/<cena>.webm  +  <KIT>/video/serie4/<frame>.png
// Saída:    <KIT>/video/serie4/s4-v1-loja-de-acordos.mp4 (+ capa .png)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(process.env.KIT || join(HERE, '..', 'affiliacore'));
const DIR = join(KIT, 'video', 'serie4');
const RAW = join(DIR, 'raw');

const BG = process.env.BG || '0x11070a';   // stop mais escuro do gradiente da marca
const SPEED = Number(process.env.SPEED || 1.25);
const CARD_SECONDS = Number(process.env.CARD_SECONDS || 2.6);

// Cada vídeo da série: os cartões e a ordem das cenas.
const VIDEOS = {
  v1: {
    out: 's4-v1-loja-de-acordos',
    parts: [
      { card: 's4-v1-hook.png' },
      { clip: 'v1-parcerias.webm', frame: 's4-v1-1.png', zoom: '1080:608:190:96' },
      { clip: 'v1-acordos.webm', frame: 's4-v1-2.png', zoom: '1080:608:190:96' },
      { clip: 'v1-meuslinks.webm', frame: 's4-v1-3.png', zoom: '1080:608:190:96' },
      { card: 's4-v1-cta.png', seconds: 3.6 },
    ],
  },
};

const key = process.argv[2] || 'v1';
const spec = VIDEOS[key];
if (!spec) { console.error(`vídeo desconhecido: ${key} (tem: ${Object.keys(VIDEOS).join(', ')})`); process.exit(1); }

const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' });
const tmp = mkdtempSync(join(tmpdir(), 'serie4-'));

const segs = spec.parts.map((part, i) => {
  const seg = join(tmp, `seg-${i}.mp4`);
  if (part.card) {
    // cartão: PNG parado vira clipe de CARD_SECONDS
    ff(['-loop', '1', '-i', join(DIR, part.card), '-t', String(part.seconds ?? CARD_SECONDS),
      '-vf', 'scale=1080:1920,setsar=1,fps=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-r', '30', seg]);
  } else {
    // cena: screencast por baixo, moldura por cima
    // `zoom` recorta a captura ANTES do scale: a 1280×720 inteira, reduzida à
    // janela de 1024×576, deixa o texto do painel pequeno demais no celular.
    // Recortar o miolo (sem a sidebar) é o que torna os cartões legíveis no feed.
    const pre = part.zoom ? `crop=${part.zoom},` : '';
    ff(['-i', join(RAW, part.clip), '-i', join(DIR, part.frame), '-filter_complex',
      `color=c=${BG}:s=1080x1920:r=30[bg];` +
      `[0:v]setpts=PTS/${SPEED},fps=30,${pre}scale=1024:576:force_original_aspect_ratio=increase,crop=1024:576,setsar=1[clip];` +
      `[bg][clip]overlay=28:640:shortest=1[base];[base][1:v]overlay=0:0[v]`,
      '-map', '[v]', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-r', '30', seg]);
  }
  console.log(`seg ${i} ok (${part.card || part.clip})`);
  return seg;
});

const list = join(tmp, 'list.txt');
writeFileSync(list, segs.map((s) => `file '${s.replace(/\\/g, '/')}'`).join('\n'));
const out = join(DIR, `${spec.out}.mp4`);
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]);
// capa = 1º frame (o cartão de gancho)
ff(['-i', out, '-frames:v', '1', '-q:v', '2', join(DIR, `${spec.out}-capa.png`)]);
rmSync(tmp, { recursive: true, force: true });

const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim();
console.log(`OK → ${out} (${Number(dur).toFixed(1)}s)`);
