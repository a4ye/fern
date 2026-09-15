// Shared input limits live apart from the server validation schemas so client
// components can enforce native input bounds without shipping Zod.
export const LIST_NAME_MAX = 80;
export const LIST_DESCRIPTION_MAX = 280;

export const COMPANY_MAX = 120;
export const ROLE_MAX = 160;
export const LOCATION_MAX = 120;
export const PAY_MAX = 80;
export const URL_MAX = 2048;

export const APPLIED_MIN_YEAR = 1990;
export const APPLIED_MIN = `${APPLIED_MIN_YEAR}-01-01`;

export const NOTES_MAX = 4000;
export const AMOUNT_INPUT_MAX = 16;
export const DISPLAY_NAME_MAX = 80;
