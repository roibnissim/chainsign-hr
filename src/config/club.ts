/** Single-club v1 — ready for multi-tenant later */
export const DEFAULT_CLUB_ID = 'asa-tlv';

export function getClubId(): string {
  const fromEnv = import.meta.env.VITE_CLUB_ID as string | undefined;
  return (fromEnv && fromEnv.trim()) || DEFAULT_CLUB_ID;
}

export function clubPath(...segments: string[]): string {
  return ['clubs', getClubId(), ...segments].join('/');
}
