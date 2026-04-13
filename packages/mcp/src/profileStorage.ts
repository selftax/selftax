/**
 * Profile Storage — Local File Persistence
 *
 * Saves and loads the extracted PII profile to/from a JSON file
 * on the user's machine. The file (.selftax-profile.json) contains
 * REAL PII and must NEVER be returned to the LLM or committed to git.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExtractedProfile } from './piiProfileExtractor.js';

const PROFILE_FILENAME = '.selftax-profile.json';

/** Save the extracted profile to a JSON file in the given folder */
export async function saveProfileToFile(
  folderPath: string,
  profile: ExtractedProfile,
): Promise<void> {
  const filePath = join(folderPath, PROFILE_FILENAME);
  const json = JSON.stringify(profile, null, 2);
  await writeFile(filePath, json, 'utf-8');
}

/** Load a previously saved profile from the given folder. Returns null if not found. */
export async function loadProfileFromFile(
  folderPath: string,
): Promise<ExtractedProfile | null> {
  const filePath = join(folderPath, PROFILE_FILENAME);
  try {
    const json = await readFile(filePath, 'utf-8');
    return JSON.parse(json) as ExtractedProfile;
  } catch {
    return null;
  }
}
