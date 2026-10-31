import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Language, MedicalProfile } from '../types';
import { useDriveStore } from './useDriveStore';

interface ProfileState {
  language: Language;
  onboarded: boolean;
  profile: MedicalProfile;
  setLanguage: (language: Language) => void;
  setProfile: (patch: Partial<MedicalProfile>) => void;
  finishOnboarding: () => void;
  /** Back to a first launch: onboarding pending, empty profile. */
  resetForFirstUse: () => void;
}

export const EMPTY_PROFILE: MedicalProfile = {
  name: '',
  age: null,
  sex: null,
  blood: null,
  conditions: [],
  allergies: [],
  conditionOther: '',
  allergyOther: '',
  contact: '',
  contactName: '',
  photoUri: null,
  photoUrl: null,
};

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      language: 'fr',
      onboarded: false,
      profile: EMPTY_PROFILE,
      setLanguage: (language) => set({ language }),
      resetForFirstUse: () => set({ onboarded: false, profile: EMPTY_PROFILE }),
      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      // Onboarding done: land on the home with crash detection already running (Drive mode on)
      finishOnboarding: () => {
        useDriveStore.getState().setOn(true);
        set({ onboarded: true });
      },
    }),
    {
      name: 'profile',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      // onboarded is not saved: each launch shows the welcome, permissions and profile pages first
      partialize: (s) => ({ language: s.language, profile: s.profile }) as ProfileState,
      // Force onboarded to false on every hydration so the app always starts with onboarding
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<ProfileState>),
        onboarded: false,
      }),
      // v0 had a Darija option ('dz') that was removed; v1 had no profile picture fields
      migrate: (persisted) => {
        const state = persisted as ProfileState;
        if ((state.language as string) === 'dz') state.language = 'ar';
        state.profile = { ...EMPTY_PROFILE, ...state.profile };
        return state;
      },
    },
  ),
);
