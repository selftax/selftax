/**
 * Popup script — 1Password-style vault for tax data.
 *
 * Flow: Lock screen → Unlock → Dashboard (return summary, upload, autofill, vault)
 * All interaction happens within the popup — no full-page tab.
 *
 * Vault functions are inlined here (not imported) to avoid ESM chunk splitting
 * issues in Chrome extension popups. The canonical modules live in
 * src/services/vaultCrypto.ts and src/services/vaultManager.ts.
 */

// ── Inline vault crypto + manager (avoids ESM chunk issues) ──

interface EncryptedBlob { salt: string; iv: string; ciphertext: string; }
interface LocalPII {
  primary: { firstName: string; lastName: string; ssn: string };
  spouse?: { firstName: string; lastName: string; ssn: string };
  address: { street: string; city: string; state: string; zip: string };
  dependents: Array<{ firstName: string; lastName: string; ssn: string; relationship: string; dob?: string }>;
  filingStatus: string;
  rentalAddresses?: string[][];
  phone?: string;
  primaryDob?: string;
  spouseDob?: string;
  efilePin?: string;        // This year's chosen signing PIN (5 digits)
  spouseEfilePin?: string;
  priorYearPin?: string;    // Last year's self-select PIN (extracted from prior return)
  spousePriorYearPin?: string;
  priorYearAgi?: number;
  routingNumber?: string;
  accountNumber?: string;
  accountType?: 'checking' | 'savings';
}

const PBKDF2_ITERATIONS = 600_000;
const AUTO_LOCK_MS = 15 * 60 * 1000;

let cachedKey: CryptoKey | null = null;
let cachedSalt: Uint8Array | null = null;
let cachedPII: LocalPII | null = null;

function vaultToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function vaultFromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function vaultDeriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}
async function vaultEncrypt(key: CryptoKey, plaintext: string, salt: Uint8Array): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, key, new TextEncoder().encode(plaintext));
  return { salt: vaultToBase64(salt.buffer as ArrayBuffer), iv: vaultToBase64(iv.buffer as ArrayBuffer), ciphertext: vaultToBase64(cipherBuf) };
}
async function vaultDecrypt(key: CryptoKey, blob: EncryptedBlob): Promise<string> {
  const iv = vaultFromBase64(blob.iv);
  const ct = vaultFromBase64(blob.ciphertext);
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, key, ct.buffer as ArrayBuffer);
  return new TextDecoder().decode(buf);
}

// ── No-password mode: PII stored unencrypted in chrome.storage ──
// Vault encryption is disabled for now. PII lives in `localPII`.
// If an old encrypted vault exists, the lock screen shows once to migrate.

async function loadPII(): Promise<void> {
  const stored = await chrome.storage.local.get('localPII');
  if (stored.localPII) {
    cachedPII = stored.localPII as LocalPII;
    // Migrate: old efilePin/spouseEfilePin were prior year PINs, move to new fields
    if (cachedPII.efilePin && !cachedPII.priorYearPin) {
      cachedPII.priorYearPin = cachedPII.efilePin;
      cachedPII.efilePin = undefined;
    }
    if (cachedPII.spouseEfilePin && !cachedPII.spousePriorYearPin) {
      cachedPII.spousePriorYearPin = cachedPII.spouseEfilePin;
      cachedPII.spouseEfilePin = undefined;
    }
    if (cachedPII.priorYearPin || cachedPII.spousePriorYearPin) {
      await chrome.storage.local.set({ localPII: cachedPII });
    }
  }
}

function isUnlocked(): boolean { return cachedPII != null; }

/** First-time setup — create default PII (no password) */
async function setupVault(_password?: string): Promise<void> {
  const pii: LocalPII = {
    primary: { firstName: '', lastName: '', ssn: '' },
    address: { street: '', city: '', state: '', zip: '' },
    dependents: [], filingStatus: 'single',
  };
  await chrome.storage.local.set({ localPII: pii });
  cachedPII = pii;
}

/** Unlock an old encrypted vault and migrate to unencrypted storage */
async function unlock(password: string): Promise<boolean> {
  const stored = await chrome.storage.local.get('encryptedVault');
  const blob = stored.encryptedVault as EncryptedBlob | undefined;
  if (!blob) return false;
  const salt = vaultFromBase64(blob.salt);
  const key = await vaultDeriveKey(password, salt);
  try {
    const json = await vaultDecrypt(key, blob);
    cachedPII = JSON.parse(json);
    // Migrate: save unencrypted, remove encrypted vault
    await chrome.storage.local.set({ localPII: cachedPII });
    await chrome.storage.local.remove(['encryptedVault', 'lastActive']);
    cachedKey = null; cachedSalt = null;
    return true;
  } catch { return false; }
}

function lock(): void { /* no-op in no-password mode */ }

function getPII(): LocalPII | null {
  return cachedPII;
}

interface SavedReturn {
  taxYear: number;
  name: string;
  filingStatus: string;
  refundOrOwed: number;
  isRefund: boolean;
  forms: string[];
}

const FILING_STATUS_LABELS: Record<string, string> = {
  single: 'Single',
  mfj: 'Married Filing Jointly',
  mfs: 'Married Filing Separately',
  hoh: 'Head of Household',
  qw: 'Qualifying Surviving Spouse',
};

const FORM_LABEL_MAP: Record<string, string> = {
  form1040: 'Form 1040', schedule1: 'Schedule 1', schedule2: 'Schedule 2', schedule3: 'Schedule 3',
  scheduleA: 'Schedule A', scheduleC: 'Schedule C', scheduleD: 'Schedule D',
  scheduleE: 'Schedule E', scheduleSE: 'Schedule SE',
  form2441: 'Form 2441', form4562: 'Form 4562', form6251: 'Form 6251',
  form8812: 'Form 8812', form8863: 'Form 8863', form8880: 'Form 8880',
  form8959: 'Form 8959', form8960: 'Form 8960', form8995: 'Form 8995',
  form5695: 'Form 5695', ca540: 'CA 540',
};

/** Human-readable labels for FreeFile field names */
const FIELD_LABELS: Record<string, string> = {
  // PII
  'pos:primaryFirstName': 'First Name',
  'pos:primaryLastName': 'Last Name',
  'pos:primarySSN': 'SSN',
  txtSpFirstName: 'Spouse First Name',
  txtSpLastName: 'Spouse Last Name',
  txtSpSSN: 'Spouse SSN',
  txtOccupation: 'Occupation',
  txtAddress1: 'Address',
  txtApartment: 'Apt',
  txtCity: 'City',
  cboState: 'State',
  txtZip: 'ZIP',
  txtDepFirstName1: 'Dep 1 First Name', txtDepLastName1: 'Dep 1 Last Name',
  txtDepSSN1: 'Dep 1 SSN', cboDepRelation1: 'Dep 1 Relationship',
  txtDepFirstName2: 'Dep 2 First Name', txtDepLastName2: 'Dep 2 Last Name',
  txtDepSSN2: 'Dep 2 SSN', cboDepRelation2: 'Dep 2 Relationship',
  // 1040 income
  txtWagesSalariesTips: '1a Wages',
  txtToTLine1z: '1z Total Wages',
  txtTaxExemptInt: '2a Tax-Exempt Interest',
  txtTaxableInt: '2b Taxable Interest',
  txtQualDiv: '3a Qualified Dividends',
  txtOrdDiv: '3b Ordinary Dividends',
  txtTotIraDist: '4a IRA Distributions',
  txtTaxTotIraDist: '4b Taxable IRA',
  txtTotPen: '5a Pensions',
  txtTaxTotPen: '5b Taxable Pensions',
  txtSsBenefits: '6a Social Security',
  txtTaxSsBenefits: '6b Taxable SS',
  txtCapitalGains: '7 Capital Gain/Loss',
  txtOtherInc: '8 Other Income',
  txtTotalIncome: '9 Total Income',
  txtTotAdj: '10 Adjustments',
  txtTotAdjGrossInc: '11 AGI',
  txtStdDed: '12a Deduction',
  txtQualBusIncDed: '13 QBI Deduction',
  txtTotalDeduction: '14 Total Deductions',
  txtTaxableIncome: '15 Taxable Income',
  txtTaxWoAmt: '16 Tax',
  txtTotOf6251And8962: '17 Sch 2 Part I',
  txtTax: '18 Total Tax',
  txtChildTaxCdt: '19 Child Tax Credit',
  txtTotNonRefCrdt: '20 Nonrefundable Credits',
  txtTotCredit: '21 Total Credits',
  txtTaxAfterCred: '22 Tax After Credits',
  txtTotalOtherTax: '23 Other Taxes',
  txtTotalTax: '24 Total Tax',
  txtW2TaxWithheld: '25a W-2 Withholding',
  txtFedTaxWithheld1099: '25b 1099 Withholding',
  txtFedTaxWithheldOther: '25c Other Withholding',
  txtFedTaxWithheld: '25d Total Withholding',
  txtEstTaxpayDivSpSsn: '26 Estimated Payments',
  txtEIC: '27a EIC',
  txtTotPayments: '33 Total Payments',
  txtOverPaid: '34 Overpaid',
  txtRefund: '35a Refund',
  txtAmtOwe: '37 Amount Owed',
  // Schedule 1
  txtBusinessInc: '3 Business Income',
  txtSuppIncome: '5 Rental/Partnership',
  txtUnempComp: '7 Unemployment',
  txtLn10TotIncome: '10 Total Other Income',
  txtEduExp: '11 Educator Expenses',
  txtSelfEmp50Per: '15 SE Tax Deduction',
  txtStdLoanIntDed: '19 Student Loan Interest',
  txtLn26TotAdjInc: '26 Total Adjustments',
  // Schedule A
  txtstLocIncTax: '5a State/Local Tax',
  txtRealEstTax: '5c Property Tax',
  txtschAAddLn5aLn5c: '5d SALT Total',
  txtSchASmallLine5d: '5e SALT (capped)',
  txtHomeMortRep: '8a Mortgage Interest',
  txtIntUPaid: '10 Total Interest',
  txtGiftsChcq: '11 Gifts by Check',
  txtGiftsToChar: '14 Total Charity',
  txtTotItemDed: '17 Total Itemized',
  // Schedule E
  txtScheStreetAddressA: 'Property A Address',
  txtScheAmountRentA: '3 Rents Received',
  txtScheInsuranceA: '9 Insurance',
  txtScheMortageInterestA: '12 Mortgage Interest',
  txtScheRepairA: '14 Repairs',
  txtScheTaxesA: '16 Taxes',
  txtScheUtilityA: '17 Utilities',
  txtSchdeDepreciationExpenseA: '18 Depreciation',
  txtSchdeOtherExpA: '19 Other Expenses',
  txtScheTotalLine20A: '20 Total Expenses',
  txtScheSubstratLine3A: '21 Net Income',
  txtScheTotincRentalAmt: '23a Total Rental Income',
  txtScheTotIncomeorloss: '26 Total Sch E',
  // Form 2441
  txtPart2AddAmt: '3 Qualifying Expenses',
  txtPart2EarnedInc: '4 Earned Income',
  txtPart2SpEarnedInc: '5 Spouse Earned Income',
  txtPart2Smallest: '6 Smallest Amount',
  txtPart2Cdt: '8 Credit Rate',
  txtPart2RefundableCredit: '9 Refundable Credit',
  txtPart2Cdcdt: '11 Dependent Care Credit',
  // Form 8995
  txtTotQualBusiIncLoss: '1 QBI',
  txtQualBusiIncomeComp: '2 QBI Component',
  txtIncBfrQBIDeduction: '4 Income Before QBI',
  txtQualSmallLn4Ln25: '10 QBI Deduction',
};

