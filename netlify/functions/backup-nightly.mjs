// SA eBikes Operations Tools v3.12 — nightly backup.
// Netlify runs this on its schedule for the live (published) site only. It takes a checked
// snapshot of every live file into the separate backup store, copies any new daily archives,
// and clears out snapshots past their keep date. Success or failure is recorded, and shows on
// the home screen and in Admin.
import { getStore } from '@netlify/blobs';
import { deployContextOf, storeNames, takeSnapshot } from '../lib/backup-core.mjs';
import { APP_VERSION } from '../lib/ops-core.mjs';

export default async (req, context) => {
  const names = storeNames(deployContextOf(null, context));
  if (!names.isLive) return; // previews and branch deploys don't take nightly backups
  const live = getStore({ name: names.live, consistency: 'strong' });
  const backups = getStore({ name: names.backups, consistency: 'strong' });
  try {
    // Netlify stops a scheduled function at 30 seconds, so archive copying stops at about 18.
    const r = await takeSnapshot(live, backups, { reason: 'nightly', appVersion: APP_VERSION, budgetMs: 18000 });
    console.log('backup ok', r.id, r.archives, r.pruned);
  } catch (e) {
    if (e && e.code === 'busy') console.log('backup skipped: another backup or restore was running');
    else console.error('backup failed', e); // also recorded in the backup status
  }
};

// 16:00 UTC = 2:30 am in Adelaide in summer (1:30 am in winter).
export const config = { schedule: '0 16 * * *' };
