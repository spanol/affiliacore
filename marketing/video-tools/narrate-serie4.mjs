// Versão NARRADA de um vídeo da série 4 (a do onboarding/WhatsApp; a do feed sai
// muda, porque no Instagram quem entrega alcance é o trending audio escolhido no
// app). Monta a trilha de voz a partir de linhas datadas e casa com o vídeo.
//
// 1) Escreva as falas em <kit>/video/serie4/narracao/<v>-narracao.txt, uma por
//    linha, no formato `segundo|texto` (o segundo é onde a fala COMEÇA).
// 2) Gere os WAVs (voz do Windows, pt-BR) — é o rascunho, dá para trocar por uma
//    locução humana mantendo os nomes dos arquivos:
//
//    powershell -c "Add-Type -AssemblyName System.Speech; $d='<pasta narracao>'; \
//      $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; \
//      $s.SelectVoice('Microsoft Maria Desktop'); $i=0; \
//      foreach($l in (Get-Content $d\v1-narracao.txt -Encoding UTF8)){ if(-not $l.Trim()){continue}; \
//      $i++; $p=$l -split '\|',2; $s.SetOutputToWaveFile((Join-Path $d \"linha-$i.wav\")); $s.Speak($p[1]) }; \
//      $s.SetOutputToNull(); $s.Dispose()"
//
// 3) node marketing/video-tools/narrate-serie4.mjs v1
//
// Cada fala é encaixada na SUA janela (até o começo da fala seguinte) com atempo:
// a voz sintética fala mais devagar que a leitura calibrada, e sem isso a
// narração atropela a cena seguinte. O fator é limitado — se estourar o teto, o
// script AVISA e a fala é para encurtar no texto, não para espremer mais.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(process.env.KIT || join(HERE, '..', 'affiliacore'));
const DIR = join(KIT, 'video', 'serie4');
const NAR = join(DIR, 'narracao');

const VIDEOS = { v1: 's4-v1-loja-de-acordos' };
const key = process.argv[2] || 'v1';
const base = VIDEOS[key];
if (!base) { console.error(`vídeo desconhecido: ${key}`); process.exit(1); }

const video = join(DIR, `${base}.mp4`);
const txt = join(NAR, `${key}-narracao.txt`);
if (!existsSync(video)) { console.error(`falta o vídeo: ${video}`); process.exit(1); }

const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const total = probe(video);

const lines = readFileSync(txt, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  const [at, text] = l.split('|');
  return { at: Number(at), text };
});

const MAX_TEMPO = 1.35;
const inputs = [], filters = [], labels = [];
lines.forEach((line, i) => {
  const wav = join(NAR, `linha-${i + 1}.wav`);
  if (!existsSync(wav)) { console.error(`falta o WAV da fala ${i + 1} (${wav}) — gere com o comando do cabeçalho.`); process.exit(1); }
  const slot = (lines[i + 1] ? lines[i + 1].at : total) - line.at;
  const dur = probe(wav);
  let tempo = Math.max(1, dur / slot);
  if (tempo > MAX_TEMPO) {
    console.warn(`fala ${i + 1}: ${dur.toFixed(1)}s numa janela de ${slot.toFixed(1)}s — encurte o texto (tempo travado em ${MAX_TEMPO}).`);
    tempo = MAX_TEMPO;
  }
  inputs.push('-i', wav);
  filters.push(`[${i + 1}:a]atempo=${tempo.toFixed(3)},adelay=${Math.round(line.at * 1000)}|${Math.round(line.at * 1000)}[a${i}]`);
  labels.push(`[a${i}]`);
  console.log(`fala ${i + 1}: ${dur.toFixed(1)}s → janela ${slot.toFixed(1)}s (atempo ${tempo.toFixed(2)})`);
});

const out = join(DIR, `${base}-narrado.mp4`);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', video, ...inputs, '-filter_complex',
  `${filters.join(';')};${labels.join('')}amix=inputs=${labels.length}:normalize=0,volume=2.0,aresample=48000[a]`,
  '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });

console.log(`OK → ${out} (${probe(out).toFixed(1)}s)`);