const content = document.getElementById('content')!;
const header = document.getElementById('header')!;

// ── Settings ────────────────────────────────────────────────

type ProcessingMode = 'local' | 'localhost' | 'cloud';

let currentMode: ProcessingMode = 'local';
let serverPort = 3742;

async function loadMode(): Promise<void> {
  const stored = await chrome.storage.local.get(['processingMode', 'serverPort']);
  currentMode = (stored.processingMode as ProcessingMode) ?? 'local';
  serverPort = (stored.serverPort as number) ?? 3742;
}

async function saveMode(mode: ProcessingMode): Promise<void> {
  currentMode = mode;
  await chrome.storage.local.set({ processingMode: mode });
}

async function savePort(port: number): Promise<void> {
  serverPort = port;
  await chrome.storage.local.set({ serverPort: port });
}

function getServerUrl(): string {
  return `http://localhost:${serverPort}`;
}

function renderSettings() {
  const modes: Array<{ value: ProcessingMode; label: string; desc: string; disabled?: boolean; badge?: string }> = [
    { value: 'local', label: 'Local Only', desc: 'Structured IRS forms only (W-2, 1098, 1099). No AI, no server. Everything runs in your browser.' },
    { value: 'localhost', label: 'Local Server', desc: 'Run the SelfTax server on your machine for AI-powered extraction of unstructured documents. Point to localhost:3742.' },
    { value: 'cloud', label: 'SelfTax Cloud', desc: 'Hosted AI extraction. Coming soon.', disabled: true, badge: 'COMING SOON' },
  ];

  content.innerHTML = `
    <div style="padding:4px 0;">
      <div style="display:flex;align-items:center;margin-bottom:12px;">
        <button id="settings-back-btn" class="btn-secondary" style="width:auto;padding:4px 12px;margin-right:8px;">&larr; Back</button>
        <b style="font-size:14px;">Settings</b>
      </div>
      <div class="section-header">Processing Mode</div>
      ${modes.map((m) => `
        <div class="mode-option ${m.value === currentMode ? 'selected' : ''} ${m.disabled ? 'disabled' : ''}" data-mode="${m.value}">
          <input type="radio" name="mode" value="${m.value}" ${m.value === currentMode ? 'checked' : ''} ${m.disabled ? 'disabled' : ''} />
          <div>
            <div class="mode-label">${m.label}${m.badge ? `<span class="mode-badge">${m.badge}</span>` : ''}</div>
            <div class="mode-desc">${m.desc}</div>
          </div>
        </div>
      `).join('')}
      ${currentMode === 'localhost' ? `
        <div class="profile-row" style="margin-top:8px;">
          <label>Port</label>
          <input type="number" id="server-port-input" value="${serverPort}" min="1" max="65535" style="width:80px;" />
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('settings-back-btn')?.addEventListener('click', () => renderDashboard());

  document.querySelectorAll('.mode-option:not(.disabled)').forEach((el) => {
    el.addEventListener('click', async () => {
      const mode = (el as HTMLElement).dataset.mode as ProcessingMode;
      await saveMode(mode);
      renderSettings();
    });
  });

  document.getElementById('server-port-input')?.addEventListener('change', async (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (val >= 1 && val <= 65535) await savePort(val);
  });
}

// Wire settings button in header
document.getElementById('settings-btn')?.addEventListener('click', () => renderSettings());

// ── State ───────────────────────────────────────────────────

/** Documents staged for processing */
interface StagedDoc {
  name: string;
  file: File;
  status: 'staged' | 'extracting' | 'extracted' | 'redacted' | 'sent' | 'error';
  extractedText?: string;
  redactedText?: string;
  piiFound?: string[];
  errorMsg?: string;
  detectedType?: string;
  structuredFields?: Record<string, unknown>;
  /** Raw PDF as base64 — for API vision extraction (faster than text) */
  pdfBase64?: string;
}

const stagedDocuments: StagedDoc[] = [];

// ── Init ────────────────────────────────────────────────────

/** Calculate tax return from stored extractions + server overrides */
async function calculateFromStoredData(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const core = (window as any).selftaxCore as { calculateInBrowser?: Function } | undefined;
  if (!core?.calculateInBrowser) return;

  const data = await chrome.storage.local.get(['storedExtractions', 'localPII', 'storedServerOverrides']);
  const exts = (data.storedExtractions ?? []) as Array<Record<string, unknown>>;
  const pii = data.localPII as LocalPII | undefined;
  const overrides = data.storedServerOverrides as Record<string, unknown> | undefined;

  const result = core.calculateInBrowser(
    exts,
    pii?.filingStatus ?? 'single',
    pii?.address?.state ?? 'CA',
    pii?.dependents?.length ?? 0,
    pii,
    overrides,
  );

  await chrome.storage.local.set({
    taxReturn: result.taxReturn,
    fieldMaps: result.fieldMaps,
    savedReturn: result.summary,
  });
}

async function init() {
  // Load settings
  await loadMode();

  // Try loading unencrypted PII first (no-password mode)
  await loadPII();

  // Check if background worker finished extraction while popup was closed
  const status = await chrome.storage.local.get('extractionStatus');
  const extraction = status.extractionStatus as { state: string } | undefined;
  if (extraction?.state === 'done') {
    // Server results arrived — calculate locally
    await chrome.storage.local.remove('extractionStatus');
    await calculateFromStoredData();
  }

  if (isUnlocked()) {
    await renderDashboard();
    return;
  }

  // Check for old encrypted vault — show lock screen once to migrate
  const stored = await chrome.storage.local.get('encryptedVault');
  if (stored.encryptedVault) {
    renderLockScreen();
    return;
  }

  // First time — auto-setup with no password
  await setupVault();
  await renderDashboard();
}

// ── Lock / Setup Screens ────────────────────────────────────

function renderSetup() {
  // Remove lock button from header if present
  removeLockButton();

  content.innerHTML = `
    <div class="lock-screen">
      <div class="lock-icon">&#128274;</div>
      <h2>Create a Password</h2>
      <p style="font-size:12px;color:#64748b;margin-bottom:16px;">
        Your tax data will be encrypted with this password.
      </p>
      <input type="password" id="setup-pw" placeholder="Password" autocomplete="new-password" />
      <input type="password" id="setup-confirm" placeholder="Confirm password" autocomplete="new-password" />
      <div id="setup-error" class="error-msg" style="display:none;"></div>
      <button class="btn-primary" id="setup-btn">Create Vault</button>
      <p class="hint">Your password never leaves this device.</p>
    </div>
  `;

  document.getElementById('setup-btn')?.addEventListener('click', handleSetup);
  document.getElementById('setup-confirm')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSetup();
  });
}

