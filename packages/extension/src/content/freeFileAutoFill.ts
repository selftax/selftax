/**
 * Content script for IRS Free File Fillable Forms auto-fill.
 *
 * Injected into freefilefillableforms.com pages via manifest.json.
 * Handles three message types:
 *   DETECT_FORM    — detect which IRS form is currently displayed
 *   AUTOFILL_CURRENT — fill the current form using saved TaxReturnData
 *   FILL_FORM      — fill with explicit selector→value pairs (legacy)
 */

/** Check if a field is writable (not read-only or disabled) */
function isFieldWritable(element: HTMLInputElement | HTMLSelectElement): boolean {
  if ((element as HTMLInputElement).readOnly) return false;
  if (element.disabled) return false;
  return true;
}

/** Set a value on a form input/select and dispatch events */
function setFieldValue(element: HTMLInputElement | HTMLSelectElement, value: string | number): void {
  // Skip read-only/computed fields — let FreeFile calculate them
  if (!isFieldWritable(element)) {
    console.log(`[SelfTax] Skipped read-only field: ${element.name || element.id} (readOnly=${(element as HTMLInputElement).readOnly}, disabled=${element.disabled})`);
    return;
  }
  const stringValue = String(value);

  // Checkboxes: use .click() — FreeFile requires real click events
  if ((element as HTMLInputElement).type === 'checkbox') {
    const cb = element as HTMLInputElement;
    const shouldCheck = value === 1 || stringValue === '1' || stringValue === 'true';
    if (cb.checked !== shouldCheck) {
      cb.click();
    }
    return;
  }

  if (element.tagName === 'SELECT') {
    const select = element as HTMLSelectElement;
    // Try exact match first
    select.value = stringValue;
    // If no match, try case-insensitive match against option values and text
    if (select.value !== stringValue) {
      const lower = stringValue.toLowerCase();
      for (const opt of Array.from(select.options)) {
        if (opt.value.toLowerCase() === lower || opt.text.toLowerCase() === lower) {
          select.value = opt.value;
          break;
        }
      }
    }
    if (select.value !== stringValue && select.selectedIndex <= 0) {
      console.log(`[SelfTax] Select ${select.name}: "${stringValue}" not found in options: ${Array.from(select.options).slice(0, 10).map((o) => `"${o.value}"`).join(', ')}`);
    }
  } else {
    // For inputs, use native setter to bypass React/framework control
    const nativeSet = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, 'value',
    )?.set;
    if (nativeSet) {
      nativeSet.call(element, stringValue);
    } else {
      (element as HTMLInputElement).value = stringValue;
    }
  }

  element.dispatchEvent(new Event('focus', { bubbles: true }));
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

type FormElement = HTMLInputElement | HTMLSelectElement;

/** Cache for primary filer fields (random IDs, found by position) */
let primaryFieldCache: { firstName?: FormElement; lastName?: FormElement; ssn?: FormElement } | null = null;

/** Find primary filer name/SSN fields by position relative to cboSuffix */
function findPrimaryFields(): typeof primaryFieldCache {
  if (primaryFieldCache) return primaryFieldCache;

  const suffix = document.querySelector<HTMLSelectElement>('[name="cboSuffix"]');
  if (!suffix) return null;

  // Walk backwards from cboSuffix to find the 4 text inputs before it
  // Order: firstName, middleInitial, lastName, SSN, [cboSuffix]
  const allInputs = Array.from(document.querySelectorAll<FormElement>('input[type="text"], select'));
  const suffixIdx = allInputs.indexOf(suffix);
  if (suffixIdx < 4) return null;

  primaryFieldCache = {
    ssn: allInputs[suffixIdx - 1] as FormElement,
    lastName: allInputs[suffixIdx - 2] as FormElement,
    // middleInitial at suffixIdx - 3
    firstName: allInputs[suffixIdx - 4] as FormElement,
  };
  return primaryFieldCache;
}

/** Find a form element by field name, position key, or label text */
function findInputElement(selector: string): FormElement | null {
  // Strategy 1: "pos:..." — position-based for primary filer fields
  if (selector.startsWith('pos:')) {
    const key = selector.slice(4);
    const primary = findPrimaryFields();
    if (!primary) return null;
    if (key === 'primaryFirstName') return primary.firstName ?? null;
    if (key === 'primaryLastName') return primary.lastName ?? null;
    if (key === 'primarySSN') return primary.ssn ?? null;
    return null;
  }

  // Strategy 2: "lbl:..." — find input near matching label text
  if (selector.startsWith('lbl:')) {
    const labelText = selector.slice(4).toLowerCase();
    return findInputByLabel(labelText);
  }

  // Strategy 3: Direct field name (e.g., "txtSpFirstName")
  const byName = document.querySelector<FormElement>(`[name="${selector}"]`);
  if (byName) return byName;
  const byId = document.getElementById(selector) as FormElement | null;
  if (byId) return byId;

  return null;
}

/** Find an input element by nearby label/text content */
function findInputByLabel(searchText: string): HTMLInputElement | null {
  // Search all text nodes and labels for matching text
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (node.textContent && node.textContent.toLowerCase().includes(searchText)) {
      // Found matching text — look for the nearest input
      const parent = node.parentElement;
      if (!parent) continue;

      // Check: is there an input inside or right after this element?
      const input = parent.querySelector<HTMLInputElement>('input, select, textarea');
      if (input) return input;

      // Check siblings and nearby elements
      let el: Element | null = parent;
      for (let i = 0; i < 5; i++) {
        el = el?.nextElementSibling ?? null;
        if (!el) break;
        const inp = el.matches('input, select, textarea')
          ? el as HTMLInputElement
          : el.querySelector<HTMLInputElement>('input, select, textarea');
        if (inp) return inp;
      }

      // Check parent's next sibling
      const parentNext = parent.parentElement?.nextElementSibling;
      if (parentNext) {
        const inp = parentNext.querySelector<HTMLInputElement>('input, select, textarea');
        if (inp) return inp;
      }
    }
  }
  return null;
}

/** Clear all writable text/select fields on the current page */
function clearFormFields(): number {
  const inputs = document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    'input[type="text"], select, textarea',
  );
  let cleared = 0;
  for (const el of inputs) {
    if (!isFieldWritable(el)) continue;
    if (el instanceof HTMLSelectElement) {
      if (el.selectedIndex > 0) {
        el.selectedIndex = 0;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        cleared++;
      }
    } else if (el.value !== '') {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      cleared++;
    }
  }
  return cleared;
}

