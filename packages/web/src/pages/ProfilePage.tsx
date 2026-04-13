import { Link } from 'react-router-dom';
import { useProfileStore } from '../stores/profileStore';
import type { FilingStatus } from '@selftax/core';

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC',
] as const;

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

const FILING_STATUS_OPTIONS: { value: FilingStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'mfj', label: 'Married Filing Jointly' },
  { value: 'mfs', label: 'Married Filing Separately' },
  { value: 'hoh', label: 'Head of Household' },
  { value: 'qw', label: 'Qualifying Widow(er)' },
];

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

const labelClass = 'mb-1 block text-sm font-medium text-gray-700';

export default function ProfilePage() {
  const {
    profile,
    filingStatus,
    stateOfResidence,
    dependents,
    setProfile,
    setFilingStatus,
    setStateOfResidence,
    addDependent,
    removeDependent,
    updateDependent,
  } = useProfileStore();

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-2xl font-bold">Your Filing Information</h1>
      <p className="mb-6 text-gray-600">
        Enter your personal details and filing information. This is used to fill your tax forms.
      </p>

      {/* Privacy Notice */}
      <div
        data-testid="privacy-notice"
        className="mb-8 rounded-lg bg-green-50 p-4 text-sm text-green-800"
      >
        Your personal information is stored locally on your device and never sent to any server
        or AI model. Only anonymized financial data is shared for tax guidance.
      </div>

      {/* Personal Info */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Personal Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className={labelClass}>First Name</label>
            <input
              id="firstName"
              type="text"
              className={inputClass}
              value={profile.firstName}
              onChange={(e) => setProfile({ firstName: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="lastName" className={labelClass}>Last Name</label>
            <input
              id="lastName"
              type="text"
              className={inputClass}
              value={profile.lastName}
              onChange={(e) => setProfile({ lastName: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="ssn" className={labelClass}>Social Security Number</label>
            <input
              id="ssn"
              type="text"
              className={inputClass}
              placeholder="000-00-0000"
              value={profile.ssn}
              onChange={(e) => setProfile({ ssn: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="dob" className={labelClass}>Date of Birth</label>
            <input
              id="dob"
              type="date"
              className={inputClass}
              value={profile.dateOfBirth}
              onChange={(e) => setProfile({ dateOfBirth: e.target.value })}
            />
          </div>
        </div>
      </section>

      {/* Address */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Address</h2>
        <div className="mb-4">
          <label htmlFor="street" className={labelClass}>Street Address</label>
          <input
            id="street"
            type="text"
            className={inputClass}
            value={profile.address.street}
            onChange={(e) => setProfile({ address: { ...profile.address, street: e.target.value } })}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="city" className={labelClass}>City</label>
            <input
              id="city"
              type="text"
              className={inputClass}
              value={profile.address.city}
              onChange={(e) => setProfile({ address: { ...profile.address, city: e.target.value } })}
            />
          </div>
          <div>
            <label htmlFor="addrState" className={labelClass}>State</label>
            <select
              id="addrState"
              className={inputClass}
              value={profile.address.state}
              onChange={(e) => setProfile({ address: { ...profile.address, state: e.target.value } })}
            >
              <option value="">Select...</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="zip" className={labelClass}>ZIP Code</label>
            <input
              id="zip"
              type="text"
              className={inputClass}
              value={profile.address.zip}
              onChange={(e) => setProfile({ address: { ...profile.address, zip: e.target.value } })}
            />
          </div>
        </div>
      </section>

      {/* Filing Status */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Filing Status</h2>
        <div className="space-y-2">
          {FILING_STATUS_OPTIONS.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="filingStatus"
                value={value}
                checked={filingStatus === value}
                onChange={() => setFilingStatus(value)}
                className="h-4 w-4 text-blue-600"
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* State of Residence */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">State of Residence</h2>
        <label htmlFor="stateOfResidence" className={labelClass}>
          State of Residence
        </label>
        <select
          id="stateOfResidence"
          className={inputClass}
          value={stateOfResidence}
          onChange={(e) => setStateOfResidence(e.target.value)}
        >
          <option value="">Select your state...</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>{STATE_NAMES[s]}</option>
          ))}
        </select>
      </section>

      {/* Dependents */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Dependents</h2>
        {dependents.length === 0 && (
          <p className="mb-4 text-sm text-gray-500">No dependents added yet.</p>
        )}
        <div className="space-y-4">
          {dependents.map((dep, index) => (
            <div
              key={index}
              data-testid={`dependent-row-${index}`}
              className="rounded-lg border border-gray-200 p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  Dependent {index + 1}
                </span>
                <button
                  data-testid={`remove-dependent-${index}`}
                  onClick={() => removeDependent(index)}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="First Name"
                  className={inputClass}
                  value={dep.firstName}
                  onChange={(e) => updateDependent(index, { firstName: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Last Name"
                  className={inputClass}
                  value={dep.lastName}
                  onChange={(e) => updateDependent(index, { lastName: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="SSN (000-00-0000)"
                  className={inputClass}
                  value={dep.ssn}
                  onChange={(e) => updateDependent(index, { ssn: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Relationship"
                  className={inputClass}
                  value={dep.relationship}
                  onChange={(e) => updateDependent(index, { relationship: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          data-testid="add-dependent"
          onClick={() => addDependent()}
          className="mt-4 rounded-lg border border-dashed border-gray-400 px-4 py-2 text-sm text-gray-600 hover:border-blue-500 hover:text-blue-600"
        >
          + Add Dependent
        </button>
      </section>

      {/* Navigation */}
      <div className="flex items-center gap-4">
        <Link
          to="/"
          className="rounded-lg bg-gray-200 px-6 py-3 text-gray-700 hover:bg-gray-300"
        >
          Back
        </Link>
        <Link
          to="/documents"
          className="rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
        >
          Continue to Upload Documents
        </Link>
      </div>
    </div>
  );
}