async function handleSetup() {
  const pw = (document.getElementById('setup-pw') as HTMLInputElement).value;
  const confirm = (document.getElementById('setup-confirm') as HTMLInputElement).value;
  const errorEl = document.getElementById('setup-error')!;

  if (pw.length < 4) {
    errorEl.textContent = 'Password must be at least 4 characters.';
    errorEl.style.display = 'block';
    return;
  }
  if (pw !== confirm) {
    errorEl.textContent = 'Passwords do not match.';
    errorEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('setup-btn') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Encrypting...';

  await setupVault(pw);
  await renderDashboard();
}

function renderLockScreen() {
  removeLockButton();

  content.innerHTML = `
    <div class="lock-screen">
      <div class="lock-icon">&#128274;</div>
      <h2>Unlock SelfTax</h2>
      <input type="password" id="unlock-pw" placeholder="Enter password" autocomplete="current-password" />
      <div id="unlock-error" class="error-msg" style="display:none;"></div>
      <button class="btn-primary" id="unlock-btn">Unlock</button>
      <button id="forgot-pw-btn" style="background:none;border:none;color:#94a3b8;font-size:11px;cursor:pointer;margin-top:12px;">Forgot password?</button>
    </div>
  `;

  document.getElementById('unlock-btn')?.addEventListener('click', handleUnlock);
  document.getElementById('unlock-pw')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleUnlock();
  });
  document.getElementById('forgot-pw-btn')?.addEventListener('click', handleForgotPassword);
  // Focus password field
  (document.getElementById('unlock-pw') as HTMLInputElement)?.focus();
}

async function handleUnlock() {
  const pw = (document.getElementById('unlock-pw') as HTMLInputElement).value;
  const errorEl = document.getElementById('unlock-error')!;

  const btn = document.getElementById('unlock-btn') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Unlocking...';

  const success = await unlock(pw);
  if (success) {
    await renderDashboard();
  } else {
    errorEl.textContent = 'Incorrect password. Please try again.';
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Unlock';
    (document.getElementById('unlock-pw') as HTMLInputElement).value = '';
    (document.getElementById('unlock-pw') as HTMLInputElement).focus();
  }
}

async function handleForgotPassword() {
  const btn = document.getElementById('forgot-pw-btn') as HTMLButtonElement;
  if (btn.dataset.confirmed !== 'true') {
    btn.textContent = 'This will clear your PII (names, SSN) but keep your tax return data. Click again to confirm.';
    btn.style.color = '#dc2626';
    btn.dataset.confirmed = 'true';
    setTimeout(() => {
      btn.textContent = 'Forgot password?';
      btn.style.color = '#94a3b8';
      btn.dataset.confirmed = '';
    }, 5000);
    return;
  }
  // Clear the encrypted vault and start fresh (no password)
  await chrome.storage.local.remove(['encryptedVault', 'lastActive']);
  await setupVault();
  await renderDashboard();
}

// ── Lock button in header ───────────────────────────────────

function addLockButton() {
  // No-op — password disabled
}

function removeLockButton() {
  document.getElementById('lock-button')?.remove();
}

// ── Dashboard ───────────────────────────────────────────────

async function renderDashboard() {
  addLockButton();

  const data = await chrome.storage.local.get(['taxReturn', 'savedReturn']);
  const savedReturn = data.savedReturn as SavedReturn | undefined;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isOnFreeFile = tab?.url?.includes('freefilefillableforms.com') ?? false;

  let html = '';

  // Return card
  if (savedReturn) {
    html += returnCard(savedReturn);
  }

  // Autofill area (only on FreeFile with a return)
  if (savedReturn && isOnFreeFile && tab?.id) {
    html += renderAutofillSection(savedReturn, tab.id);
  } else if (savedReturn && !isOnFreeFile) {
    html += `<div class="status info">Navigate to freefilefillableforms.com to autofill</div>`;
  }

  // Document upload area
  html += renderUploadSection();

  // Profile section (filing status, dependents)
  html += renderProfileSection();

  // Status area (for autofill progress)
  html += '<div id="status-area"></div>';

  // Field vault toggle
  html += `
    <button class="fields-toggle" id="fields-toggle-btn">View Saved Fields</button>
    <div id="fields-vault" style="display:none;"></div>
  `;

  // Reset button
  html += `
    <button class="btn-secondary" id="reset-btn" style="margin-top:12px;color:#dc2626;border-color:#fecaca;">
      Reset All Data
    </button>
  `;

  content.innerHTML = html;

  // Wire up event listeners
  wireUploadListeners();
  updateUploadUI(); // wire remove buttons + click-to-view on existing docs
  wireProfileListeners();
  wireFieldVaultToggle();
  wireResetButton();
  if (savedReturn && isOnFreeFile && tab?.id) {
    wireAutofillListeners(savedReturn, tab.id);
  }
}

// ── Autofill Section ────────────────────────────────────────

function renderAutofillSection(ret: SavedReturn, _tabId: number): string {
  const formList = (ret.forms || [])
    .filter((f) => f !== 'ca540')
    .map((f) => FORM_LABEL_MAP[f] ?? f);

  return `
    <button class="btn-autofill" id="autofill-all-btn">Autofill All Forms (${formList.length})</button>
    <div style="font-size:11px;color:#94a3b8;margin:4px 0 8px;text-align:center">${formList.join(' · ')}</div>
    <button class="btn-secondary" id="autofill-btn" style="margin-bottom:8px;">Autofill Current Form Only</button>
  `;
}

function wireAutofillListeners(ret: SavedReturn, tabId: number) {
  // Autofill All Forms
  document.getElementById('autofill-all-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('autofill-all-btn') as HTMLButtonElement;
    const statusArea = document.getElementById('status-area')!;
    btn.disabled = true;
    btn.textContent = 'Starting...';

    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'AUTOFILL_ALL' });
      if (response?.success) {
        statusArea.innerHTML = `<div class="status">Filling ${response.forms.length} forms...</div>`;
        btn.textContent = 'In progress...';
      } else {
        statusArea.innerHTML = `<div class="status error">${response?.error || 'Failed to start'}</div>`;
        btn.textContent = 'Retry';
        btn.disabled = false;
      }
    } catch (err) {
      statusArea.innerHTML = `<div class="status error">${err instanceof Error ? err.message : 'Failed'}</div>`;
      btn.textContent = 'Retry';
      btn.disabled = false;
    }
  });

  // Progress listener
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== 'AUTOFILL_PROGRESS') return;
    const statusArea = document.getElementById('status-area');
    const btn = document.getElementById('autofill-all-btn') as HTMLButtonElement | null;
    if (!statusArea) return;

    if (message.done) {
      statusArea.innerHTML = `<div class="status success">Complete! ${message.completed} forms filled</div>` + supportBanner();
      if (btn) { btn.textContent = 'Done!'; }
    } else {
      statusArea.innerHTML = `<div class="status">Filling ${message.currentForm}... (${message.completed + 1}/${message.total})</div>`;
    }
  });

  // Autofill Current Form Only
  document.getElementById('autofill-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('autofill-btn') as HTMLButtonElement;
    const statusArea = document.getElementById('status-area')!;
    btn.disabled = true;
    btn.textContent = 'Filling...';

    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'AUTOFILL_CURRENT' });
      if (response?.filledCount > 0) {
        statusArea.innerHTML = `<div class="status success">Filled ${response.filledCount} of ${response.totalFields} fields</div>` + supportBanner();
        btn.textContent = 'Done!';
      } else {
        const fields = await chrome.tabs.sendMessage(tabId, { type: 'DUMP_FIELDS' });
        const fieldList = (fields || []).slice(0, 20).map(
          (f: { name: string; id: string }) => `${f.name || f.id}`,
        ).join(', ');
        const errors = (response?.errors || []).slice(0, 3).join('\n');
        statusArea.innerHTML = `<div class="status error" style="text-align:left;font-size:11px;">
          <b>0 fields filled.</b> Selectors don't match.<br/>
          <b>Tried:</b> ${errors}<br/>
          <b>Page has:</b> ${fieldList || 'no fields found'}
        </div>`;
        btn.textContent = 'Retry';
        btn.disabled = false;
      }
    } catch (err) {
      statusArea.innerHTML = `<div class="status error">${err instanceof Error ? err.message : 'Failed to autofill'}</div>`;
      btn.textContent = 'Retry';
      btn.disabled = false;
    }
  });

  // Use void to acknowledge unused param in this scope
  void ret;
}

// ── Upload Section ──────────────────────────────────────────

