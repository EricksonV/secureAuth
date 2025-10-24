// src/storage/file.adapter.ts
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');

export async function ensureData(): Promise<void> {
  await fsp.mkdir(DATA_DIR, { recursive: true });
}

/** Devuelve la ruta absoluta dentro de /data */
export function dataPath(rel: string): string {
  return path.join(DATA_DIR, rel);
}

/** Crea el archivo si no existe (vacío) */
export async function touchFile(absPath: string): Promise<void> {
  try {
    await fsp.access(absPath, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(absPath, '', 'utf8');
  }
}

/** Lee todas las líneas no vacías (sin saltos finales) */
export async function readLines(absPath: string): Promise<string[]> {
  await ensureData();
  await touchFile(absPath);
  const raw = await fsp.readFile(absPath, 'utf8');
  return raw.split('\n').filter(Boolean);
}

/** Sobrescribe el archivo con las líneas provistas y un \n final por línea */
export async function writeLines(absPath: string, lines: string[]): Promise<void> {
  await ensureData();
  await touchFile(absPath);
  const payload = lines.length ? lines.map(l => l.trimEnd() + '\n').join('') : '';
  await fsp.writeFile(absPath, payload, 'utf8');
}

/** Append atómico de UNA línea (se asegura \n al final) */
export async function appendLine(absPath: string, line: string): Promise<void> {
  await ensureData();
  await touchFile(absPath);
  await fsp.appendFile(absPath, line.trimEnd() + '\n', 'utf8');
}

/** Parse seguro de JSON; retorna null si falla */
export function safeJson<T = any>(line: string): T | null {
  try {
    return JSON.parse(line) as T;
  } catch {
    return null;
  }
}
