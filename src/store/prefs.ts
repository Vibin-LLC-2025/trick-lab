// Saved preferences (localStorage). Storage can be blocked (private mode,
// managed Chromebooks): a read then gives null and a save is dropped, and the
// choice still applies for this session. Shared by the ui and skate slices.

export const readPref = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const savePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Blocked storage: the choice still applies for this session.
  }
};