function renderUploadSection(): string {
  let html = `<div class="section-header">Documents</div>`;

  // Document list
  html += '<div class="document-list" id="document-list">';
  html += renderDocumentList();
  html += '</div>';

  // Upload area
  html += `
    <div class="upload-area" id="upload-area">
      <input type="file" id="file-input" multiple accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png" />
      <div class="upload-label">Drop files here or click to upload</div>
      <div class="upload-hint">.pdf, .xlsx, .xls, .jpg, .png</div>
    </div>
  `;

  // Action buttons (shown when docs are staged)
  html += '<div id="upload-actions"></div>';

  return html;
}

function renderDocumentList(): string {
  return stagedDocuments.map((doc, i) => {
    const statusLabels: Record<string, string> = {
      staged: 'Ready',
      extracting: 'Extracting...',
      extracted: 'Text extracted',
      redacted: 'PII redacted',
      sent: 'Processed',
      error: doc.errorMsg ?? 'Error',
    };
    const statusColors: Record<string, string> = {
      staged: '#64748b',
      extracting: '#f59e0b',
      extracted: '#2563eb',
      redacted: '#16a34a',
      sent: '#16a34a',
      error: '#dc2626',
    };
    const canView = doc.structuredFields || doc.redactedText || doc.extractedText;
    const typeTag = doc.detectedType
      ? `<span style="font-size:10px;color:#2563eb;margin-left:4px;">${doc.detectedType}</span>`
      : '';
    const piiTag = doc.structuredFields
      ? `<span style="font-size:10px;color:#16a34a;margin-left:4px;">Fields only — no PII sent</span>`
      : doc.piiFound?.length
        ? `<span style="font-size:10px;color:#f59e0b;margin-left:4px;">${doc.piiFound.length} PII tokens</span>`
        : '';
    return `<div class="document-item" style="flex-wrap:wrap;cursor:${canView ? 'pointer' : 'default'};" data-view-idx="${canView ? i : ''}">
      <span class="doc-name" style="flex:1;">${doc.name}</span>
      <span style="color:${statusColors[doc.status]};font-size:11px;">${statusLabels[doc.status]}</span>
      ${typeTag}${piiTag}
      <button class="remove-doc-btn" data-idx="${i}" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:14px;padding:0 4px;margin-left:4px;" title="Remove">&times;</button>
    </div>`;
  }).join('');
}

