import { create } from 'zustand';
import type { UserProfile } from '@selftax/core';
import type { FilingStatus } from '@selftax/core';

export interface Dependent {
  firstName: string;
  lastName: string;
  ssn: string;
  relationship: string;
  dateOfBirth?: string;
}

interface ProfileState {
  profile: UserProfile;
  filingStatus: FilingStatus;
  stateOfResidence: string;
  dependents: Dependent[];
}

interface ProfileActions {
  setProfile: (partial: Partial<UserProfile>) => void;
  setFilingStatus: (status: FilingStatus) => void;
  setStateOfResidence: (state: string) => void;
  addDependent: () => void;
  removeDependent: (index: number) => void;
  updateDependent: (index: number, partial: Partial<Dependent>) => void;
  reset: () => void;
}

const emptyProfile: UserProfile = {
  ssn: '',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  address: {
    street: '',
    city: '',
    state: '',
    zip: '',
  },
};

const initialState: ProfileState = {
  profile: { ...emptyProfile, address: { ...emptyProfile.address } },
  filingStatus: 'single',
  stateOfResidence: '',
  dependents: [],
};

export const useProfileStore = create<ProfileState & ProfileActions>((set) => ({
  ...initialState,

  setProfile: (partial) =>
    set((state) => ({
      profile: {
        ...state.profile,
        ...partial,
        address: partial.address
          ? { ...state.profile.address, ...partial.address }
          : state.profile.address,
      },
    })),

  setFilingStatus: (status) => set({ filingStatus: status }),

  setStateOfResidence: (stateCode) => set({ stateOfResidence: stateCode }),

  addDependent: () =>
    set((state) => ({
      dependents: [
        ...state.dependents,
        { firstName: '', lastName: '', ssn: '', relationship: '' },
      ],
    })),

  removeDependent: (index) =>
    set((state) => ({
      dependents: state.dependents.filter((_, i) => i !== index),
    })),

  updateDependent: (index, partial) =>
    set((state) => ({
      dependents: state.dependents.map((dep, i) =>
        i === index ? { ...dep, ...partial } : dep,
      ),
    })),

  reset: () =>
    set({
      profile: { ...emptyProfile, address: { ...emptyProfile.address } },
      filingStatus: 'single',
      stateOfResidence: '',
      dependents: [],
    }),
}));