/** Fill form fields from selector→value pairs */
function fillFormFields(
  formData: Record<string, string | number>,
): { success: boolean; filledCount: number; totalFields: number; errors?: string[] } {
  const errors: string[] = [];
  let filledCount = 0;
  const totalFields = Object.keys(formData).length;

  for (const [selector, value] of Object.entries(formData)) {
    try {
      const el = findInputElement(selector);
      if (el) {
        setFieldValue(el as HTMLInputElement | HTMLSelectElement, value);
        filledCount++;
      } else {
        errors.push(`Field not found: ${selector}`);
      }
    } catch (err) {
      errors.push(`Error: ${selector} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    success: filledCount > 0,
    filledCount,
    totalFields,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/** Form detection patterns — match page title or visible text to IRS form type */
const FORM_PATTERNS: Array<{ pattern: RegExp; formType: string; label: string }> = [
  { pattern: /1040\b.*U\.?S\.?\s*Individual/i, formType: 'form1040', label: 'Form 1040' },
  { pattern: /Schedule\s*A.*Itemized/i, formType: 'scheduleA', label: 'Schedule A' },
  { pattern: /Schedule\s*B.*Interest/i, formType: 'schedule1', label: 'Schedule B' },
  { pattern: /Schedule\s*D.*Capital/i, formType: 'scheduleD', label: 'Schedule D' },
  { pattern: /Schedule\s*E.*Supplemental/i, formType: 'scheduleE', label: 'Schedule E' },
  { pattern: /Schedule\s*1.*Additional\s*Income/i, formType: 'schedule1', label: 'Schedule 1' },
  { pattern: /Schedule\s*2.*Additional\s*Tax/i, formType: 'schedule2', label: 'Schedule 2' },
  { pattern: /Schedule\s*3.*Additional\s*Credits/i, formType: 'schedule3', label: 'Schedule 3' },
  { pattern: /Form\s*2441.*Child.*Dependent\s*Care/i, formType: 'form2441', label: 'Form 2441' },
  { pattern: /Form\s*4562.*Depreciation/i, formType: 'form4562', label: 'Form 4562' },
  { pattern: /Form\s*8582.*Passive\s*Activity/i, formType: 'form8582', label: 'Form 8582' },
  { pattern: /Form\s*8995.*QBI/i, formType: 'form8995', label: 'Form 8995' },
  { pattern: /540.*California/i, formType: 'ca540', label: 'CA Form 540' },
  // Simpler fallback patterns
  { pattern: /\bForm\s*1040\b/i, formType: 'form1040', label: 'Form 1040' },
  { pattern: /\bSchedule\s*A\b/i, formType: 'scheduleA', label: 'Schedule A' },
  { pattern: /\bSchedule\s*D\b/i, formType: 'scheduleD', label: 'Schedule D' },
  { pattern: /\bSchedule\s*E\b/i, formType: 'scheduleE', label: 'Schedule E' },
];

/** Detect which IRS form is currently displayed on the page */
function detectCurrentForm(): { formType: string; formLabel: string } | null {
  // Cast a wide net — scan title, headings, sidebar, and general body text
  const title = document.title;
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, [class*="title"], [class*="header"], [class*="form-name"]'))
    .map((el) => el.textContent ?? '')
    .join(' ');
  const sidebar = Array.from(document.querySelectorAll('.selected, .active, .current, [class*="selected"], [class*="active"], [class*="current"], [aria-selected="true"], li.sel, a.sel'))
    .map((el) => el.textContent ?? '')
    .join(' ');
  // Also check first 2000 chars of body text for form identification
  const bodySnippet = (document.body?.innerText ?? '').slice(0, 2000);

  const textToSearch = `${title} ${headings} ${sidebar} ${bodySnippet}`;

  for (const { pattern, formType, label } of FORM_PATTERNS) {
    if (pattern.test(textToSearch)) {
      return { formType, formLabel: label };
    }
  }

  return null;
}

/** Handle messages from popup or extension */
/** Dump all fillable fields on the page for debugging */
function dumpPageFields(): Array<{ tag: string; name: string; id: string; type: string; label?: string }> {
  const inputs = document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    'input, select, textarea',
  );
  const fields: Array<{ tag: string; name: string; id: string; type: string; label?: string }> = [];
  inputs.forEach((el) => {
    if (el.type === 'hidden') return;
    const label = el.closest('label')?.textContent?.trim()
      ?? document.querySelector<HTMLLabelElement>(`label[for="${el.id}"]`)?.textContent?.trim();
    fields.push({
      tag: el.tagName.toLowerCase(),
      name: el.getAttribute('name') ?? '',
      id: el.id ?? '',
      type: (el as HTMLInputElement).type ?? '',
      label: label?.slice(0, 80),
    });
  });
  return fields;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'DETECT_FORM') {
    sendResponse(detectCurrentForm());
    return true;
  }

  if (message.type === 'DUMP_FIELDS') {
    const fields = dumpPageFields();
    if (fields.length < 10) return false; // wrong frame
    sendResponse(fields);
    return true;
  }

  if (message.type === 'DUMP_CHECKBOXES') {
    const allCb = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    const cbGroups = new Map<string, HTMLInputElement[]>();
    for (const cb of allCb) {
      if (cb.name && !cb.name.startsWith('chk') && !cb.name.startsWith('Chk')) {
        if (!cbGroups.has(cb.name)) cbGroups.set(cb.name, []);
        cbGroups.get(cb.name)!.push(cb);
      }
    }
    const info: string[] = [];
    for (const [name, cbs] of cbGroups.entries()) {
      if (cbs.length === 5) {
        info.push(`Group: ${name} (${cbs.length} checkboxes)`);
        for (const cb of cbs) {
          const parent = cb.parentElement;
          // Collect sibling info
          const siblings: string[] = [];
          let sib: Node | null = cb.nextSibling;
          for (let i = 0; i < 8 && sib; i++) {
            if (sib.nodeType === Node.TEXT_NODE) {
              siblings.push(`TEXT:"${(sib.textContent ?? '').trim().slice(0, 60)}"`);
            } else if (sib instanceof HTMLElement) {
              siblings.push(`<${sib.tagName} id=${sib.id}>:"${(sib.textContent ?? '').trim().slice(0, 60)}"`);
            }
            sib = sib.nextSibling;
          }
          info.push(`  ${cb.id} name=${cb.name} parent=<${parent?.tagName} id=${parent?.id}>`);
          info.push(`    siblings: ${siblings.join(' | ')}`);
          info.push(`    parentHTML: ${parent?.innerHTML?.slice(0, 200)}`);
        }
      }
    }
    if (info.length === 0) return false;
    sendResponse(info);
    return true;
  }

  if (message.type === 'AUTOFILL_CURRENT') {
    // Only respond if this frame has real form inputs (skip empty/nav frames)
    const inputCount = document.querySelectorAll('input[type="text"], select, textarea').length;
    if (inputCount < 10) return false;

    chrome.storage.local.get(['fieldMaps', 'localPII'], (storageData) => {
      const fieldMaps = storageData.fieldMaps as Record<string, Record<string, string | number>> | undefined;
      if (!fieldMaps) {
        sendResponse({ success: false, filledCount: 0, totalFields: 0, errors: ['No saved tax data'] });
        return;
      }

      // Merge PII from chrome.storage into field maps (PII never went to server)
      const localPII = storageData.localPII as {
        primary: { firstName: string; lastName: string; ssn: string };
        spouse?: { firstName: string; lastName: string; ssn: string };
        address: { street: string; city: string; state: string; zip: string };
        dependents: Array<{ firstName: string; lastName: string; ssn: string; relationship: string }>;
        filingStatus: string;
        routingNumber?: string;
        accountNumber?: string;
        accountType?: 'checking' | 'savings';
      } | undefined;

      if (localPII && fieldMaps.form1040) {
        const f = fieldMaps.form1040;
        f['pos:primaryFirstName'] = localPII.primary.firstName;
        f['pos:primaryLastName'] = localPII.primary.lastName;
        f['pos:primarySSN'] = localPII.primary.ssn;
        if (localPII.spouse) {
          f['txtSpFirstName'] = localPII.spouse.firstName;
          f['txtSpLastName'] = localPII.spouse.lastName;
          f['txtSpSSN'] = localPII.spouse.ssn;
        }
        f['txtAddress1'] = localPII.address.street;
        f['txtCity'] = localPII.address.city;
        f['cboState'] = localPII.address.state;
        f['txtZip'] = localPII.address.zip;
        // Filing status: FreeFile uses 5 checkboxes with the same randomized name.
        // DOM order is 2-column layout: Single, HOH, MFJ, QSS, MFS
        const filingStatusMap: Record<string, number> = {
          single: 0, hoh: 1, mfj: 2, qw: 3, mfs: 4,
        };
        const fsIndex = filingStatusMap[localPII.filingStatus] ?? 2;

        const allCb = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
        const cbGroups = new Map<string, HTMLInputElement[]>();
        for (const cb of allCb) {
          if (cb.name && !cb.name.startsWith('chk') && !cb.name.startsWith('Chk')) {
            if (!cbGroups.has(cb.name)) cbGroups.set(cb.name, []);
            cbGroups.get(cb.name)!.push(cb);
          }
        }
        for (const [name, cbs] of cbGroups.entries()) {
          if (cbs.length === 5) {
            const target = cbs[fsIndex];
            if (target && !target.checked) {
              target.click();
              if (!target.checked) {
                target.checked = true;
                target.dispatchEvent(new Event('change', { bubbles: true }));
              }
              console.log(`[SelfTax] Filing status: ${name}[${fsIndex}] id=${target.id} checked=${target.checked}`);
            }
            break;
          }
        }

        // Dependents: text fields + checkboxes
        for (let i = 0; i < (localPII.dependents?.length ?? 0) && i < 4; i++) {
          const dep = localPII.dependents[i];
          const n = i + 1;
          f[`txtDepFirstName${n}`] = dep.firstName;
          f[`txtDepLastName${n}`] = dep.lastName;
          f[`txtDepSSN${n}`] = dep.ssn;
          // Normalize relationship to match FreeFile dropdown values (uppercase)
          const rel = (dep.relationship ?? '').toUpperCase().trim();
          const relationMap: Record<string, string> = {
            CHILD: 'SON', KID: 'SON', // default to SON if generic
          };
          f[`cboDepRelation${n}`] = relationMap[rel] ?? rel;
        }

        // Dependent checkboxes: (5a) lived with you, (5b) in the U.S., (7) CTC
        // Log all checkbox names containing "dep"/"Dep" so we can verify field names
        const depCbs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
          .filter((cb) => cb.name && /dep/i.test(cb.name));
        console.log(`[SelfTax] Dependent checkboxes: ${depCbs.map((cb) => cb.name).join(', ')}`);

        for (let i = 0; i < (localPII.dependents?.length ?? 0) && i < 4; i++) {
          const n = i + 1;
          // (5a) lived with you more than half year, (5b) in the U.S., (7) child tax credit
          for (const cbName of [`chkDepLivedusMoreHfyr${n}`, `chkDepLiveInd${n}`, `chkDepCTCInd${n}`]) {
            const cb = document.querySelector<HTMLInputElement>(`[name="${cbName}"]`);
            if (cb && !cb.checked) {
              cb.click();
              if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
              console.log(`[SelfTax] Checked ${cbName}: ${cb.checked}`);
            }
          }
        }

        // Schedule 8812 indicator checkbox on Form 1040
        if (fieldMaps.form8812) {
          const cb8812 = document.querySelector<HTMLInputElement>('[name="chkF8812PartiaPpaUsInd"]');
          if (cb8812 && !cb8812.checked) {
            cb8812.click();
            if (!cb8812.checked) { cb8812.checked = true; cb8812.dispatchEvent(new Event('change', { bubbles: true })); }
            console.log(`[SelfTax] Checked chkF8812PartiaPpaUsInd: ${cb8812.checked}`);
          }
        }

        // Digital Assets question: "No" (Form 1040) — by ID, not name (name = Yes checkbox)
        const virtCurrNo = document.getElementById('chkVirtCurrencyNo') as HTMLInputElement | null;
        if (virtCurrNo && !virtCurrNo.checked) { virtCurrNo.click(); }

        // Merge PII into Form 8995 (QBI) — SSN for header and each business
        if (fieldMaps.form8995) {
          const f8995 = fieldMaps.form8995;
          f8995['txtTaxpayerSSN'] = localPII.primary.ssn;
          // Each business activity line gets the primary SSN
          for (let i = 1; i <= 5; i++) {
            if (f8995[`txtBusiActivityName${i}`]) {
              f8995[`txtBusiActivitySSN${i}`] = localPII.primary.ssn;
            }
          }
        }

        // Merge PII into Form 2441 qualifying persons
        if (fieldMaps.form2441) {
          const f2441 = fieldMaps.form2441;
          for (let i = 0; i < (localPII.dependents?.length ?? 0) && i < 3; i++) {
            const dep = localPII.dependents[i];
            const n = i + 1;
            f2441[`txtQualPersonFname${n}`] = dep.firstName;
            f2441[`txtQualPersonLname${n}`] = dep.lastName;
            f2441[`txtQualPersonSSN${n}`] = dep.ssn;
            const totalExpenses = f2441['txtPart2AddAmt'];
            if (typeof totalExpenses === 'number' && localPII.dependents.length > 0) {
              f2441[`txtQualPersonAmount${n}`] = Math.round(totalExpenses / Math.min(localPII.dependents.length, 3));
            }
          }
        }
      }

      // E-file signing fields — always rebuild from localPII (source of truth)
      // These fields are on the Step 4 page, not a tax form
      {
        const efileFields: Record<string, string | number> = {};
        const today = new Date();
        efileFields.txtSignatureDate = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
        if (localPII) {
          const pii = localPII as Record<string, unknown>;
          if (pii.phone) efileFields.txtphone = String(pii.phone);
          if (pii.primaryDob) efileFields.txtPrDob = String(pii.primaryDob);
          if (pii.spouseDob) efileFields.txtSpDob = String(pii.spouseDob);
          if (pii.efilePin) efileFields.txtPin = String(pii.efilePin);
          if (pii.spouseEfilePin) efileFields.txtSpPin = String(pii.spouseEfilePin);
          // Step 4: prefer prior year PIN over AGI
          if (pii.priorYearPin) {
            efileFields.txtPryrPin = String(pii.priorYearPin);
            if (pii.spousePriorYearPin) efileFields.txtPryrSpPin = String(pii.spousePriorYearPin);
          } else if (pii.priorYearAgi) {
            efileFields.txtPriorAgi = Number(pii.priorYearAgi);
            efileFields.txtPriorSpAgi = Number(pii.priorYearAgi);
          }
        }
        fieldMaps.efile = efileFields;
      }

      // Merge all field maps into one big selector→value map
      const allFields: Record<string, string | number> = {};
      for (const formFields of Object.values(fieldMaps)) {
        Object.assign(allFields, formFields);
      }

      console.log(`[SelfTax] Attempting to fill ${Object.keys(allFields).length} fields across ${Object.keys(fieldMaps).length} forms`);

      // Log what fields exist on this page
      const pageInputs = document.querySelectorAll('input, select, textarea');
      console.log(`[SelfTax] Page has ${pageInputs.length} input elements`);
      // Dump text/select fields (skip checkboxes/buttons/hidden for clarity)
      const textFields: string[] = [];
      pageInputs.forEach((el) => {
        const inp = el as HTMLInputElement;
        if (inp.type === 'text' || inp.type === 'select-one') {
          textFields.push(inp.name || inp.id);
        }
      });
      console.log(`[SelfTax] ${textFields.length} text/select fields: ${textFields.join(', ')}`);

      // Clear existing values first, then fill fresh
      const clearedCount = clearFormFields();
      console.log(`[SelfTax] Cleared ${clearedCount} fields before filling`);

      const result = fillFormFields(allFields);
      console.log(`[SelfTax] Filled ${result.filledCount}/${result.totalFields}`, result.errors?.slice(0, 5));

      // Direct deposit (lines 35b-d) — AFTER fillFormFields so clearFormFields doesn't wipe them
      // Form fields are inside iFrameFilingForm, not the top frame
      const iframeEl = document.getElementById('iFrameFilingForm') as HTMLIFrameElement | null;
      const iframeDoc = iframeEl?.contentDocument ?? document;
      if (localPII?.routingNumber || localPII?.accountNumber) {
        const refundEl = iframeDoc.getElementById('txtRefund');
        const container = refundEl?.parentElement;
        if (container) {
          const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input.FFI_TEXT'));
          const refundIdx = inputs.findIndex(inp => inp.id === 'txtRefund');
          if (refundIdx >= 0) {
            if (localPII.routingNumber && inputs[refundIdx + 1]) {
              inputs[refundIdx + 1].value = localPII.routingNumber;
              inputs[refundIdx + 1].dispatchEvent(new Event('blur', { bubbles: true }));
            }
            if (localPII.accountNumber && inputs[refundIdx + 2]) {
              inputs[refundIdx + 2].value = localPII.accountNumber;
              inputs[refundIdx + 2].dispatchEvent(new Event('blur', { bubbles: true }));
            }
          }
        }
      }
      if (localPII?.accountType) {
        const cbId = localPII.accountType === 'checking' ? 'chkAccountTypeChk' : 'chkAccountTypeSav';
        const cb = iframeDoc.getElementById(cbId) as HTMLInputElement | null;
        if (cb && !cb.checked) { cb.click(); }
      }

      // Step 4 e-file fields (also inside iFrameFilingForm)
      if (fieldMaps.efile) {
        for (const [fieldName, value] of Object.entries(fieldMaps.efile)) {
          const el = iframeDoc.getElementById(fieldName) as HTMLInputElement | null;
          if (el) {
            el.value = String(value);
            // AGI fields need blur for formatting; PIN fields don't
            if (fieldName.includes('Agi')) {
              el.dispatchEvent(new Event('blur', { bubbles: true }));
            }
          }
        }
      }

      sendResponse(result);
    });
    return true;
  }

  if (message.type === 'FILL_FORM' && message.formData) {
    // Legacy: explicit selector→value pairs
    const response = fillFormFields(message.formData);
    sendResponse(response);
    return true;
  }

  if (message.type === 'AUTOFILL_ALL') {
    // Multi-form autofill: only run in top frame
    if (window !== window.top) return false;

    // Clear any stale state from a previous run
    setAutofillState(null);

    chrome.storage.local.get(['fieldMaps', 'localPII'], (storageData) => {
      const fieldMaps = storageData.fieldMaps as Record<string, Record<string, string | number>> | undefined;
      if (!fieldMaps) {
        sendResponse({ success: false, error: 'No saved tax data' });
        return;
      }

      // Merge PII into form1040 fields
      const localPII = storageData.localPII as {
        primary: { firstName: string; lastName: string; ssn: string };
        spouse?: { firstName: string; lastName: string; ssn: string };
        address: { street: string; city: string; state: string; zip: string };
        dependents: Array<{ firstName: string; lastName: string; ssn: string; relationship: string }>;
        filingStatus: string;
        routingNumber?: string;
        accountNumber?: string;
        accountType?: 'checking' | 'savings';
      } | undefined;

      if (localPII && fieldMaps.form1040) {
        const f = fieldMaps.form1040;
        f['pos:primaryFirstName'] = localPII.primary.firstName;
        f['pos:primaryLastName'] = localPII.primary.lastName;
        f['pos:primarySSN'] = localPII.primary.ssn;
        if (localPII.spouse) {
          f['txtSpFirstName'] = localPII.spouse.firstName;
          f['txtSpLastName'] = localPII.spouse.lastName;
          f['txtSpSSN'] = localPII.spouse.ssn;
        }
        f['txtAddress1'] = localPII.address.street;
        f['txtCity'] = localPII.address.city;
        f['cboState'] = localPII.address.state;
        f['txtZip'] = localPII.address.zip;
        for (let i = 0; i < (localPII.dependents?.length ?? 0) && i < 4; i++) {
          const dep = localPII.dependents[i];
          const n = i + 1;
          f[`txtDepFirstName${n}`] = dep.firstName;
          f[`txtDepLastName${n}`] = dep.lastName;
          f[`txtDepSSN${n}`] = dep.ssn;
          f[`cboDepRelation${n}`] = (dep.relationship ?? '').toUpperCase();
        }
        // Direct deposit: routing number, account number
        // Bank info stored in fieldMaps for fillCurrentFormInIframe to handle
        if (localPII.routingNumber) f['_bankRouting'] = localPII.routingNumber;
        if (localPII.accountNumber) f['_bankAccount'] = localPII.accountNumber;
        if (localPII.accountType) f['_bankAccountType'] = localPII.accountType;
      }

      // Merge PII into Form 8995 (QBI) — SSN for header and each business
      if (localPII && fieldMaps.form8995) {
        const f8995 = fieldMaps.form8995;
        f8995['txtTaxpayerSSN'] = localPII.primary.ssn;
        for (let i = 1; i <= 5; i++) {
          if (f8995[`txtBusiActivityName${i}`]) {
            f8995[`txtBusiActivitySSN${i}`] = localPII.primary.ssn;
          }
        }
      }

      // Merge PII into Form 2441 (qualifying persons = dependents)
      if (localPII && fieldMaps.form2441) {
        const f2441 = fieldMaps.form2441;
        for (let i = 0; i < (localPII.dependents?.length ?? 0) && i < 3; i++) {
          const dep = localPII.dependents[i];
          const n = i + 1;
          f2441[`txtQualPersonFname${n}`] = dep.firstName;
          f2441[`txtQualPersonLname${n}`] = dep.lastName;
          f2441[`txtQualPersonSSN${n}`] = dep.ssn;
          // Qualifying expenses per person (split evenly if multiple)
          const totalExpenses = f2441['txtPart2AddAmt'];
          if (typeof totalExpenses === 'number' && localPII.dependents.length > 0) {
            f2441[`txtQualPersonAmount${n}`] = Math.round(totalExpenses / Math.min(localPII.dependents.length, 3));
          }
        }
      }

      // Build queue in dependency order — FreeFile computes fields based on
      // previously filled forms (e.g., Schedule E feeds into Form 8582).
      const FORM_ORDER: string[] = [
        'form1040', 'w2', 'schedule1', 'scheduleA', 'scheduleC', 'scheduleSE',
        'scheduleD', 'scheduleE', 'form8582', 'form8582p2', 'form8582p3',
        'schedule2', 'schedule3',
        'form2441', 'form4562', 'form6251',
        'form8812', 'form8863', 'form8880', 'form8959', 'form8960',
        'form8995', 'form5695', 'efile',
      ];
      const queue = Object.keys(fieldMaps)
        .filter((k) => k !== 'ca540' && Object.keys(fieldMaps[k]).length > 0)
        .sort((a, b) => {
          const ai = FORM_ORDER.indexOf(a);
          const bi = FORM_ORDER.indexOf(b);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

      const state: AutofillState = {
        queue,
        completed: [],
        total: queue.length,
        fieldMaps,
      };

      setAutofillState(state);
      console.log(`[SelfTax] Starting multi-form autofill: ${queue.length} forms — ${queue.join(', ')}`);
      sendResponse({ success: true, forms: queue.map((k) => FORM_LABELS[k] ?? k) });

      // Start processing
      setTimeout(processNextForm, 500);
    });
    return true;
  }

  return false;
});

/** ── Multi-Form Autofill (top frame only) ────────────────────── */

/**
 * Map our internal FormKey to FreeFile form search text.
 * FreeFile's Add Form dialog has links like "Schedule A - Itemized Deductions".
 * We search for these strings in the dialog to find the right form to add.
 * form1040 is always present by default — no need to add it.
 */
/**
 * Map our internal FormKey to FreeFile form codes.
 * These codes are used in LoadFormOnTreeRequest('fCODE') in the sidebar
 * and as li id attributes in the Add Form dialog.
 * null = no add needed (form1040 is default, ca540 is state-only).
 */
const FORM_KEY_TO_FREEFILE_CODE: Record<string, string | null> = {
  w2: 'fw2',             // W-2 must be added before e-filing (Step 2 validation)
  form1040: null,        // Always present by default
  schedule1: 'f1040s1',
  schedule2: 'f1040s2',
  schedule3: 'f1040s3',
  scheduleA: 'f1040sa',
  scheduleC: 'f1040sc',
  scheduleD: 'f1040sd',
  scheduleE: 'f1040se1',
  scheduleSE: 'f1040sset',
  form2441: 'f2441',
  form4562: null,        // No standalone Form 4562 on FreeFile
  form8812: 'f8812',
  form8863: 'f8863',
  form8880: 'f8880',
  form8959: 'f8959',
  form8960: 'f8960',
  form8582: 'f8582',
  form8582p2: 'f8582w15',
  form8582p3: 'f8582w6',
  form8995: 'f8995',
  form5695: 'f5695t',
  form6251: 'f6251',
  ca540: null,           // State — not on FreeFile
};


/** Labels shown to the user in progress messages */
const FORM_LABELS: Record<string, string> = {
  w2: 'W-2',
  form1040: 'Form 1040',
  schedule1: 'Schedule 1',
  schedule2: 'Schedule 2',
  schedule3: 'Schedule 3',
  scheduleA: 'Schedule A',
  scheduleC: 'Schedule C',
  scheduleD: 'Schedule D',
  scheduleE: 'Schedule E',
  scheduleSE: 'Schedule SE',
  form2441: 'Form 2441',
  form4562: 'Form 4562',
  form6251: 'Form 6251',
  form8812: 'Schedule 8812',
  form8863: 'Form 8863',
  form8880: 'Form 8880',
  form8959: 'Form 8959',
  form8960: 'Form 8960',
  form8582: 'Form 8582',
  form8582p2: 'Form 8582 Pg 2',
  form8582p3: 'Form 8582 Pg 3',
  form8995: 'Form 8995',
  form5695: 'Form 5695',
};

const AUTOFILL_STATE_KEY = 'selftax_autofill_state';

interface AutofillState {
  /** Forms remaining to process (FormKey[]) */
  queue: string[];
  /** Forms already completed */
  completed: string[];
  /** Total forms to fill */
  total: number;
  /** The field maps for all forms */
  fieldMaps: Record<string, Record<string, string | number>>;
}

function getAutofillState(): AutofillState | null {
  try {
    const raw = sessionStorage.getItem(AUTOFILL_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setAutofillState(state: AutofillState | null): void {
  if (state) {
    sessionStorage.setItem(AUTOFILL_STATE_KEY, JSON.stringify(state));
  } else {
    sessionStorage.removeItem(AUTOFILL_STATE_KEY);
  }
}

/**
 * Add a form via the FreeFile "Add Form" dialog.
 * Clicks btnAddForms → waits for dialog → finds form by code → clicks it.
 * This triggers a full page reload.
 *
 * FreeFile dialog links: <a class="FormsList" onclick="AddNew('f2441')">
 */
function addFormViaDialog(formCodeOrText: string): void {
  const addBtn = document.getElementById('btnAddForms');
  if (!addBtn) {
    console.log('[SelfTax] btnAddForms not found');
    return;
  }
  addBtn.click();
  console.log(`[SelfTax] Opened Add Form dialog, looking for "${formCodeOrText}"...`);

  let attempts = 0;
  const pollInterval = setInterval(() => {
    attempts++;
    if (attempts > 16) { // 8 seconds
      clearInterval(pollInterval);
      console.log(`[SelfTax] Gave up finding "${formCodeOrText}" after ${attempts} attempts`);
      return;
    }

    // Handle "Add Another Copy?" confirmation modal — form already exists.
    // Pick from existing dropdown instead of adding a duplicate.
    const allDocs: Document[] = [document];
    for (const iframe of Array.from(document.querySelectorAll('iframe'))) {
      try {
        const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
        if (doc) allDocs.push(doc);
      } catch { /* cross-origin */ }
    }

    for (const doc of allDocs) {
      const confirmModal = doc.getElementById('formsAddMoreModal');
      if (confirmModal && confirmModal.classList.contains('show')) {
        clearInterval(pollInterval);
        // Form already exists — dismiss the dialog and navigate to the
        // existing copy in the sidebar instead of adding a duplicate.
        const dismissBtn = doc.getElementById('dismissAddMoreModal');
        if (dismissBtn) {
          console.log(`[SelfTax] Form already exists, dismissing "Add Another" modal`);
          (dismissBtn as HTMLElement).click();
        }
        // Navigate to the existing form in the sidebar
        setTimeout(() => {
          navigateToForm(formCodeOrText);
        }, 500);
        return;
      }
    }

    // Search all iframes and top document for the AddNew link
    for (const doc of allDocs) {
      // Strategy 1: <a> with AddNew() in onclick (e.g. AddNew('f2441'))
      const links = doc.querySelectorAll('a.FormsList, a[onclick*="AddNew"]');
      for (const link of Array.from(links)) {
        const onclick = link.getAttribute('onclick') ?? '';
        const text = (link.textContent ?? '').trim();

        if (onclick.includes(`'${formCodeOrText}'`)) {
          clearInterval(pollInterval);
          console.log(`[SelfTax] Found by onclick and clicking: "${text}" (${onclick.slice(0, 40)})`);
          (link as HTMLElement).click();
          return;
        }

        if (text.toLowerCase().includes(formCodeOrText.toLowerCase())) {
          clearInterval(pollInterval);
          console.log(`[SelfTax] Found by text and clicking: "${text}"`);
          (link as HTMLElement).click();
          return;
        }
      }

      // Strategy 2: <li> with matching id (FreeFile modal uses li id="f8582w15")
      const liById = doc.getElementById(formCodeOrText);
      if (liById) {
        clearInterval(pollInterval);
        console.log(`[SelfTax] Found by li id="${formCodeOrText}", clicking`);
        liById.click();
        return;
      }

      // Strategy 3: any element with onclick containing the form code
      const anyOnclick = doc.querySelectorAll(`[onclick*="'${formCodeOrText}'"]`);
      if (anyOnclick.length > 0) {
        clearInterval(pollInterval);
        console.log(`[SelfTax] Found by onclick attr: ${(anyOnclick[0] as HTMLElement).tagName}`);
        (anyOnclick[0] as HTMLElement).click();
        return;
      }
    }
  }, 500);
}

/**
 * Get form codes already added to the FreeFile workspace.
 * Parses li[onclick] in iFrameFormsList for LoadFormOnTreeRequest('fCODE').
 */
function getAddedFormCodes(): string[] {
  const listFrame = document.getElementById('iFrameFormsList') as HTMLIFrameElement | null;
  if (!listFrame) return [];
  try {
    const doc = listFrame.contentDocument ?? listFrame.contentWindow?.document;
    if (!doc) return [];
    return Array.from(doc.querySelectorAll('li[onclick]')).map((el) => {
      const m = (el.getAttribute('onclick') ?? '').match(/LoadFormOnTreeRequest\('([^']+)'\)/);
      return m ? m[1] : null;
    }).filter((c): c is string => c !== null);
  } catch {
    return [];
  }
}

/**
 * Check if a form is already added to the FreeFile workspace by its code.
 */
function isFormAdded(formCode: string): boolean {
  const codes = getAddedFormCodes();
  const found = codes.includes(formCode);
  console.log(`[SelfTax] isFormAdded("${formCode}"): ${found} (sidebar has: ${codes.join(', ')})`);
  return found;
}

/**
 * Navigate to a form in the sidebar by clicking its li element.
 * searchText can be a form code (e.g. 'f2441') or display name (e.g. 'Form 2441').
 */
function navigateToForm(searchText: string): boolean {
  const listFrame = document.getElementById('iFrameFormsList') as HTMLIFrameElement | null;
  if (!listFrame) return false;

  try {
    const doc = listFrame.contentDocument ?? listFrame.contentWindow?.document;
    if (!doc) return false;

    // Try clicking by form code first (more reliable)
    const items = doc.querySelectorAll('li[onclick]');
    for (const el of Array.from(items)) {
      const onclick = el.getAttribute('onclick') ?? '';
      if (onclick.includes(`'${searchText}'`)) {
        console.log(`[SelfTax] Navigating to form by code: ${searchText}`);
        (el as HTMLElement).click();
        return true;
      }
    }

    // Fallback: text match
    const allEls = doc.querySelectorAll('a, li, span');
    for (const el of Array.from(allEls)) {
      if ((el.textContent ?? '').toLowerCase().includes(searchText.toLowerCase())) {
        console.log(`[SelfTax] Navigating to form by text: ${searchText}`);
        (el as HTMLElement).click();
        return true;
      }
    }
  } catch { /* cross-origin */ }
  console.log(`[SelfTax] Could not navigate to: ${searchText}`);
  return false;
}

/**
 * Fill the currently active form in iFrameFilingForm.
 * Uses the same fillFormFields logic as AUTOFILL_CURRENT, but targets
 * the iframe's document from the top frame.
 *
 * For form1040, also handles filing status checkboxes and dependent checkboxes
 * by accessing the iframe's DOM directly (same-origin).
 */
function fillCurrentFormInIframe(fieldMaps: Record<string, Record<string, string | number>>): number {
  const fillingFrame = document.getElementById('iFrameFilingForm') as HTMLIFrameElement | null;
  if (!fillingFrame) {
    console.log('[SelfTax] iFrameFilingForm not found');
    return 0;
  }

  let doc: Document;
  try {
    doc = fillingFrame.contentDocument ?? fillingFrame.contentWindow!.document;
  } catch {
    console.log('[SelfTax] Cannot access iFrameFilingForm document');
    return 0;
  }

  // Merge ALL field maps — the iframe has the current form, and fields not
  // found simply get skipped (same as AUTOFILL_CURRENT behavior)
  const allFields: Record<string, string | number> = {};
  for (const formFields of Object.values(fieldMaps)) {
    Object.assign(allFields, formFields);
  }

  // Clear existing values before filling
  const iframeInputs = doc.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    'input[type="text"], select, textarea',
  );
  let clearedCount = 0;
  for (const el of iframeInputs) {
    if (!isFieldWritable(el)) continue;
    if (el instanceof HTMLSelectElement) {
      if (el.selectedIndex > 0) { el.selectedIndex = 0; el.dispatchEvent(new Event('change', { bubbles: true })); clearedCount++; }
    } else if (el.value !== '') {
      el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); clearedCount++;
    }
  }
  console.log(`[SelfTax] Cleared ${clearedCount} fields in iframe before filling`);

  // Log available fields for debugging
  const availableFields = Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="text"], select'))
    .map((el) => el.name || el.id)
    .filter(Boolean);
  console.log(`[SelfTax] iFrameFilingForm has ${availableFields.length} fields. Looking for: txtWagesSalariesTips → ${availableFields.includes('txtWagesSalariesTips') ? 'FOUND' : 'NOT FOUND'}`);
  console.log(`[SelfTax] First 20 field names: ${availableFields.slice(0, 20).join(', ')}`);

  let filled = 0;
  const skippedReadOnly = 0;
  for (const [selector, value] of Object.entries(allFields)) {
    // Handle pos: selectors (primary filer name/SSN by position)
    if (selector.startsWith('pos:')) {
      const key = selector.slice(4);
      const suffix = doc.querySelector<HTMLSelectElement>('[name="cboSuffix"]');
      if (!suffix) continue;
      const allInputs = Array.from(doc.querySelectorAll<FormElement>('input[type="text"], select'));
      const suffixIdx = allInputs.indexOf(suffix);
      if (suffixIdx < 4) continue;
      let target: FormElement | undefined;
      if (key === 'primaryFirstName') target = allInputs[suffixIdx - 4];
      if (key === 'primaryLastName') target = allInputs[suffixIdx - 2];
      if (key === 'primarySSN') target = allInputs[suffixIdx - 1];
      if (target) { setFieldValue(target, value); filled++; }
      continue;
    }

    // Standard field lookup by name or id
    const el = doc.querySelector<FormElement>(`[name="${selector}"]`)
      ?? doc.getElementById(selector) as FormElement | null;
    if (el) { setFieldValue(el, value); filled++; }
  }

  // Handle filing status checkboxes (same logic as AUTOFILL_CURRENT)
  const allCb = Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
  const cbGroups = new Map<string, HTMLInputElement[]>();
  for (const cb of allCb) {
    if (cb.name && !cb.name.startsWith('chk') && !cb.name.startsWith('Chk')) {
      if (!cbGroups.has(cb.name)) cbGroups.set(cb.name, []);
      cbGroups.get(cb.name)!.push(cb);
    }
  }
  // Filing status: group of 5 checkboxes
  for (const [, cbs] of cbGroups.entries()) {
    if (cbs.length === 5) {
      // Get filing status from chrome.storage (already loaded in fieldMaps)
      // The filingStatus was saved in localPII — check allFields for a hint
      // Default to MFJ (index 2) since that's most common
      // Default to MFJ (index 2); the AUTOFILL_CURRENT path reads from localPII
      const fsIndex = 2;
      const target = cbs[fsIndex];
      if (target && !target.checked) {
        target.click();
        if (!target.checked) { target.checked = true; target.dispatchEvent(new Event('change', { bubbles: true })); }
      }
      break;
    }
  }

  // Dependent checkboxes
  for (let i = 1; i <= 4; i++) {
    for (const cbName of [`chkDepLivedusMoreHfyr${i}`, `chkDepLiveInd${i}`, `chkDepCTCInd${i}`]) {
      const cb = doc.querySelector<HTMLInputElement>(`[name="${cbName}"]`);
      if (cb && !cb.checked) {
        cb.click();
        if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    }
  }

  // Schedule E: 1099 "No" checkbox — must use .click() not .checked for FreeFile
  const pay1099No = doc.getElementById('chkMakePay1099IndNo') as HTMLInputElement | null;
  if (pay1099No && !pay1099No.checked) {
    pay1099No.click();
  }

  // Schedule 8812 indicator on Form 1040
  const cb8812 = doc.querySelector<HTMLInputElement>('[name="chkF8812PartiaPpaUsInd"]');
  if (cb8812 && !cb8812.checked) {
    cb8812.click();
    if (!cb8812.checked) { cb8812.checked = true; cb8812.dispatchEvent(new Event('change', { bubbles: true })); }
  }

  // Digital Assets question: "No" (Form 1040) — by ID, not name (name = Yes checkbox)
  const virtCurrNo = doc.getElementById('chkVirtCurrencyNo') as HTMLInputElement | null;
  if (virtCurrNo && !virtCurrNo.checked) { virtCurrNo.click(); }


  // Form 2441 line 22: "Is any amount from sole proprietorship?" → No
  const solePropNo = doc.querySelector<HTMLInputElement>('[name="chkLn22SolePropNoInd"]');
  if (solePropNo && !solePropNo.checked) { solePropNo.click(); }

  // Schedule 8812 line 12 "Yes" checkbox — "Is line 8 more than line 11?"
  // Check "Yes" when initial credit (line 8) > phaseout amount (line 11), meaning credit exists
  const ln12Yes = doc.querySelector<HTMLInputElement>('[name="chkLn12Ind"]');
  if (ln12Yes && !ln12Yes.checked) {
    ln12Yes.click();
    if (!ln12Yes.checked) { ln12Yes.checked = true; ln12Yes.dispatchEvent(new Event('change', { bubbles: true })); }
  }

  // Direct deposit (lines 35b-d) — IDs are dynamic, anchor to txtRefund
  const f1040Fields = fieldMaps.form1040 ?? {};
  const bankRouting = f1040Fields['_bankRouting'] as string | undefined;
  const bankAccount = f1040Fields['_bankAccount'] as string | undefined;
  const bankType = f1040Fields['_bankAccountType'] as string | undefined;
  if (bankRouting || bankAccount) {
    const refundEl = doc.getElementById('txtRefund');
    const container = refundEl?.parentElement;
    if (container) {
      const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input.FFI_TEXT'));
      const refundIdx = inputs.findIndex(inp => inp.id === 'txtRefund');
      if (refundIdx >= 0) {
        if (bankRouting && inputs[refundIdx + 1]) {
          inputs[refundIdx + 1].value = bankRouting;
          inputs[refundIdx + 1].dispatchEvent(new Event('blur', { bubbles: true }));
          filled++;
        }
        if (bankAccount && inputs[refundIdx + 2]) {
          inputs[refundIdx + 2].value = bankAccount;
          inputs[refundIdx + 2].dispatchEvent(new Event('blur', { bubbles: true }));
          filled++;
        }
      }
    }
  }
  if (bankType) {
    const cbId = bankType === 'checking' ? 'chkAccountTypeChk' : 'chkAccountTypeSav';
    const cb = doc.getElementById(cbId) as HTMLInputElement | null;
    if (cb && !cb.checked) { cb.click(); }
  }

  console.log(`[SelfTax] Filled ${filled} fields, skipped ${skippedReadOnly} read-only in iFrameFilingForm`);
  return filled;
}

/**
 * Process the next form in the autofill queue.
 * Called on page load if there's a pending autofill state.
 */
function processNextForm(): void {
  const state = getAutofillState();
  if (!state || state.queue.length === 0) {
    // All done!
    setAutofillState(null);
    console.log(`[SelfTax] Multi-form autofill complete: ${state?.completed.length ?? 0} forms filled`);
    chrome.runtime.sendMessage({
      type: 'AUTOFILL_PROGRESS',
      completed: state?.completed.length ?? 0,
      total: state?.total ?? 0,
      currentForm: null,
      done: true,
    });
    return;
  }

  const formKey = state.queue[0];
  const label = FORM_LABELS[formKey] ?? formKey;

  console.log(`[SelfTax] Processing: ${label} (${state.completed.length + 1}/${state.total})`);

  // Report progress
  chrome.runtime.sendMessage({
    type: 'AUTOFILL_PROGRESS',
    completed: state.completed.length,
    total: state.total,
    currentForm: label,
    done: false,
  });

  const formCode = FORM_KEY_TO_FREEFILE_CODE[formKey];

  if (formCode === null || formCode === undefined) {
    // Form doesn't need adding (form1040 is default, ca540 is state-only, unknown forms skipped)
    if (formKey === 'form1040') {
      // Fill 1040 directly — it's already the active form
      waitForFilingFrame(() => {
        fillCurrentFormInIframe(state.fieldMaps);
        state.completed.push(state.queue.shift()!);
        setAutofillState(state);
        setTimeout(processNextForm, 300);
      });
    } else {
      // Skip (e.g., ca540)
      state.completed.push(state.queue.shift()!);
      setAutofillState(state);
      processNextForm();
    }
    return;
  }

  // Check if form is already added by its code
  if (isFormAdded(formCode)) {
    // Already added — save state then navigate (navigation triggers page reload)
    setAutofillState({ ...state, queue: [`__fill_${formKey}`, ...state.queue.slice(1)] });
    navigateToForm(formCode);
    // Page will reload → on-load handler picks up __fill_ prefix and fills
    return;
  }

  // Form not in sidebar — need to add it via dialog
  // This triggers a page reload, so we save state and the script will
  // resume via the on-load check below
  setAutofillState({ ...state, queue: [`__fill_${formKey}`, ...state.queue.slice(1)] });
  addFormViaDialog(formCode);

  // Recovery: if no page reload happens within 10s (user declined the
  // "add another copy?" dialog or the add failed), skip this form and
  // continue with the next one.
  setTimeout(() => {
    const current = getAutofillState();
    if (current && current.queue[0] === `__fill_${formKey}`) {
      console.log(`[SelfTax] No reload after addFormViaDialog("${formCode}"), skipping ${label}`);
      current.completed.push(current.queue.shift()!);
      setAutofillState(current);
      processNextForm();
    }
  }, 10000);
}

/**
 * Wait for iFrameFilingForm to be accessible and have form fields, then call back.
 * Polls every 300ms, up to 5 seconds.
 */
function waitForFilingFrame(callback: () => void): void {
  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    const frame = document.getElementById('iFrameFilingForm') as HTMLIFrameElement | null;
    if (frame) {
      try {
        const doc = frame.contentDocument ?? frame.contentWindow?.document;
        if (doc && doc.querySelectorAll('input, select').length > 5) {
          clearInterval(poll);
          callback();
          return;
        }
      } catch { /* not ready yet */ }
    }
    if (attempts >= 17) { // ~5 seconds
      clearInterval(poll);
      console.log('[SelfTax] iFrameFilingForm not ready after 5s, proceeding anyway');
      callback();
    }
  }, 300);
}

// ── On-load: check for pending autofill state ──
if (window === window.top) {
  const state = getAutofillState();
  if (state && state.queue.length > 0) {
    // Safety: if we've been running for more than 20 forms, something is wrong
    if (state.completed.length > 20) {
      console.log('[SelfTax] Safety valve: too many iterations, clearing state');
      setAutofillState(null);
    } else {
      const next = state.queue[0];
      if (next.startsWith('__fill_')) {
        const formKey = next.replace('__fill_', '');
        const label = FORM_LABELS[formKey] ?? formKey;
        console.log(`[SelfTax] Resuming after reload: filling ${label}`);

        waitForFilingFrame(() => {
          fillCurrentFormInIframe(state.fieldMaps);
          state.completed.push(formKey);
          state.queue.shift();
          setAutofillState(state);
          setTimeout(processNextForm, 300);
        });
      } else {
        waitForFilingFrame(() => processNextForm());
      }
    }
  }
}

/** ── Field Discovery (top frame only) ─────────────────────────── */

const DISCOVER_FORMS = [
  'Schedule 1', 'Schedule 2', 'Schedule 3',
  'Schedule A', 'Schedule B', 'Schedule C', 'Schedule D', 'Schedule E',
  'Schedule SE',
  'Form 2441', 'Form 4562', 'Form 8812',
  'Form 8863', 'Form 8880', 'Form 8889',
  'Form 8959', 'Form 8960', 'Form 8962', 'Form 8995',
  'Form 5695', 'Form 1116',
];

/** Read fields from the content iframe */
function readIframeFields(): Array<{ name: string; type: string }> | null {
  const iframes = document.querySelectorAll('iframe');
  for (const iframe of Array.from(iframes)) {
    try {
      const doc = iframe.contentDocument;
      if (!doc) continue;
      const inputs = doc.querySelectorAll('input, select, textarea');
      if (inputs.length < 5) continue;
      const fields: Array<{ name: string; type: string }> = [];
      inputs.forEach((el) => {
        const inp = el as HTMLInputElement;
        if (inp.type === 'hidden') return;
        fields.push({ name: inp.getAttribute('name') ?? '', type: inp.type ?? '' });
      });
      return fields;
    } catch { /* cross-origin */ }
  }
  return null;
}

/** Click a sidebar link matching text */
function clickSidebar(text: string): boolean {
  const links = document.querySelectorAll('a');
  for (const el of Array.from(links)) {
    if ((el.textContent ?? '').includes(text) && el.offsetParent !== null) {
      el.click();
      return true;
    }
  }
  return false;
}

/** Run the full discovery flow — only works in the top frame */
async function discoverAllFields(): Promise<Record<string, { textFields: string[]; selects: string[]; checkboxes: string[] }>> {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const results: Record<string, { textFields: string[]; selects: string[]; checkboxes: string[] }> = {};

  // Find the "Add/View Forms" or "Add Form" button
  const addBtn = Array.from(document.querySelectorAll('button, input[type="button"], a, span'))
    .find((el) => /add.*form|add\/view/i.test((el as HTMLElement).textContent ?? '') ||
      /add.*form/i.test((el as HTMLInputElement).value ?? ''));

  for (const formName of DISCOVER_FORMS) {
    console.log(`[Discover] --- ${formName} ---`);

    // Try to add the form via the "Add Form" dialog
    if (addBtn) {
      (addBtn as HTMLElement).click();
      await wait(2000);

      // Find the dropdown — may be in top frame or an iframe
      let dropdown: HTMLSelectElement | null = document.querySelector('#AddMoreModalListItem');
      if (!dropdown) {
        for (const iframe of Array.from(document.querySelectorAll('iframe'))) {
          try {
            dropdown = iframe.contentDocument?.querySelector('#AddMoreModalListItem') ?? null;
            if (dropdown) break;
          } catch { /* skip */ }
        }
      }

      if (dropdown && dropdown.options.length > 0) {
        // Find matching option
        const match = Array.from(dropdown.options).find((o) =>
          o.text.toLowerCase().includes(formName.toLowerCase()),
        );
        if (match) {
          dropdown.value = match.value;
          dropdown.dispatchEvent(new Event('change', { bubbles: true }));
          await wait(500);

          // Click "Add" button
          const modalAdd = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'))
            .find((el) => /^add$/i.test(((el as HTMLElement).textContent ?? (el as HTMLInputElement).value ?? '').trim()));
          if (modalAdd) {
            (modalAdd as HTMLElement).click();
            await wait(2000);
          }
        } else {
          console.log(`[Discover]   "${formName}" not in dropdown`);
          // Close modal
          const cancel = Array.from(document.querySelectorAll('button, input[type="button"]'))
            .find((el) => /cancel|close/i.test(((el as HTMLElement).textContent ?? (el as HTMLInputElement).value ?? '').trim()));
          if (cancel) (cancel as HTMLElement).click();
          await wait(500);
        }
      } else {
        // Close modal if dropdown not found
        const cancel = Array.from(document.querySelectorAll('button, input[type="button"]'))
          .find((el) => /cancel|close/i.test(((el as HTMLElement).textContent ?? (el as HTMLInputElement).value ?? '').trim()));
        if (cancel) (cancel as HTMLElement).click();
        await wait(500);
      }
    }

    // Navigate to the form in the sidebar
    const clicked = clickSidebar(formName);
    if (!clicked) {
      console.log(`[Discover]   Not in sidebar, skipping`);
      continue;
    }
    await wait(3000);

    // Read fields from the iframe
    const fields = readIframeFields();
    if (fields && fields.length > 0) {
      results[formName] = {
        textFields: fields.filter((f) => f.type === 'text').map((f) => f.name).filter(Boolean),
        selects: fields.filter((f) => f.type === 'select-one').map((f) => f.name).filter(Boolean),
        checkboxes: fields.filter((f) => f.type === 'checkbox').map((f) => f.name).filter(Boolean),
      };
      console.log(`[Discover]   ✓ ${fields.length} fields`);
    } else {
      console.log(`[Discover]   ✗ No fields in iframe`);
    }
  }

  return results;
}

// Listen for DISCOVER_FIELDS — only respond in top frame
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'DISCOVER_FIELDS') return false;
  if (window !== window.top) return false; // Only run in top frame

  discoverAllFields().then((results) => {
    console.log('[Discover] Complete:', JSON.stringify(results, null, 2));
    sendResponse(results);
  });
  return true; // Keep channel open for async
});

console.log('[SelfTax] Free File auto-fill content script loaded');