function updateUploadUI() {
  const listEl = document.getElementById('document-list');
  if (listEl) listEl.innerHTML = renderDocumentList();

  // Wire remove buttons
  document.querySelectorAll('.remove-doc-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt((e.target as HTMLElement).dataset.idx ?? '', 10);
      if (!isNaN(idx)) {
        stagedDocuments.splice(idx, 1);
        updateUploadUI();
      }
    });
  });

  // Wire click-to-view redacted text
  document.querySelectorAll('[data-view-idx]').forEach((el) => {
    const idx = parseInt((el as HTMLElement).dataset.viewIdx ?? '', 10);
    if (isNaN(idx)) return;
    el.addEventListener('click', () => showRedactedPreview(idx));
  });

  // Show/hide action buttons based on state
  const actionsEl = document.getElementById('upload-actions');
  if (!actionsEl) return;

  const hasStagedDocs = stagedDocuments.some((d) => d.status === 'staged');
  const hasExtractedDocs = stagedDocuments.some((d) => d.status === 'extracted' || d.status === 'redacted');

  const allStructured = hasExtractedDocs &&
    stagedDocuments.filter((d) => d.status === 'extracted' || d.status === 'redacted')
      .every((d) => d.structuredFields);
  const hasUnstructured = stagedDocuments.some((d) => d.status === 'redacted' && !d.structuredFields);

  if (hasStagedDocs) {
    actionsEl.innerHTML = `
      <button class="btn-primary" id="extract-btn" style="margin-top:8px;">
        Extract & Redact (${stagedDocuments.filter((d) => d.status === 'staged').length} files)
      </button>
    `;
    document.getElementById('extract-btn')?.addEventListener('click', handleExtractAndRedact);
  } else if (allStructured) {
    actionsEl.innerHTML = `
      <div class="status success" style="text-align:left;font-size:11px;margin-top:8px;">
        All documents are structured forms. Calculation runs locally — no data leaves your device.
      </div>
      <button class="btn-primary" id="calculate-btn" style="margin-top:8px;">
        Calculate Tax Return
      </button>
    `;
    document.getElementById('calculate-btn')?.addEventListener('click', handleCalculateLocally);
  } else if (hasUnstructured) {
    const structuredCount = stagedDocuments.filter((d) => d.structuredFields).length;
    const unstructuredNames = stagedDocuments
      .filter((d) => d.status === 'redacted' && !d.structuredFields)
      .map((d) => d.name).join(', ');

    if (currentMode === 'localhost') {
      actionsEl.innerHTML = `
        <div class="status info" style="text-align:left;font-size:11px;margin-top:8px;">
          PII has been stripped. Redacted text will be sent to your local server for field extraction — calculation runs locally.
        </div>
        <button class="btn-primary" id="send-btn" style="margin-top:8px;">
          Extract Fields &amp; Calculate
        </button>
      `;
      document.getElementById('send-btn')?.addEventListener('click', handleSendToServer);
    } else {
      actionsEl.innerHTML = `
        <div class="status error" style="text-align:left;font-size:11px;margin-top:8px;">
          <b>Some documents need AI to interpret:</b> ${unstructuredNames}<br/><br/>
          Only structured IRS forms (W-2, 1098, 1099, prior year 1040) can be processed in Local Only mode.
          Remove the unsupported documents${structuredCount > 0 ? ` and calculate with what's available (${structuredCount} structured forms)` : ''}, or switch to <b>Local Server</b> mode in Settings.
        </div>
      `;
    }
  } else {
    actionsEl.innerHTML = '';
  }
}

function wireUploadListeners() {
  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('file-input') as HTMLInputElement | null;
  if (!uploadArea || !fileInput) return;

  uploadArea.addEventListener('click', () => fileInput.click());
  uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
  uploadArea.addEventListener('dragleave', () => { uploadArea.classList.remove('dragover'); });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer?.files) stageFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files) stageFiles(fileInput.files);
  });
}

/** Stage files for processing — no extraction or server calls yet */
function stageFiles(files: FileList) {
  for (let i = 0; i < files.length; i++) {
    stagedDocuments.push({ name: files[i].name, file: files[i], status: 'staged' });
  }
  updateUploadUI();
}

/** Step 1: Extract text locally, detect type, extract fields or redact PII */
async function handleExtractAndRedact() {
  const btn = document.getElementById('extract-btn') as HTMLButtonElement;
  if (btn) { btn.disabled = true; btn.textContent = 'Extracting...'; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const core = (window as any).selftaxCore as {
    detectDocumentType?: (text: string) => string;
    extractStructuredFields?: (text: string) => { formType: string; [k: string]: unknown } | null;
    extractByLabelProximity?: (items: Array<{ text: string; x: number; y: number }>, formType: string) => { formType: string; [k: string]: unknown } | null;
    extractYearFromItems?: (items: Array<{ text: string; x: number; y: number }>) => number | undefined;
    tokenizePII?: (text: string, profile: unknown) => string;
    buildTokenProfile?: (pii: unknown) => unknown;
    extractProfileFromTexts?: (docs: Array<{ text: string; type: string }>) => {
      primary?: { firstName?: string; lastName?: string; ssn?: string; address?: { street?: string; city?: string; state?: string; zip?: string } };
      spouse?: { firstName?: string; lastName?: string; ssn?: string };
      address?: { street?: string; city?: string; state?: string; zip?: string };
      dependents?: Array<{ firstName?: string; lastName?: string; ssn?: string; relationship?: string }>;
      filingStatus?: string;
      stateOfResidence?: string;
    };
  } | undefined;

  // Phase 1: Extract text from all staged docs
  for (const doc of stagedDocuments) {
    if (doc.status !== 'staged') continue;
    doc.status = 'extracting';
    updateUploadUI();

    try {
      const text = await extractTextFromFile(doc.file);
      doc.extractedText = text;

      // Detect document type from text
      const docType = core?.detectDocumentType?.(text) ?? '';

      // For PDFs: try position-based label extraction first (most reliable)
      const isPdf = doc.file.type === 'application/pdf' || doc.name.endsWith('.pdf');
      if (isPdf && core?.extractByLabelProximity && docType !== 'prior-year-return') {
        const posItems = await getPositionedItems(doc.file);
        if (posItems.length > 0) {
          const spatial = core.extractByLabelProximity(posItems, docType);
          if (spatial && Object.keys(spatial).length > 1) {
            // Add year if detected
            const year = core.extractYearFromItems?.(posItems);
            if (year) spatial.documentTaxYear = year;
            doc.detectedType = docType || spatial.formType;
            doc.structuredFields = spatial;
            doc.status = 'extracted';
            doc.piiFound = [];
            updateUploadUI();
            continue;
          }
        }
      }

      // Fallback: regex-based structured extraction (prior-year 1040, or if spatial failed)
      if (core?.extractStructuredFields) {
        const structured = core.extractStructuredFields(text);
        if (structured && structured.formType) {
          doc.detectedType = docType || structured.formType;
          doc.structuredFields = structured;
          doc.status = 'extracted';
          doc.piiFound = [];
          updateUploadUI();
          continue;
        }
      }

      // Set detected type even for unstructured docs (used by server to skip classification)
      if (!doc.detectedType && docType) doc.detectedType = docType;
      // Store raw PDF base64 for API vision extraction (faster than text for the LLM)
      if ((doc.file.type === 'application/pdf' || doc.name.endsWith('.pdf')) && !doc.structuredFields) {
        doc.pdfBase64 = await readFileAsBase64(doc.file);
      }
      doc.status = 'extracted';
    } catch (err) {
      doc.status = 'error';
      doc.errorMsg = err instanceof Error ? err.message : 'Extraction failed';
    }
    updateUploadUI();
  }

  // Phase 2: Auto-detect PII profile from all extracted texts
  let pii = getPII();
  if (core?.extractProfileFromTexts) {
    // Pass ALL docs (including structured ones like prior-year returns)
    // because profile info (names, SSN, filing status, dependents) comes
    // from the 1040 text, not the structured financial fields
    const docInputs = stagedDocuments
      .filter((d) => d.extractedText)
      .map((d) => ({ text: d.extractedText!, type: d.detectedType ?? 'unknown' }));
    if (docInputs.length > 0) {
      const detected = core.extractProfileFromTexts(docInputs);
      if (detected?.primary?.firstName || detected?.primary?.lastName) {
        // Only update fields the detection actually found — don't overwrite
        // existing vault data with empty results from a partial upload
        const detectedDeps = (detected.dependents ?? []).filter((d) => d.firstName);
        const detectedAddr = detected.address ?? detected.primary?.address;

        const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
        const merged: LocalPII = {
          primary: {
            firstName: norm(detected.primary.firstName ?? pii?.primary.firstName ?? ''),
            lastName: norm(detected.primary.lastName ?? pii?.primary.lastName ?? ''),
            ssn: (detected.primary.ssn ?? pii?.primary.ssn ?? '').trim(),
          },
          spouse: detected.spouse?.firstName ? {
            firstName: detected.spouse.firstName,
            lastName: detected.spouse.lastName ?? '',
            ssn: detected.spouse.ssn ?? '',
          } : pii?.spouse,
          address: detectedAddr ? {
            street: (detectedAddr.street ?? '').replace(/\s+/g, ' ').trim(),
            city: (detectedAddr.city ?? '').replace(/\s+/g, ' ').trim(),
            state: (detectedAddr.state ?? '').trim(),
            zip: (detectedAddr.zip ?? '').trim(),
          } : pii?.address ?? { street: '', city: '', state: '', zip: '' },
          // Only overwrite dependents if detection found some — don't erase existing
          dependents: detectedDeps.length > 0 ? detectedDeps.map((d) => ({
            firstName: d.firstName ?? '',
            lastName: d.lastName ?? '',
            ssn: d.ssn ?? '',
            relationship: d.relationship ?? '',
          })) : pii?.dependents ?? [],
          filingStatus: detected.filingStatus ?? pii?.filingStatus ?? 'single',
          rentalAddresses: pii?.rentalAddresses,
          // Preserve existing e-file fields
          phone: pii?.phone,
          primaryDob: pii?.primaryDob,
          spouseDob: pii?.spouseDob,
          efilePin: pii?.efilePin,
          spouseEfilePin: pii?.spouseEfilePin,
          priorYearAgi: pii?.priorYearAgi,
        };
        await savePIIToVault(merged);
        pii = merged;
      }
    }
  }

  // Phase 3: Redact PII from unstructured docs
  for (const doc of stagedDocuments) {
    if (doc.status !== 'extracted' || doc.structuredFields) continue;

    const text = doc.extractedText ?? '';
    if (pii && text && core?.tokenizePII && core?.buildTokenProfile) {
      const profile = core.buildTokenProfile({
        primary: pii.primary,
        spouse: pii.spouse,
        address: pii.address,
        dependents: pii.dependents,
        rentalAddresses: pii.rentalAddresses,
      });
      doc.redactedText = core.tokenizePII(text, profile);
      doc.piiFound = findRedactedTokens(doc.redactedText);
      doc.status = 'redacted';
    } else if (pii && text) {
      const { redacted, piiItems } = redactPIIFromText(text, pii);
      doc.redactedText = redacted;
      doc.piiFound = piiItems;
      doc.status = 'redacted';
    } else {
      doc.redactedText = text;
      doc.status = 'redacted';
    }
    updateUploadUI();
  }
}

/** Calculate tax return locally from structured fields — no server needed */
async function handleCalculateLocally() {
  const btn = document.getElementById('calculate-btn') as HTMLButtonElement;
  const statusArea = document.getElementById('status-area');
  if (btn) { btn.disabled = true; btn.textContent = 'Calculating...'; }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const core = (window as any).selftaxCore as { calculateInBrowser?: Function } | undefined;
    if (!core?.calculateInBrowser) throw new Error('Tax engine not loaded');

    // Merge new structured extractions with previously stored ones
    // so we always calculate from ALL data, not just this session's uploads
    const newExtractions = stagedDocuments
      .filter((d) => d.structuredFields)
      .map((d) => ({ ...d.structuredFields as Record<string, unknown>, _sourceFile: d.name }));

    const stored = await chrome.storage.local.get('storedExtractions');
    const existingExtractions = (stored.storedExtractions ?? []) as Array<Record<string, unknown>>;

    // Merge by source filename — same file replaces, different files coexist
    // This handles multiple 1098s, multiple 1099-INTs, etc.
    const merged = [...existingExtractions];
    for (const ext of newExtractions) {
      const idx = merged.findIndex((e) => e._sourceFile === ext._sourceFile);
      if (idx >= 0) {
        merged[idx] = ext; // same file → newer wins
      } else {
        merged.push(ext);
      }
    }
    await chrome.storage.local.set({ storedExtractions: merged });

    const pii = getPII();
    const filingStatus = pii?.filingStatus ?? 'single';
    const state = pii?.address?.state ?? 'CA';
    const depCount = pii?.dependents?.length ?? 0;

    // Load previously stored server overrides (rental, childcare, property tax)
    const overridesData = await chrome.storage.local.get('storedServerOverrides');
    const serverOverrides = overridesData.storedServerOverrides as Record<string, unknown> | undefined;

    // Calculate from ALL extractions (stored + new) + server overrides
    const result = core.calculateInBrowser(merged, filingStatus, state, depCount, pii, serverOverrides);

    // Save bank info from prior-year extraction into localPII
    if (pii) {
      const priorYear = merged.find((e) => e.formType === 'prior-year-return');
      if (priorYear) {
        let piiChanged = false;
        if (priorYear.routingNumber && !pii.routingNumber) { pii.routingNumber = priorYear.routingNumber as string; piiChanged = true; }
        if (priorYear.accountNumber && !pii.accountNumber) { pii.accountNumber = priorYear.accountNumber as string; piiChanged = true; }
        if (priorYear.accountType && !pii.accountType) { pii.accountType = priorYear.accountType as 'checking' | 'savings'; piiChanged = true; }
        if (priorYear.efilePin) { pii.priorYearPin = priorYear.efilePin as string; piiChanged = true; }
        if (priorYear.spouseEfilePin) { pii.spousePriorYearPin = priorYear.spouseEfilePin as string; piiChanged = true; }
        if (piiChanged) await savePIIToVault(pii);
      }
    }

    // Full overwrite — calculation used all data, result is complete
    await chrome.storage.local.set({
      taxReturn: result.taxReturn,
      fieldMaps: result.fieldMaps,
      savedReturn: result.summary,
    });

    if (statusArea) {
      const amount = Math.abs(result.summary.refundOrOwed).toLocaleString();
      const label = result.summary.isRefund ? `Refund: $${amount}` : `Owed: $${amount}`;
      statusArea.innerHTML = `<div class="status success">${label} — Tax return calculated!</div>`;
    }

    // Refresh dashboard to show the return card
    setTimeout(() => renderDashboard(), 1500);
  } catch (err) {
    if (statusArea) {
      statusArea.innerHTML = `<div class="status error">${err instanceof Error ? err.message : 'Calculation failed'}</div>`;
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
  }
}

/** Find redaction tokens like [SELF], [SPOUSE], [HOME_ADDRESS] in tokenized text */
function findRedactedTokens(text: string): string[] {
  const tokens = text.match(/\[[A-Z_]+\]/g) ?? [];
  return [...new Set(tokens)];
}

/** Get positioned text items from a PDF for spatial extraction */
async function getPositionedItems(file: File): Promise<Array<{ text: string; x: number; y: number; page: number }>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib = (window as any).pdfjsLib;
  if (!pdfjsLib) return [];

  try {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const allItems: Array<{ text: string; x: number; y: number; page: number }> = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const item of content.items as any[]) {
        if (typeof item.str === 'string' && item.str.trim()) {
          allItems.push({
            text: item.str.trim(),
            x: Math.round(item.transform[4]),
            y: Math.round(item.transform[5]),
            page: i,
          });
        }
      }
    }
    return allItems;
  } catch {
    return [];
  }
}

/** Extract text from a file — uses pdfjs-dist for PDFs, base64 for binary */
async function extractTextFromFile(file: File): Promise<string> {
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    return await extractPdfText(file);
  }
  // Binary files (images, spreadsheets) → base64 for server-side extraction
  // Server uses SheetJS for XLS/XLSX, OCR for images
  const binaryExtensions = ['.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.heic', '.tiff', '.webp'];
  const isBinary = file.type.startsWith('image/') ||
    binaryExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
  if (isBinary) {
    return await readFileAsBase64(file);
  }
  // Text files (CSV, TXT, etc.)
  return await file.text();
}

/** Extract text from a PDF using pdfjs-dist (loaded in popup.html) */
async function extractPdfText(file: File): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib = (window as any).pdfjsLib;
  if (!pdfjsLib) {
    // Fallback if pdfjs didn't load — return base64 for server extraction
    return await readFileAsBase64(file);
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = content.items.filter((item: any) => typeof item.str === 'string');

    // Sort by position (top-to-bottom, left-to-right)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items.sort((a: any, b: any) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) > Math.max(a.height, b.height) * 0.5) return yDiff;
      return a.transform[4] - b.transform[4];
    });

    // Group into lines
    const lines: string[] = [];
    let currentLine = '';
    let lastY = -1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const item of items as any[]) {
      const y = Math.round(item.transform[5]);
      if (lastY >= 0 && Math.abs(y - lastY) > item.height * 0.5) {
        lines.push(currentLine.trim());
        currentLine = '';
      }
      currentLine += item.str + ' ';
      lastY = y;
    }
    if (currentLine.trim()) lines.push(currentLine.trim());
    pages.push(lines.join('\n'));
  }

  return pages.join('\n\n--- Page Break ---\n\n');
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Simple PII redaction using the vault profile */
function redactPIIFromText(text: string, pii: LocalPII): { redacted: string; piiItems: string[] } {
  let redacted = text;
  const piiItems: string[] = [];

  // Redact SSNs
  const ssnPattern = /\b\d{3}-?\d{2}-?\d{4}\b/g;
  if (ssnPattern.test(redacted)) {
    piiItems.push('SSN patterns');
    redacted = redacted.replace(ssnPattern, '[SSN]');
  }

  // Redact names from profile
  const names = [
    pii.primary.firstName, pii.primary.lastName,
    ...(pii.spouse ? [pii.spouse.firstName, pii.spouse.lastName] : []),
    ...pii.dependents.flatMap((d) => [d.firstName, d.lastName]),
  ].filter((n) => n.length > 1);

  for (const name of names) {
    const nameRegex = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    if (nameRegex.test(redacted)) {
      piiItems.push(name);
      redacted = redacted.replace(nameRegex, '[NAME]');
    }
  }

  // Redact address
  if (pii.address.street && pii.address.street.length > 3) {
    const addrRegex = new RegExp(pii.address.street.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    if (addrRegex.test(redacted)) {
      piiItems.push('Address');
      redacted = redacted.replace(addrRegex, '[ADDRESS]');
    }
  }

  return { redacted, piiItems };
}

/** Direct fetch to server — fallback when background worker is unavailable */
async function directExtract(payload: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const stored = await chrome.storage.local.get('serverPort');
    const port = (stored.serverPort as number) ?? 3742;
    const response = await fetch(`http://localhost:${port}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Server error' }));
      return { ok: false, error: err.error ?? 'Extraction failed' };
    }
    const { extractedFields } = await response.json();
    await chrome.storage.local.set({
      storedServerOverrides: extractedFields,
      extractionStatus: { state: 'done', completedAt: Date.now() },
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed';
    return { ok: false, error: msg.includes('fetch') ? `Server not running on port ${(await chrome.storage.local.get('serverPort')).serverPort ?? 3742}. Check Settings.` : msg };
  }
}

/** Step 2: Send redacted documents to server */
async function handleSendToServer() {
  const btn = document.getElementById('send-btn') as HTMLButtonElement;
  const statusArea = document.getElementById('status-area');
  if (btn) { btn.disabled = true; btn.textContent = 'Extracting fields...'; }

  // Only send unstructured (redacted) docs to server for field extraction
  const docsToSend = stagedDocuments.filter((d) => d.status === 'redacted' && !d.structuredFields);

  try {
    const pii = getPII();

    // Step 1: Save structured extractions BEFORE sending to server
    // (so they're persisted even if popup closes during extraction)
    const newExtractions = stagedDocuments
      .filter((d) => d.structuredFields)
      .map((d) => ({ ...d.structuredFields as Record<string, unknown>, _sourceFile: d.name }));

    const stored = await chrome.storage.local.get('storedExtractions');
    const existingExtractions = (stored.storedExtractions ?? []) as Array<Record<string, unknown>>;

    const merged = [...existingExtractions];
    for (const ext of newExtractions) {
      const idx = merged.findIndex((e) => e._sourceFile === ext._sourceFile);
      if (idx >= 0) merged[idx] = ext;
      else merged.push(ext);
    }
    await chrome.storage.local.set({ storedExtractions: merged });

    // Step 2: Send unstructured docs to server via background worker
    // (survives popup close — worker persists independently)
    const payload = {
      profile: {
        filingStatus: pii?.filingStatus ?? 'single',
        stateOfResidence: pii?.address.state ?? 'CA',
        dependentCount: pii?.dependents.length ?? 0,
      },
      documents: docsToSend.map((d) => {
        const isBinaryFile = ['.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.heic', '.tiff']
          .some((ext) => d.name.toLowerCase().endsWith(ext));
        return {
          type: d.detectedType ?? 'unknown',
          redactedText: isBinaryFile ? '' : (d.redactedText ?? ''),
          fields: {},
          fileName: d.name,
          fileData: isBinaryFile ? d.extractedText : undefined,
          pdfBase64: d.pdfBase64,
        };
      }),
    };

    if (statusArea) statusArea.innerHTML = `<div class="status info">Extracting fields...</div>`;

    // Try background worker first (survives popup close), fall back to direct fetch
    let result: { ok: boolean; error?: string };
    try {
      result = await chrome.runtime.sendMessage({ type: 'EXTRACT_REQUEST', payload });
    } catch {
      // Background worker not available — fetch directly from popup
      result = await directExtract(payload);
    }

    if (!result?.ok) {
      if (statusArea) statusArea.innerHTML = `<div class="status error">${result?.error ?? 'Extraction failed'}</div>`;
      if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
      return;
    }

    for (const doc of docsToSend) doc.status = 'sent';
    updateUploadUI();

    // Step 3: Calculate locally with server overrides
    if (btn) btn.textContent = 'Calculating...';
    await calculateFromStoredData();

    setTimeout(() => renderDashboard(), 1500);
  } catch (err) {
    if (statusArea) {
      const msg = err instanceof Error ? err.message : 'Failed';
      statusArea.innerHTML = `<div class="status error">${msg.includes('fetch') ? 'Server not running. Start with: pnpm dev:mcp' : msg}</div>`;
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
  }
}

// ── Profile Section ─────────────────────────────────────────

function renderProfileSection(): string {
  const pii = getPII();

  const filingStatus = pii?.filingStatus ?? 'single';
  const dependentCount = pii?.dependents?.length ?? 0;

  return `
    <div class="section-header">Filing Profile</div>
    <div class="profile-row">
      <label>Filing Status</label>
      <select id="profile-filing-status">
        <option value="single" ${filingStatus === 'single' ? 'selected' : ''}>Single</option>
        <option value="mfj" ${filingStatus === 'mfj' ? 'selected' : ''}>Married Filing Jointly</option>
        <option value="mfs" ${filingStatus === 'mfs' ? 'selected' : ''}>Married Filing Separately</option>
        <option value="hoh" ${filingStatus === 'hoh' ? 'selected' : ''}>Head of Household</option>
        <option value="qw" ${filingStatus === 'qw' ? 'selected' : ''}>Qualifying Surviving Spouse</option>
      </select>
    </div>
    <div class="profile-row">
      <label>Dependents</label>
      <input type="number" id="profile-dependents" value="${dependentCount}" min="0" max="10" />
    </div>
    ${(pii?.dependents ?? []).map((dep, i) => `
    <div class="profile-row">
      <label>${dep.firstName || 'Dep ' + (i + 1)} DOB</label>
      <input type="text" id="profile-dep-dob-${i}" value="${dep.dob ?? ''}" placeholder="MM/DD/YYYY" />
    </div>`).join('')}
    <div class="section-header" style="margin-top:12px;">E-File Info</div>
    <div class="profile-row">
      <label>Phone</label>
      <input type="tel" id="profile-phone" value="${pii?.phone ?? ''}" placeholder="555-123-4567" />
    </div>
    <div class="profile-row">
      <label>Your DOB</label>
      <input type="text" id="profile-dob" value="${pii?.primaryDob ?? ''}" placeholder="MM/DD/YYYY" />
    </div>
    <div class="profile-row">
      <label>Spouse DOB</label>
      <input type="text" id="profile-spouse-dob" value="${pii?.spouseDob ?? ''}" placeholder="MM/DD/YYYY" />
    </div>
    <div class="profile-row">
      <label>Prior Year PIN</label>
      <input type="text" id="profile-prior-pin" value="${pii?.priorYearPin ?? ''}" placeholder="Last year's 5-digit PIN" maxlength="5" />
    </div>
    <div class="profile-row">
      <label>Spouse Prior PIN</label>
      <input type="text" id="profile-spouse-prior-pin" value="${pii?.spousePriorYearPin ?? ''}" placeholder="Last year's 5-digit PIN" maxlength="5" />
    </div>
    <div class="profile-row">
      <label>This Year PIN</label>
      <input type="text" id="profile-pin" value="${pii?.efilePin ?? ''}" placeholder="Choose 5 digits" maxlength="5" />
    </div>
    <div class="profile-row">
      <label>Spouse This Year PIN</label>
      <input type="text" id="profile-spouse-pin" value="${pii?.spouseEfilePin ?? ''}" placeholder="Choose 5 digits" maxlength="5" />
    </div>
    <div class="profile-row">
      <label>Routing #</label>
      <input type="text" id="profile-routing" value="${pii?.routingNumber ?? ''}" placeholder="9 digits" maxlength="9" />
    </div>
    <div class="profile-row">
      <label>Account #</label>
      <input type="text" id="profile-account" value="${pii?.accountNumber ?? ''}" placeholder="Up to 17 digits" maxlength="17" />
    </div>
    <div class="profile-row">
      <label>Account Type</label>
      <select id="profile-account-type">
        <option value="checking"${pii?.accountType === 'checking' ? ' selected' : ''}>Checking</option>
        <option value="savings"${pii?.accountType === 'savings' ? ' selected' : ''}>Savings</option>
      </select>
    </div>
  `;
}

function wireProfileListeners() {
  const statusSelect = document.getElementById('profile-filing-status') as HTMLSelectElement | null;
  const depInput = document.getElementById('profile-dependents') as HTMLInputElement | null;

  statusSelect?.addEventListener('change', async () => {
    const pii = getPII();
    if (!pii) return;
    pii.filingStatus = statusSelect.value;
    await savePIIToVault(pii);
    showProfileSaved();
  });

  depInput?.addEventListener('change', async () => {
    const pii = getPII();
    if (!pii) return;
    const newCount = parseInt(depInput.value, 10) || 0;
    while (pii.dependents.length < newCount) {
      pii.dependents.push({ firstName: '', lastName: '', ssn: '', relationship: '' });
    }
    if (newCount < pii.dependents.length) {
      pii.dependents.length = newCount;
    }
    await savePIIToVault(pii);
    showProfileSaved();
  });

  // E-file fields — save on change
  const efileFields: Array<{ id: string; key: keyof LocalPII }> = [
    { id: 'profile-phone', key: 'phone' },
    { id: 'profile-dob', key: 'primaryDob' },
    { id: 'profile-spouse-dob', key: 'spouseDob' },
    { id: 'profile-prior-pin', key: 'priorYearPin' },
    { id: 'profile-spouse-prior-pin', key: 'spousePriorYearPin' },
    { id: 'profile-pin', key: 'efilePin' },
    { id: 'profile-spouse-pin', key: 'spouseEfilePin' },
    { id: 'profile-routing', key: 'routingNumber' },
    { id: 'profile-account', key: 'accountNumber' },
  ];
  for (const { id, key } of efileFields) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    el?.addEventListener('change', async () => {
      const pii = getPII();
      if (!pii) return;
      (pii as Record<string, unknown>)[key] = el.value;
      await savePIIToVault(pii);
      showProfileSaved();
    });
  }

  // Dependent DOB fields
  const piiForDeps = getPII();
  for (let i = 0; i < (piiForDeps?.dependents?.length ?? 0); i++) {
    const dobEl = document.getElementById(`profile-dep-dob-${i}`) as HTMLInputElement | null;
    dobEl?.addEventListener('change', async () => {
      const pii = getPII();
      if (!pii || !pii.dependents[i]) return;
      pii.dependents[i].dob = dobEl.value;
      await savePIIToVault(pii);
      showProfileSaved();
    });
  }

  // Account type select
  const acctTypeEl = document.getElementById('profile-account-type') as HTMLSelectElement | null;
  acctTypeEl?.addEventListener('change', async () => {
    const pii = getPII();
    if (!pii) return;
    pii.accountType = acctTypeEl.value as 'checking' | 'savings';
    await savePIIToVault(pii);
    showProfileSaved();
  });
}

function showProfileSaved() {
  const statusArea = document.getElementById('status-area');
  if (statusArea) {
    statusArea.innerHTML = '<div class="status success">Profile saved</div>';
    setTimeout(() => { if (statusArea) statusArea.innerHTML = ''; }, 2000);
  }
}

async function savePIIToVault(pii: LocalPII): Promise<void> {
  cachedPII = pii;
  await chrome.storage.local.set({ localPII: pii });

  // Sync e-file fields to fieldMaps so content script can read them
  // (content script can't decrypt the vault)
  const efileFields: Record<string, string | number> = {};
  const today = new Date();
  efileFields.txtSignatureDate = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
  if (pii.phone) efileFields.txtphone = pii.phone;
  if (pii.primaryDob) efileFields.txtPrDob = pii.primaryDob;
  if (pii.spouseDob) efileFields.txtSpDob = pii.spouseDob;
  // This year's signing PIN
  if (pii.efilePin) efileFields.txtPin = pii.efilePin;
  if (pii.spouseEfilePin) efileFields.txtSpPin = pii.spouseEfilePin;
  // Step 4 identity verification: prefer prior year PIN over AGI
  if (pii.priorYearPin) {
    efileFields.txtPryrPin = pii.priorYearPin;
    if (pii.spousePriorYearPin) efileFields.txtPryrSpPin = pii.spousePriorYearPin;
  } else if (pii.priorYearAgi) {
    efileFields.txtPriorAgi = pii.priorYearAgi;
    efileFields.txtPriorSpAgi = pii.priorYearAgi;
  }
  // Overwrite efile fields (not merge) so stale AGI/PIN don't coexist
  const data = await chrome.storage.local.get('fieldMaps');
  const fieldMaps = (data.fieldMaps ?? {}) as Record<string, Record<string, string | number>>;
  fieldMaps.efile = efileFields;
  await chrome.storage.local.set({ fieldMaps });
}

function wireResetButton() {
  document.getElementById('reset-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('reset-btn') as HTMLButtonElement;
    if (btn.dataset.confirmed !== 'true') {
      btn.textContent = 'Are you sure? Click again to confirm.';
      btn.dataset.confirmed = 'true';
      setTimeout(() => {
        btn.textContent = 'Reset All Data';
        btn.dataset.confirmed = '';
      }, 3000);
      return;
    }
    // Clear everything — storage + in-memory staged docs, then re-setup
    await chrome.storage.local.clear();
    stagedDocuments.length = 0;
    await setupVault();
    await renderDashboard();
  });
}

