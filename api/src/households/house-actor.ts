export const HOUSE_ACTOR = { id: 'house', name: 'House' } as const;

export function actorForSpace<T extends { user: { id: string; name: string } }>(
  kind: string,
  row: T,
): T {
  if (kind !== 'HOUSE') return row;
  return { ...row, user: { id: HOUSE_ACTOR.id, name: HOUSE_ACTOR.name } };
}
