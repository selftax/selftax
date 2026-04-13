/**
 * @jest-environment jsdom
 */
/**
 * Spec: Profile Page — Filing Info Collection
 *
 * Status: hypothesis
 * Confirm: Users can enter personal info, filing status, dependents, and state
 *          of residence. All data stored locally via Zustand. Privacy notice shown.
 * Invalidate: Form is too complex for a single page
 *
 * Covers:
 * - Profile store: setProfile, setFilingStatus, addDependent, removeDependent, setStateOfResidence
 * - ProfilePage renders all form sections (personal info, address, filing status, dependents)
 * - Filing status radio buttons
 * - Dependent add/remove
 * - State of residence dropdown
 * - Privacy notice displayed
 * - Navigation to /documents
 */

import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { useProfileStore } from '@selftax/web/stores/profileStore';
import ProfilePage from '@selftax/web/pages/ProfilePage';

describe('Profile Page — Filing Info Collection', () => {
  beforeEach(() => {
    useProfileStore.getState().reset();
  });

  describe('Profile store (Zustand)', () => {
    test('initializes with empty profile', () => {
      const state = useProfileStore.getState();
      expect(state.profile.firstName).toBe('');
      expect(state.profile.lastName).toBe('');
      expect(state.profile.ssn).toBe('');
      expect(state.profile.dateOfBirth).toBe('');
      expect(state.profile.address.street).toBe('');
      expect(state.profile.address.city).toBe('');
      expect(state.profile.address.state).toBe('');
      expect(state.profile.address.zip).toBe('');
      expect(state.filingStatus).toBe('single');
      expect(state.stateOfResidence).toBe('');
      expect(state.dependents).toEqual([]);
    });

    test('setProfile updates partial profile fields', () => {
      act(() => {
        useProfileStore.getState().setProfile({
          firstName: 'Jane',
          lastName: 'Doe',
        });
      });
      const state = useProfileStore.getState();
      expect(state.profile.firstName).toBe('Jane');
      expect(state.profile.lastName).toBe('Doe');
      expect(state.profile.ssn).toBe(''); // unchanged
    });

    test('setProfile updates nested address fields', () => {
      act(() => {
        useProfileStore.getState().setProfile({
          address: { street: '123 Main St', city: 'Anytown', state: 'CA', zip: '90210' },
        });
      });
      const addr = useProfileStore.getState().profile.address;
      expect(addr.street).toBe('123 Main St');
      expect(addr.city).toBe('Anytown');
      expect(addr.state).toBe('CA');
      expect(addr.zip).toBe('90210');
    });

    test('setFilingStatus changes filing status', () => {
      act(() => {
        useProfileStore.getState().setFilingStatus('mfj');
      });
      expect(useProfileStore.getState().filingStatus).toBe('mfj');

      act(() => {
        useProfileStore.getState().setFilingStatus('hoh');
      });
      expect(useProfileStore.getState().filingStatus).toBe('hoh');
    });

    test('setStateOfResidence changes state', () => {
      act(() => {
        useProfileStore.getState().setStateOfResidence('CA');
      });
      expect(useProfileStore.getState().stateOfResidence).toBe('CA');
    });

    test('addDependent adds a dependent with empty fields', () => {
      act(() => {
        useProfileStore.getState().addDependent();
      });
      const deps = useProfileStore.getState().dependents;
      expect(deps).toHaveLength(1);
      expect(deps[0].firstName).toBe('');
      expect(deps[0].lastName).toBe('');
      expect(deps[0].ssn).toBe('');
      expect(deps[0].relationship).toBe('');
    });

    test('removeDependent removes by index', () => {
      act(() => {
        useProfileStore.getState().addDependent();
        useProfileStore.getState().addDependent();
      });
      expect(useProfileStore.getState().dependents).toHaveLength(2);

      act(() => {
        useProfileStore.getState().removeDependent(0);
      });
      expect(useProfileStore.getState().dependents).toHaveLength(1);
    });

    test('updateDependent updates fields at given index', () => {
      act(() => {
        useProfileStore.getState().addDependent();
        useProfileStore.getState().updateDependent(0, { firstName: 'Junior', lastName: 'Doe' });
      });
      const dep = useProfileStore.getState().dependents[0];
      expect(dep.firstName).toBe('Junior');
      expect(dep.lastName).toBe('Doe');
    });

    test('reset clears all profile data', () => {
      act(() => {
        useProfileStore.getState().setProfile({ firstName: 'Jane' });
        useProfileStore.getState().setFilingStatus('mfj');
        useProfileStore.getState().addDependent();
        useProfileStore.getState().setStateOfResidence('CA');
      });

      act(() => {
        useProfileStore.getState().reset();
      });

      const state = useProfileStore.getState();
      expect(state.profile.firstName).toBe('');
      expect(state.filingStatus).toBe('single');
      expect(state.dependents).toEqual([]);
      expect(state.stateOfResidence).toBe('');
    });
  });

  describe('ProfilePage rendering', () => {
    test('renders all form sections', () => {
      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>,
      );

      // Personal info section
      expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/social security/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/date of birth/i)).toBeInTheDocument();

      // Address section
      expect(screen.getByLabelText(/street/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^city/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^state$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/zip/i)).toBeInTheDocument();

      // Filing status section
      expect(screen.getByLabelText(/single/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/married filing jointly/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/married filing separately/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/head of household/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/qualifying widow/i)).toBeInTheDocument();

      // State of residence
      expect(screen.getByLabelText(/state of residence/i)).toBeInTheDocument();

      // Continue button
      expect(screen.getByText(/continue to upload documents/i)).toBeInTheDocument();
    });

    test('shows privacy notice about local-only storage', () => {
      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>,
      );

      expect(screen.getByTestId('privacy-notice')).toBeInTheDocument();
      expect(screen.getByTestId('privacy-notice')).toHaveTextContent(/stored locally/i);
    });
  });

  describe('Filing status selection', () => {
    test('selecting a filing status updates the store', () => {
      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>,
      );

      const mfjRadio = screen.getByLabelText(/married filing jointly/i);
      fireEvent.click(mfjRadio);
      expect(useProfileStore.getState().filingStatus).toBe('mfj');
    });

    test('filing status radio buttons are mutually exclusive', () => {
      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>,
      );

      const single = screen.getByLabelText(/single/i) as HTMLInputElement;
      const mfj = screen.getByLabelText(/married filing jointly/i) as HTMLInputElement;

      expect(single.checked).toBe(true); // default
      fireEvent.click(mfj);
      expect(mfj.checked).toBe(true);
      expect(single.checked).toBe(false);
    });
  });

  describe('Dependent add/remove', () => {
    test('clicking Add Dependent adds a dependent form row', () => {
      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>,
      );

      const addBtn = screen.getByTestId('add-dependent');
      fireEvent.click(addBtn);

      expect(screen.getByTestId('dependent-row-0')).toBeInTheDocument();
    });

    test('clicking Remove removes a dependent row', () => {
      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>,
      );

      const addBtn = screen.getByTestId('add-dependent');
      fireEvent.click(addBtn);
      expect(screen.getByTestId('dependent-row-0')).toBeInTheDocument();

      const removeBtn = screen.getByTestId('remove-dependent-0');
      fireEvent.click(removeBtn);
      expect(screen.queryByTestId('dependent-row-0')).not.toBeInTheDocument();
    });

    test('dependent fields update the store', () => {
      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByTestId('add-dependent'));
      const row = screen.getByTestId('dependent-row-0');

      const firstNameInput = within(row).getByPlaceholderText(/first name/i);
      fireEvent.change(firstNameInput, { target: { value: 'Junior' } });

      expect(useProfileStore.getState().dependents[0].firstName).toBe('Junior');
    });
  });

  describe('Personal info and address', () => {
    test('typing in personal info fields updates the store', () => {
      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>,
      );

      fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Jane' } });
      fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Doe' } });
      fireEvent.change(screen.getByLabelText(/social security/i), { target: { value: '000-00-0000' } });

      const state = useProfileStore.getState();
      expect(state.profile.firstName).toBe('Jane');
      expect(state.profile.lastName).toBe('Doe');
      expect(state.profile.ssn).toBe('000-00-0000');
    });

    test('typing in address fields updates the store', () => {
      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>,
      );

      fireEvent.change(screen.getByLabelText(/street/i), { target: { value: '123 Main St' } });
      fireEvent.change(screen.getByLabelText(/^city/i), { target: { value: 'Anytown' } });
      fireEvent.change(screen.getByLabelText(/zip/i), { target: { value: '90210' } });

      const addr = useProfileStore.getState().profile.address;
      expect(addr.street).toBe('123 Main St');
      expect(addr.city).toBe('Anytown');
      expect(addr.zip).toBe('90210');
    });
  });

  describe('State of residence', () => {
    test('selecting a state updates the store', () => {
      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>,
      );

      const dropdown = screen.getByLabelText(/state of residence/i);
      fireEvent.change(dropdown, { target: { value: 'CA' } });
      expect(useProfileStore.getState().stateOfResidence).toBe('CA');
    });

    test('dropdown includes all 50 states plus DC', () => {
      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>,
      );

      const dropdown = screen.getByLabelText(/state of residence/i) as HTMLSelectElement;
      // 51 state options + 1 placeholder = 52
      const options = dropdown.querySelectorAll('option');
      expect(options.length).toBe(52);
    });
  });

  describe('Navigation', () => {
    test('Continue button links to /documents', () => {
      render(
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>,
      );

      const continueLink = screen.getByText(/continue to upload documents/i);
      expect(continueLink.closest('a')).toHaveAttribute('href', '/documents');
    });
  });
});