/** Show document preview — structured fields or redacted text */
function showRedactedPreview(idx: number) {
  const doc = stagedDocuments[idx];
  if (!doc) return;

  let previewHtml = '';

  if (doc.structuredFields) {
    // Structured document — show extracted fields as a clean table
    const fields = doc.structuredFields;
    const fieldLabels: Record<string, string> = {
      formType: 'Form Type', documentTaxYear: 'Tax Year',
      wages: 'Wages (1a)', federalWithholding: 'Federal Withholding (25a)',
      ssWages: 'SS Wages', ssTax: 'SS Tax', medicareWages: 'Medicare Wages', medicareTax: 'Medicare Tax',
      stateWithholding: 'State Withholding', dependentCareBenefits: 'Dependent Care (Box 10)',
      interestIncome: 'Interest Income', mortgageInterest: 'Mortgage Interest',
      propertyTax: 'Property Tax', hazardInsurance: 'Hazard Insurance',
      outstandingPrincipal: 'Outstanding Principal',
      capitalLossCarryforward: 'Capital Loss Carryforward',
      rentalInsurance: 'Rental Insurance', rentalMortgageInterest: 'Rental Mortgage Interest',
      rentalPropertyTax: 'Rental Property Tax', rentalDepreciation: 'Rental Depreciation',
      qbiDeduction: 'QBI Deduction', occupation: 'Occupation',
    };

    previewHtml += '<div style="margin-bottom:8px;color:#16a34a;font-size:12px;font-weight:600;">Structured extraction — only these fields are used. No raw text or PII leaves your device.</div>';
    previewHtml += '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:8px;">';
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || value === null || value === 0) continue;
      const label = fieldLabels[key] ?? key;
      const displayVal = typeof value === 'number' ? `$${value.toLocaleString()}` : String(value);
      previewHtml += `<div class="field-row"><span class="field-label">${label}</span><span class="field-value">${displayVal}</span></div>`;
    }
    previewHtml += '</div>';
  } else {
    // Unstructured — show redacted text
    const text = doc.redactedText ?? doc.extractedText ?? '';
    const isBase64 = text.length > 200 && !/\s/.test(text.slice(0, 200));

    const piiList = doc.piiFound?.length
      ? `<div style="margin-bottom:8px;"><b>PII tokens:</b> ${doc.piiFound.join(', ')}</div>`
      : '<div style="margin-bottom:8px;color:#64748b;">No PII detected.</div>';

    previewHtml += piiList;
    previewHtml += isBase64
      ? '<div style="color:#64748b;font-style:italic;">Image file — will be sent for server-side OCR. Text redaction applies after extraction.</div>'
      : `<pre style="white-space:pre-wrap;word-break:break-word;font-size:10px;max-height:300px;overflow-y:auto;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:8px;">${escapeHtml(text.slice(0, 3000))}${text.length > 3000 ? '\n\n... (truncated)' : ''}</pre>`;
  }

  const typeLabel = doc.detectedType ? ` — ${doc.detectedType}` : '';

  content.innerHTML = `
    <div class="body" style="padding:12px 16px;">
      <div style="display:flex;align-items:center;margin-bottom:12px;">
        <button id="back-btn" class="btn-secondary" style="width:auto;padding:4px 12px;margin-right:8px;">&larr; Back</button>
        <b style="font-size:13px;">${doc.name}${typeLabel}</b>
      </div>
      ${previewHtml}
    </div>
  `;

  document.getElementById('back-btn')?.addEventListener('click', () => renderDashboard());
}


