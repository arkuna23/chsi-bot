import fs from 'node:fs';
import path from 'node:path';

export function ensureParentDirectory(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function readTextFile(filePath: string): string | null {
  if (!fileExists(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, 'utf8');
}

export function writeJsonFile(filePath: string, value: unknown): void {
  ensureParentDirectory(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function readJsonFile<T>(filePath: string): T | null {
  const raw = readTextFile(filePath);
  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as T;
}
