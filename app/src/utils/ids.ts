const BASE36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** 6 chars [0-9A-Z], generated on the phone and shared with the SMS format. */
export function newShortId(): string {
  let id = '';
  for (let i = 0; i < 6; i++) id += BASE36[Math.floor(Math.random() * 36)];
  return id;
}

/** UUID v4; makes report retries idempotent on the backend. */
export function newClientId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