function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// ── Field Vault ─────────────────────────────────────────────

function wireFieldVaultToggle() {
  document.getElementById('fields-toggle-btn')?.addEventListener('click', async () => {
    const vault = document.getElementById('fields-vault')!;
    const btn = document.getElementById('fields-toggle-btn')!;
    if (vault.style.display === 'none') {
      vault.innerHTML = await renderFieldVault();
      vault.style.display = 'block';
      btn.textContent = 'Hide Saved Fields';
      wireFieldEdits();
    } else {
      vault.style.display = 'none';
      btn.textContent = 'View Saved Fields';
    }
  });
}

/** Wire change listeners on all editable field inputs in the vault */
function wireFieldEdits() {
  document.querySelectorAll('.field-edit').forEach((input) => {
    input.addEventListener('change', async (e) => {
      const el = e.target as HTMLInputElement;
      const formKey = el.dataset.form;
      const fieldName = el.dataset.field;
      if (!formKey || !fieldName) return;

      const newVal = el.value;

      // PII fields update the vault, not fieldMaps
      const piiFields: Record<string, (pii: LocalPII, val: string) => void> = {
        'pos:primaryFirstName': (p, v) => { p.primary.firstName = v; },
        'pos:primaryLastName': (p, v) => { p.primary.lastName = v; },
        'pos:primarySSN': (p, v) => { p.primary.ssn = v; },
        'txtSpFirstName': (p, v) => { if (p.spouse) p.spouse.firstName = v; },
        'txtSpLastName': (p, v) => { if (p.spouse) p.spouse.lastName = v; },
        'txtSpSSN': (p, v) => { if (p.spouse) p.spouse.ssn = v; },
        'txtAddress1': (p, v) => { p.address.street = v; },
        'txtCity': (p, v) => { p.address.city = v; },
        'cboState': (p, v) => { p.address.state = v; },
        'txtZip': (p, v) => { p.address.zip = v; },
      };

      if (piiFields[fieldName]) {
        const pii = getPII();
        if (pii) {
          piiFields[fieldName](pii, newVal);
          await savePIIToVault(pii);
        }
      } else {
        // Update fieldMaps in chrome.storage
        const data = await chrome.storage.local.get('fieldMaps');
        const fieldMaps = data.fieldMaps as Record<string, Record<string, string | number>> | undefined;
        if (fieldMaps && fieldMaps[formKey]) {
          // Preserve number type if the value looks numeric
          const numVal = parseFloat(newVal.replace(/,/g, ''));
          fieldMaps[formKey][fieldName] = isNaN(numVal) ? newVal : numVal;
          await chrome.storage.local.set({ fieldMaps });
        }
      }

      showProfileSaved();
    });
  });
}

