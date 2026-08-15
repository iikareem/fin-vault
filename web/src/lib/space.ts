import { api } from "./api";

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

export async function loadSpace() {
  const me = await api<{ id: string; name: string; spaces: Space[] }>("/auth/me");
  const stored = localStorage.getItem(KEY);
  const house = me.spaces.find((s) => s.kind === "HOUSE");
  const personal = me.spaces.find((s) => s.kind === "PERSONAL");
  const remembered = me.spaces.find((s) => s.householdId === stored);
  const kidsUseOwnMoney = house?.role === "MEMBER";
  const space = kidsUseOwnMoney
    ? remembered?.kind === "PERSONAL"
      ? remembered
      : (personal ?? house ?? me.spaces[0])
    : (remembered ?? house ?? personal ?? me.spaces[0]);
  if (space) setActiveSpace(space.householdId);
  return { id: me.id, name: me.name, spaces: me.spaces, space };
}
