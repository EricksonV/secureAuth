// src/storage/session.repository.ts
import { dataPath, readLines, appendLine, writeLines, safeJson, ensureData, touchFile } from './file.adapter';
import type { Session } from '../domain/session';
import { isActive, parseSession, serializeSession } from '../domain/session';

const SESSIONS_FILE = dataPath('sessions.txt');

async function ensureSessionsFile(): Promise<void> {
  await ensureData();
  await touchFile(SESSIONS_FILE);
}

/** Devuelve todas las sesiones (carga completa). */
export async function listSessions(): Promise<Session[]> {
  await ensureSessionsFile();
  const lines = await readLines(SESSIONS_FILE);
  const out: Session[] = [];
  for (const ln of lines) {
    const s = parseSession(ln);
    if (s) out.push(s);
  }
  return out;
}

export async function getSessionById(id: string): Promise<Session | null> {
  const sessions = await listSessions();
  return sessions.find(s => s.id === id) ?? null;
}

export async function listSessionsByUser(userId: string): Promise<Session[]> {
  const sessions = await listSessions();
  return sessions.filter(s => s.userId === userId);
}

export async function listActiveSessionsByUser(userId: string, at = new Date()): Promise<Session[]> {
  const sessions = await listSessionsByUser(userId);
  return sessions.filter(s => isActive(s, at));
}

/** Inserta una sesión nueva (append). */
export async function appendSession(session: Session): Promise<void> {
  await ensureSessionsFile();
  await appendLine(SESSIONS_FILE, serializeSession(session));
}

/**
 * Actualiza una sesión por id: reescribe el archivo.
 * Estrategia simple (carga todo, sustituye 1 y escribe).
 */
export async function updateSession(updated: Session): Promise<void> {
  const sessions = await listSessions();
  let found = false;
  const newLines = sessions.map(s => {
    if (s.id === updated.id) {
      found = true;
      return serializeSession(updated);
    }
    return serializeSession(s);
  });
  if (!found) throw new Error('SESSION_NOT_FOUND');
  await writeLines(SESSIONS_FILE, newLines);
}