function formatFieldValue(fieldName: string, value: string | number): string {
  const s = String(value);
  if (fieldName.toLowerCase().includes('ssn') && /^\d{3}-\d{2}-\d{4}$/.test(s)) {
    return `***-**-${s.slice(-4)}`;
  }
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  return s;
}

async function renderFieldVault(): Promise<string> {
  const data = await chrome.storage.local.get(['fieldMaps']);
  const fieldMaps = data.fieldMaps as Record<string, Record<string, string | number>> | undefined;
  if (!fieldMaps || Object.keys(fieldMaps).length === 0) {
    return '<div style="font-size:12px;color:#94a3b8;text-align:center;padding:8px;">No field data saved yet.</div>';
  }

  // Merge PII from vault manager (not raw chrome.storage)
  const pii = getPII();
  const display = JSON.parse(JSON.stringify(fieldMaps)) as Record<string, Record<string, string | number>>;

  if (pii && display.form1040) {
    const f = display.form1040;
    f['pos:primaryFirstName'] = pii.primary.firstName;
    f['pos:primaryLastName'] = pii.primary.lastName;
    f['pos:primarySSN'] = pii.primary.ssn;
    if (pii.spouse) {
      f['txtSpFirstName'] = pii.spouse.firstName;
      f['txtSpLastName'] = pii.spouse.lastName;
      f['txtSpSSN'] = pii.spouse.ssn;
    }
    if (pii.address) {
      f['txtAddress1'] = pii.address.street;
      f['txtCity'] = pii.address.city;
      f['cboState'] = pii.address.state;
      f['txtZip'] = pii.address.zip;
    }
    if (pii.dependents) {
      for (let i = 0; i < Math.min(pii.dependents.length, 2); i++) {
        const dep = pii.dependents[i];
        f[`txtDepFirstName${i + 1}`] = dep.firstName;
        f[`txtDepLastName${i + 1}`] = dep.lastName;
        f[`txtDepSSN${i + 1}`] = dep.ssn;
        f[`cboDepRelation${i + 1}`] = dep.relationship;
      }
    }
  }

  let totalFields = 0;
  let html = '<div class="fields-section">';

  for (const [formKey, fields] of Object.entries(display)) {
    const entries = Object.entries(fields);
    if (entries.length === 0) continue;
    totalFields += entries.length;
    const formLabel = FORM_LABEL_MAP[formKey] ?? formKey;

    html += `<div class="fields-form-group">`;
    html += `<div class="fields-form-header">${formLabel}<span class="field-count">(${entries.length})</span></div>`;
    for (const [fieldName, value] of entries) {
      const label = FIELD_LABELS[fieldName] ?? fieldName;
      const rawVal = String(value);
      const isSsn = fieldName.toLowerCase().includes('ssn');
      const inputType = isSsn ? 'password' : 'text';
      html += `<div class="field-row">
        <span class="field-label">${label}</span>
        <input class="field-value field-edit" type="${inputType}" value="${escapeAttr(rawVal)}" data-form="${formKey}" data-field="${fieldName}" />
      </div>`;
    }
    html += '</div>';
  }

  html += '</div>';
  return `<div style="font-size:11px;color:#94a3b8;text-align:center;margin-top:2px;">${totalFields} fields across ${Object.keys(display).length} forms — click any value to edit</div>${html}`;
}

// ── Helpers ─────────────────────────────────────────────────

function supportBanner(): string {
  return `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;margin-top:8px;text-align:center;">
      <div style="font-size:12px;color:#92400e;font-weight:600;margin-bottom:4px;">Forms filled!</div>
      <div style="font-size:11px;color:#78350f;margin-bottom:8px;">You shouldn't need to pay a corporation hundreds of dollars to file your own taxes. Help us build the alternative.</div>
      <a href="https://buymeacoffee.com/selftax" target="_blank" rel="noopener"
        style="display:inline-block;background:#FFDD00;color:#000;font-size:12px;font-weight:600;padding:6px 16px;border-radius:6px;text-decoration:none;">
        Buy Me a Coffee
      </a>
    </div>
  `;
}

function returnCard(ret: SavedReturn): string {
  const statusLabel = FILING_STATUS_LABELS[ret.filingStatus] ?? ret.filingStatus;
  const amount = Math.abs(ret.refundOrOwed).toLocaleString();
  const amountClass = ret.isRefund ? 'refund' : 'owed';
  const amountLabel = ret.isRefund ? `Refund: $${amount}` : `Owed: $${amount}`;

  return `
    <div class="return-card">
      <div class="name">${ret.name}</div>
      <div class="detail">${ret.taxYear} - ${statusLabel}</div>
      <div class="${amountClass}">${amountLabel}</div>
    </div>
  `;
}

init().catch((err) => {
  content.innerHTML = `<div class="status error" style="margin:20px 0;text-align:left;font-size:11px;">
    <b>Error:</b> ${err instanceof Error ? err.message : String(err)}
  </div>`;
});
