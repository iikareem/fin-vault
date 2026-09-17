import { api } from "./api";
import { HOUSE_BOOKS_ENABLED } from "./features";

export type Space = {
  householdId: string;
  name: string;
  kind: "PERSONAL" | "HOUSE";
  currency: string;
  role: "ADMIN" | "MEMBER";
};

const KEY = "fb_space";

export function householdPath(householdId: string, path: string) {
  return `/households/${householdId}${path}`;
}

export function setActiveSpace(id: string) {
  localStorage.setItem(KEY, id);
}

export function personalSpace(spaces: Space[]) {
  return spaces.find((s) => s.kind === "PERSONAL") ?? null;
}

/** House books UI is off, or this member is personal-only (non-admin). */
export function isPersonalOnly(spaces: Space[]) {
  if (!HOUSE_BOOKS_ENABLED) return true;
  const house = spaces.find((s) => s.kind === "HOUSE");
  return !!house && house.role === "MEMBER";
}

export async function loadSpace() {
  const me = await api<{
    id: string;
    name: string;
    preferredCurrency?: string;
    theme?: string;
    spaces: Space[];
  }>("/auth/me");
  const stored = localStorage.getItem(KEY);
  const house = me.spaces.find((s) => s.kind === "HOUSE");
  const personal = me.spaces.find((s) => s.kind === "PERSONAL");
  const remembered = me.spaces.find((s) => s.householdId === stored);
  const personalOnly = isPersonalOnly(me.spaces);

  let space: Space | undefined;
  if (personalOnly) {
    space =
      remembered?.kind === "PERSONAL"
        ? remembered
        : (personal ?? house ?? me.spaces[0]);
  } else {
    // Default to personal; still honor a remembered house choice when house UI is on.
    space = remembered ?? personal ?? house ?? me.spaces[0];
  }

  if (space) setActiveSpace(space.householdId);
  return {
    id: me.id,
    name: me.name,
    preferredCurrency: me.preferredCurrency,
    theme: me.theme,
    spaces: me.spaces,
    space,
    personalOnly,
  };
}
