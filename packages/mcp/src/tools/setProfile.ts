/**
 * set_profile Tool
 *
 * Stores the user's PII profile in the session. The profile is used for:
 * - PII detection (matching names/addresses in document text)
 * - PDF form generation (filling in name, SSN, address at the final step)
 *
 * If auto-extraction already captured the PII from scanned documents,
 * calling set_profile is optional. When called, user-provided values
 * take precedence over auto-extracted values (merge semantics).
 *
 * Returns a confirmation WITHOUT SSN/address — only first name + filing status.
 * PII NEVER leaves the session.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Session, SessionProfile } from '../session.js';
import { setProfile } from '../session.js';
import type { FilingStatus } from '@selftax/core';
import type { ExtractedProfile } from '../piiProfileExtractor.js';

export interface SetProfileInput {
  firstName: string;
  lastName: string;
  ssn: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  filingStatus: string;
  stateOfResidence: string;
  dependents?: Array<{
    firstName: string;
    lastName: string;
    ssn: string;
    relationship: string;
  }>;
}

/**
 * Apply an auto-extracted profile to the session.
 * Does NOT overwrite an existing session profile — only fills in
 * a new one if none exists, or merges missing fields.
 */
export function applyExtractedProfileToSession(
  session: Session,
  extracted: ExtractedProfile,
): void {
  if (!session.profile) {
    // No profile yet — build one from extracted data
    const pf = extracted.primaryFiler;
    session.profile = {
      firstName: pf.firstName ?? '',
      lastName: pf.lastName ?? '',
      ssn: pf.ssn ?? '',
      address: pf.address ?? { street: '', city: '', state: '', zip: '' },
      filingStatus: extracted.filingStatus ?? 'single',
      stateOfResidence: extracted.stateOfResidence ?? '',
      dependents: (extracted.dependents ?? []).map((d) => ({
        firstName: d.firstName ?? '',
        lastName: d.lastName ?? '',
        ssn: d.ssn ?? '',
        relationship: d.relationship ?? '',
      })),
    };
    return;
  }

  // Profile exists — fill in blank fields from extracted data
  const pf = extracted.primaryFiler;
  if (!session.profile.firstName && pf.firstName) {
    session.profile.firstName = pf.firstName;
  }
  if (!session.profile.lastName && pf.lastName) {
    session.profile.lastName = pf.lastName;
  }
  if (!session.profile.ssn && pf.ssn) {
    session.profile.ssn = pf.ssn;
  }
  if (!session.profile.address.street && pf.address?.street) {
    session.profile.address = pf.address;
  }
  if (!session.profile.stateOfResidence && extracted.stateOfResidence) {
    session.profile.stateOfResidence = extracted.stateOfResidence;
  }
}

export function handleSetProfile(
  session: Session,
  input: SetProfileInput,
): CallToolResult {
  const profile: SessionProfile = {
    firstName: input.firstName,
    lastName: input.lastName,
    ssn: input.ssn,
    address: {
      street: input.street,
      city: input.city,
      state: input.state,
      zip: input.zip,
    },
    filingStatus: input.filingStatus as FilingStatus,
    stateOfResidence: input.stateOfResidence,
    dependents: input.dependents ?? [],
  };

  // Merge: user-provided values take precedence.
  // If session already has auto-extracted data, this overwrites it entirely
  // since the LLM is explicitly providing all fields.
  setProfile(session, profile);

  // Return confirmation WITHOUT PII — only first name + filing status
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          message: `Profile saved for ${input.firstName}. Filing status: ${input.filingStatus}. State: ${input.stateOfResidence}. Dependents: ${(input.dependents ?? []).length}.`,
        }),
      },
    ],
  };
}
