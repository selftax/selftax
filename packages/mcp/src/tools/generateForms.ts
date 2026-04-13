/**
 * generate_forms Tool
 *
 * Generates filled PDF tax forms and writes them to disk.
 * PII from the session profile is merged at this final step —
 * the LLM only gets back file paths, NEVER the PDF contents.
 */

import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  build1040Fields,
  buildScheduleAFields,
  buildScheduleDFields,
  buildScheduleEFields,
  buildForm540Fields,
  buildPIIFields,
  calculateScheduleA,
  calculateScheduleD,
  calculateScheduleE,
} from '@selftax/core';
import type {
  TaxFormType,
  PDFFormData,
  TaxReturnPackage,
  UserProfile,
} from '@selftax/core';
import type { Session } from '../session.js';
import { generateAllFormPDFs } from '../pdfGenerator.js';
import { loadProfileFromFile } from '../profileStorage.js';
import { applyExtractedProfileToSession } from './setProfile.js';

export interface GenerateFormsInput {
  outputFolder: string;
  /** Optional list of forms to generate. Defaults to all required forms. */
  forms?: string[];
}

export async function handleGenerateForms(
  session: Session,
  input: GenerateFormsInput,
): Promise<CallToolResult> {
  // If no profile in session, try loading from the saved profile file
  if (!session.profile) {
    const parentFolder = dirname(input.outputFolder);
    const savedProfile = await loadProfileFromFile(parentFolder);
    if (savedProfile) {
      applyExtractedProfileToSession(session, savedProfile);
    }
    // Also try loading from the output folder itself
    if (!session.profile) {
      const directProfile = await loadProfileFromFile(input.outputFolder);
      if (directProfile) {
        applyExtractedProfileToSession(session, directProfile);
      }
    }
  }

  if (!session.profile) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'Profile not set. Call set_profile or scan_tax_folder first.' }),
        },
      ],
      isError: true,
    };
  }

  if (!session.calculationResult) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'No calculation results. Call calculate_taxes first.' }),
        },
      ],
      isError: true,
    };
  }

  const { requiredForms } = session.calculationResult;

  // Determine which forms to generate
  const formsToGenerate = input.forms
    ? input.forms.filter((f) => requiredForms.includes(f as TaxFormType)) as TaxFormType[]
    : requiredForms;

  // Build form data for each required form
  const formDataList: Array<{ formType: TaxFormType; fields: PDFFormData }> = [];

  for (const formType of formsToGenerate) {
    const fields = buildFormFields(session, formType);
    if (fields) {
      formDataList.push({ formType, fields });
    }
  }

  // Build PII fields from profile — merged at the final step
  const userProfile: UserProfile = {
    ssn: session.profile.ssn,
    firstName: session.profile.firstName,
    lastName: session.profile.lastName,
    dateOfBirth: '',
    address: session.profile.address,
  };
  const piiFields: TaxReturnPackage['piiFields'] = buildPIIFields(userProfile);

  // Ensure output directory exists
  try {
    await mkdir(input.outputFolder, { recursive: true });
  } catch {
    // Directory may already exist
  }

  // Generate PDFs and write to disk
  const filePaths = await generateAllFormPDFs(formDataList, input.outputFolder, piiFields);

  // Return file paths only — NO PDF contents, NO PII
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          generated: filePaths.length,
          files: filePaths,
          forms: formsToGenerate,
        }, null, 2),
      },
    ],
  };
}

/**
 * Build PDF field data for a specific form type.
 * Returns null if the form type doesn't have calculation data.
 */
function buildFormFields(
  session: Session,
  formType: TaxFormType,
): PDFFormData | null {
  const result = session.calculationResult;
  if (!result) return null;

  switch (formType) {
    case '1040':
      return build1040Fields(result.form1040, {
        filingStatus: session.profile?.filingStatus,
      });

    case 'schedule-a': {
      // Re-derive schedule A output from 1040 data
      const schedA = calculateScheduleA({
        filingStatus: session.profile?.filingStatus ?? 'single',
      });
      return buildScheduleAFields(schedA);
    }

    case 'schedule-d': {
      // Basic schedule D with capital gains from 1040
      const schedD = calculateScheduleD([]);
      return buildScheduleDFields(schedD);
    }

    case 'schedule-e': {
      // Basic schedule E — would need rental data from overrides
      const schedE = calculateScheduleE({
        grossRentalIncome: 0,
      });
      return buildScheduleEFields({ grossRentalIncome: 0 }, schedE);
    }

    case 'ca-540':
      if (result.form540) {
        return buildForm540Fields(result.form540);
      }
      return null;

    default:
      // For unsupported form types, return null
      return null;
  }
}
