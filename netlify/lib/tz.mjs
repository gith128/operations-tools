// SA eBikes Operations Tools v3.10: the business's time zone, for "today", hire days and 8 am openings.
// Set per installation with the Netlify environment variable SAEBIKES_TIMEZONE (an IANA name, such as
// Australia/Adelaide or Pacific/Auckland). It's read once when the server starts, so working out
// "today" never needs a storage read. Unset or unknown: Australia/Adelaide.
function valid(tz) { try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); return true; } catch { return false; } }
const env = (typeof process !== 'undefined' && process.env && process.env.SAEBIKES_TIMEZONE) || '';
export const TZ = env && valid(env) ? env : 'Australia/Adelaide';
