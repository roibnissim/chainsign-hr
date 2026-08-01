import { defineString } from 'firebase-functions/params';

export const clubIdParam = defineString('CLUB_ID', { default: 'asa-tlv' });

export function clubId() {
  return clubIdParam.value() || 'asa-tlv';
}
