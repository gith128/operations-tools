# SA eBikes Operations Tools v3.10

## New in v3.10: Business settings, and Admin in two areas

**Before deploying:** **Admin → Backups → Back up now**.

**Rolling back is safe.** Publish the v3.9.1 deploy in Netlify. The business details are added to `app-settings` alongside what's there, and v3.9.1 ignores them. After a rollback, pages show the old greens and the "SA eBikes" text heading until v3.10 is back.

**Nothing to set in Netlify for SA eBikes.** `SAEBIKES_TIMEZONE` is only for an installation outside Adelaide's time zone (an IANA name such as `Pacific/Auckland`); unset, it's Australia/Adelaide as before.

### What changes for staff

- **The SA eBikes look on every page:** the bike from the logo beside "SA eBikes" in **Baloo Bhai 2 ExtraBold**, and the two greens.
    - **#415b30 (dark olive):** buttons and green text. White text on it is 7.6 : 1, against 2.5 : 1 for the old green, so it's much easier to read in sun.
    - **#5fd64f (bright green):** the good-scan flash, the live light, the edge on good scans in the last-scans strip, and the bars on the Dashboard and Fleet report. It's never used under text.

  Amber and red are unchanged.
- Nothing else changes in how anything works.

### Business settings (Admin → Configuration → Business)

- **What's set here:** name, tagline, logo, main and highlight colours, heading font (Baloo Bhai 2 or the app's own font) and country.
    - **The logo** is uploaded from the phone or computer, shrunk there to about 50 KB at most (at most 256 pixels on its longer side), and stored with the settings. There's also **Use the standard logo** (`public/assets/brand/logo.png`, the bike from the SA eBikes logo) or **No logo**, and a switch to hide the name beside a logo that already includes it.
    - **A live preview** shows a button, green text and a bar in the chosen colours. It warns when white text on the main colour would be below 4.5 : 1.
- **The country** is used to read local phone numbers (AU as before; for another country, numbers without a country code are read as that country's).
- **The time zone** is shown here, set per installation by `SAEBIKES_TIMEZONE` (`netlify/lib/tz.mjs`). It's the one setting the server needs before reading any data, so working out "today" never costs a storage read. 8 am openings for fleet records now work for any time zone, not only Adelaide's two offsets.
- **Upgrading needs nothing:** settings saved by v3.9 have no business details, so they read as SA eBikes' values. Nothing is re-entered.

### How pages get the look without slowing down

- **One shared stylesheet and script on every page:** `public/assets/theme.css` (colours and the heading font) and `public/assets/theme.js`.
    - **Colours:** each page's own green definitions are removed, and its 170 or so fixed greens now use the shared colours.
    - **On load:** theme.js applies the business details from the copy kept on the phone, before the page draws, then fills in the header (the logo and name, with the name in Baloo Bhai 2) and the tab title.
- **No extra requests on the scanning pages:**
    - **The home screen** already fetches settings each time it opens, and refreshes the copy.
    - **Other pages** check in the background only when the copy is more than six hours old, a small `brand` view.
- **The font is kept with the app,** so it shows without signal. It's `public/assets/fonts/baloo-bhai-2-800.woff2`, 18 KB, with its free licence (SIL Open Font Licence) beside it. The Content-Security-Policy now allows fonts from the app itself (`font-src 'self'`).
    - **Cached:** the font for a year (it never changes under its name).
    - **Rechecked:** theme.css and theme.js every five minutes, like ops-client.js.
- **The business name** in exports, shared text, calendar entries, contact cards and file names now comes from the settings (for example `SA-eBikes-Issues-2026-11-09.csv`, unchanged for SA eBikes).

### Admin in two areas

`admin.html` serves both, as **⚙️ Admin** (`/admin`) and **🎨 Configuration** (`/config`), with buttons at the top to switch. The same password covers both. An old link to a Configuration card (such as `/admin#faults`) opens Configuration.

- **Admin:**
    - **People:** Team, Roster.
    - **Day to day:** Rezdy products.
    - **Fleet:** Fleet history and dashboard data.
    - **Data and safety:** Backups, Archived days.
- **Configuration:**
    - **Business**;
    - **Guests and sites:** QR codes, Message templates, Site checklists, and a note that Locations live in the Asset Register;
    - **Maintenance:** Fault types;
    - **Home screen**;
    - **Configuration file.**

### The configuration file

- **⬇ Download configuration** (`configExport`, Admin only) saves one JSON file with:
    - business details and logo;
    - fault types and repeat window;
    - home screen;
    - QR codes, message templates and site checklists;
    - locations.
- **⬆ Load a configuration file** (`configImport`) shows the parts in the file, each ticked, and takes a backup first (reason "pre-config-load"). If that backup can't finish, nothing is loaded.
    - **Most parts** replace what's there.
    - **Locations** are added or updated by code; none are removed, since bikes may be at them.
    - **Hire records, issues and the register itself** aren't touched.

  This is also how a new installation is set up.
- **In the backups,** "Configuration" is now its own restore part: `app-settings`, `qr-links`, `message-templates`, `site-checklists`. "Site checklist sign-offs" and "Rezdy products seen" are separate parts. Older backups restore the same way, by file.

### Tests and checks

- **Tests:** 106 (102 before, plus 4 in `tests/brand.test.mjs`). They cover:
    - an upgrade showing SA eBikes;
    - business details saved, checked and shown, including the logo choices, bad colours, fonts, countries and logos, stale saves, and Admin only;
    - the configuration file carried to another installation, with a backup first, locations updated and added, the register untouched, and bad files and empty choices refused;
    - Configuration restored on its own without touching issues.

  The existing fleet tests check the new time-zone-general 8 am calculation, including daylight saving.
- **Browser** (Chrome, phone size): checked
    - the home screen and Group Scanner in the new look, with the font loaded;
    - `/admin` and `/config` showing their own cards, and `/admin#faults` opening Configuration;
    - a logo upload (shrunk to 23 KB), a renamed business with new colours showing on the home screen and scanner, the configuration download, and then SA eBikes put back.
- `tests/dev-server.mjs` now serves CSS, PNG, WOFF2 and JSON with the right types, as Netlify does.

**Manual:** the Admin section describes the two areas, the Configuration page, Business settings and the configuration file. References to Fault types, Site checklists, QR codes and Home screen now say Configuration. Help and the Claude Doc are updated.

**Files:**
- **New:** `public/assets/theme.css`, `public/assets/theme.js`, `public/assets/brand/logo.png`, `public/assets/fonts/baloo-bhai-2-800.woff2`, `public/assets/fonts/OFL-Baloo-Bhai-2.txt`, `netlify/lib/tz.mjs`, `tests/brand.test.mjs`.
- **Changed:**
    - **Server:** `netlify/lib/ops-core.mjs`, `maint-core.mjs`, `fleet-core.mjs`, `backup-core.mjs`, `roster-core.mjs`.
    - **Pages:** every page (the shared theme, the name from settings), `public/assets/ops-plus.js`, `public/assets/scan.js`.
    - **Tools and docs:** `tools/build_help.py`, `docs/manual.md`, `public/help.html`.
    - **Config:** `netlify.toml` (the `/config` route, font-src, and cache rules), `tests/dev-server.mjs`, `package.json`, `package-lock.json`, this file.

# SA eBikes Operations Tools v3.9.1

## New in v3.9.1: Show QR and the full version number

A small release on top of v3.9. Deploy as usual (branch, preview, merge).

- **Show QR:**
    - **Tapping the code** (or the space around it) no longer moves on to the next one, so a guest's phone bumping the screen can't change it. **‹ Back** and **Next ›** move between codes, and so does a deliberate swipe, which needs a 50-pixel sideways move.
    - **A new button under Back, Done and Next** reads **Open** and the code's name, for example **Open SA eBikes Ride Guide ↗**, following the code shown. It opens that link in a new tab, with Show QR still open behind it.
- **The full version number on every screen.** Releases like 3.5.1 used to show as v3.5. Every page, Help and the backups now show the version exactly as released: v3.9.1 here. A release ending in .0 shows without it, so 3.10.0 shows as v3.10.
    - **Where it's checked:** `tools/check.mjs` and `tools/build_help.py` now take the version from `package.json` in full.
    - **What must match:** the page labels, `APP_VERSION`, this heading and `netlify.toml`'s first line.
    - **Backups** record the full version too.

**Tests:** 102, unchanged. Show QR was checked in a browser on two codes (tapping the code does nothing, Next moves on, and the Open button follows the code).

**Manual:** Show QR updated. Help and the Claude Doc are updated.

**Files:** `public/qr.html`, every page's version label, `public/help.html`, `docs/manual.md`, `tools/check.mjs`, `tools/build_help.py`, `netlify/lib/ops-core.mjs` (`APP_VERSION`), `package.json`, `package-lock.json`, `netlify.toml`, this file.

# SA eBikes Operations Tools v3.9

## New in v3.9: Undo and corrections

Builds on v3.8. It follows the split agreed in Phase 2: Undo within 10 seconds, a correction with initials and a reason after that, a few things not reversible, and everything else simply edited. Deploy as usual (branch, preview, merge); there's nothing to set in Netlify.

### Undo (10 seconds, one tap, no reason)

A dark bar at the bottom of the screen shows **Undo** for 10 seconds after each of these:

| Action | What Undo does |
| --- | --- |
| A bike added to a group | Takes it off as "undone"; its M-check still stands. |
| A bike checked in | Unticks it and moves it back to where it was. |
| A group marked Out or Out overnight | Puts the status back. |
| A Dandelion drop-off | Unticks the bikes, moves them back, and reopens the group. |
| An M-check pass | Voids it; the bike is due again. |

Each Undo is queued like any other change, so it works offline and in order. The trail records "↶ Undone" with the time and initials. The bar's code (`UndoBar`) is in `public/assets/ops-plus.js`.

### Corrections (initials and a reason, original kept, once per record)

A sheet (`Correct.ask`) asks for initials and a reason, and the record shows "✎ Corrected 10:42 by SO: reason".

| Correction | Where | Action |
| --- | --- | --- |
| Untick a checked-in bike | Group Scanner → Groups; moves the bike back | `checkIn` with `in: false` |
| Undo a drop-off | Group Scanner → Groups; returns the group to its status before the drop-off | `undoDropOff` |
| Restore a group deleted today | Group Scanner → Groups → Deleted today; bikes now out with another group stay with it | `restoreGroup` |
| Void an M-check signed off wrongly | Asset Register → bike → M-check history; passes only (for a fault, close its issue as logged in error); status is recalculated from the remaining checks | `voidMcheck` |
| Reopen an issue repaired by mistake | Issue Reporter; the repair is kept on the issue | `reopenIssue` |
| Close an issue as logged in error | Issue Reporter; left out of repeats, P5 time, unavailable bikes, the Dashboard and fleet records | `issueInError` |
| Restore a bike removed from the register | Asset Register → Removed bikes; the removal is marked "in error", so past days count the bike as in the fleet throughout | `restoreAsset` |

Day-level undos and corrections go in `day.corrections`, which is archived with the day. The others are kept on their own records: `issue.corrections`, `check.voided`, and the register history's `restored` entry.

### Not reversible here

These are said on screen or in the manual: loading a manifest (already warned), Reset day (its confirmation now says so), a message already sent, and site checklist sign-offs (sign again).

### Data

- **New fields only, no migration.** One new remove reason, `undone`, is treated like "scanned by mistake" for M-checks.
- **Exports:** the issues CSV shows "logged in error" and "reopened", the M-check log has a Voided column, and the bike history includes corrections.

### Tests and checks

- **Tests:** 102 (94 before, plus 8 in `tests/undo.test.mjs`). They cover:
    - undoing an added bike, with its M-check standing;
    - a check-in undone and corrected, with the bike moved back and the trail recorded;
    - a drop-off undone once, with the reason required for a correction;
    - Out undone;
    - a deleted group restored, with a bike now out elsewhere left alone;
    - an M-check voided (due again, only passes, a retry is safe);
    - an issue reopened and an issue closed in error, both once only and out of repeats and unavailable bikes;
    - a removed bike restored.
- **Browser** (Chrome, phone size): checked the Undo bar after adding a bike, the bike taken off as undone, restoring a deleted group through the correction sheet, and reopening an issue.

**Manual:** a new "Undo and corrections" section in Getting started. Help and the Claude Doc are updated, and the issuing guide covers the Undo bar.

**Files:**
- **New:** `tests/undo.test.mjs`.
- **Changed:** `netlify/lib/ops-core.mjs`, `netlify/lib/maint-core.mjs`, `netlify/lib/fleet-core.mjs`, `public/assets/ops-plus.js`, `public/scanner.html`, `public/issues.html`, `public/fleet.html`, `public/bike.html`, `public/help.html`, the version label on every page, `docs/manual.md`, `package.json`, `package-lock.json`, `netlify.toml`, this file.

# SA eBikes Operations Tools v3.8

## New in v3.8: Phase 2 scanning

Builds on v3.7. This release is all on the Group Scanner, as agreed in Phase 2 (sounds on by default, an unregistered barcode asks first). Deploy as usual (branch, preview, merge); there's nothing to set in Netlify.

### What changes

- **Sounds and vibration:** one short beep for OK, two for a warning, a low tone for refused, and a buzz on Android (iPhones can't vibrate for a web page). They're on by default, with **🔊 Sounds on / 🔇 Sounds off** under Start Scanning for each phone (`saeb-sound`).
    - **Where they play:** issuing, checking in and opening an M-check.
    - **First tap:** the sound is woken by tapping Start Scanning or adding by hand, as phones require.
    - **iPhone silent switch:** silences them.
    - **Code:** `OpsScan.feedback` in `public/assets/scan.js`, so other camera screens can use it later.
- **Last scans:** the last three results stay above the camera (time, bike, what happened), coloured green, amber or red.
- **A bike still out with another group is refused on the spot,** naming the group: "EB-010 is still out with Smith (x2). Check it in, or take it off that group, first."
    - **On the phone:** refused before the scan is sent.
    - **On the server:** refused too, with code `out-elsewhere`, so two phones can't issue the same bike to two groups at once.
    - **What it replaces:** the old amber "also in" warning, after which the bike was added anyway.
    - **Offline scans:** a scan saved offline and refused later appears in the refused list with that message.
- **An unregistered barcode asks first:** "ZZ-999 isn't a registered bike… Add anyway / Cancel". Registered bikes scan as before.
    - **While the question is open,** the camera ignores what it sees.
    - **An empty register** (or one not loaded yet) skips the question, so a new installation still works.
- **Camera handling (Group Scanner):**
    - **Type the ID:** "Can't read it? Type the bike ID below" appears after 6 seconds without a read.
    - **Battery:** the camera stops after 3 minutes without a scan, and the box says why.
    - **Leaving the page:** a phone call, another app or the lock screen stops the camera, and returning starts it again (no frozen camera).
    - **Plain errors:** if the camera won't start, the box explains it for that phone: blocked for the site (with iPhone or Android steps), in use by another app, or not found. The Issue Reporter and Asset Register show the same explanations.
- **The Dandelion drop-off sheet** lists exactly which bikes will be marked dropped and which are already checked in. One button confirms, for example "Mark 2 bikes dropped at Dandelion Wines". It replaces the count-only question.

### Tests and checks

- **Tests:** 94. Three existing tests now expect a bike still out with another group to be refused (code `out-elsewhere`, with the group named) rather than added with a warning. One M-check test checks a bike in before reissuing it.
- **Browser** (Chrome, phone size, fake camera): checked
    - the refusal of a bike out with another group;
    - the unregistered barcode question;
    - the last-scans strip;
    - the 6-second hint;
    - the camera stopping when the page is hidden and restarting when it's back;
    - the drop-off sheet;
    - the sound switch.
- **Needs real phones before merging** (it can't be tested here):
    - whether the beeps play on the iPhone 13 and 15 with the ringer on, and stay silent with the silent switch;
    - the buzz on an Android;
    - the camera restarting after a phone call.

**Manual:** the Group Scanner section (last scans, sounds, the camera, the new red "still out with" refusal, the unregistered question, the drop-off sheet), the issuing SOP and troubleshooting are updated. Help, the Claude Doc and the issuing guide are updated too.

**Files:** `public/scanner.html`, `public/assets/scan.js`, `public/issues.html` and `public/fleet.html` (camera messages), `netlify/lib/ops-core.mjs`, `tests/core.test.mjs`, `public/help.html`, `docs/manual.md`, the version label on every page, `package.json`, `package-lock.json`, `netlify.toml`, this file.

# SA eBikes Operations Tools v3.7

## New in v3.7: maintenance

Builds on v3.6. Deploy as usual (branch, preview, merge); there's nothing to set in Netlify.

### What it does

- **Fault types**, set in **Admin → Fault types**. Issues are logged with one or more types (chips on the Report tab, required, **Other** if none fits).
    - **M-check failures** get their types from the items that failed: front or rear wheel → Tyres and wheels, steering or frame → Frame, fork and steering, drive → Gears, chain and pedals, and so on (`MCHECK_FAULT` in `netlify/lib/maint-core.mjs`).
    - **Editing in Admin:** rename in place (the id stays, so old issues follow the new name), add, reorder, retire or bring back. A type is never deleted: one left out of a save is kept, retired.
    - **Older issues** have no type. Anyone can set it in an update, and a fault type change on its own needs no text.
- **Repeat faults:** the same fault type logged again on the same bike within the repeat window (90 days to start, 7 to 365, set in Admin). They show:
    - **when logging:** an amber box with the earlier issue and whether it was repaired;
    - **in the Issue Reporter:** a **🔁 repeat** tag, a **🔁 Repeats** filter, and "Repeat of" in the detail;
    - **in exports and reports:** the issues CSV, a **Repeat faults, this FY** section on the Dashboard, and each bike's history.
- **Bikes unavailable for hire:** an **⛔ Unavailable** filter on the Asset Register. It shows bikes out of service now (an open P5), with the day they went to P5 and how many days since, and bikes at a storage location that aren't out on hire.
- **Bike history from purchase to disposal** (`/bike?id=EB-012`), opened from **📜 Full history** on a bike's record. It brings together:
    - the details (with old IDs after a rename, and a removed bike's last copy);
    - utilisation and days out of service from the fleet records;
    - issues by fault type, with repeats;
    - month by month figures;
    - the full history: bought, register changes, moves, issues with updates and repairs, M-checks, disposal.

  **⬇ Excel** has Details, By month, History, Issues, M-checks, Moves and Daily records. **🖨 Print or save as PDF** prints the page.
- **Admin reorganised** into four groups with links at the top:
    - **People:** Team, Roster;
    - **Daily running:** Site checklists, Messages, QR codes, Home screen, Rezdy products;
    - **Fleet and maintenance:** Fault types, Fleet history;
    - **Data and safety:** Backups, Archived days.

  Card ids are unchanged, so existing links (`/admin#backups`) still work.
- **Home screen order and hidden tiles**, one setting for every phone (**Admin → Home screen**).
    - Load Manifest can't be hidden, because Admin is reached from it.
    - Hidden tools still open from their address.
    - Each phone keeps the last setting it saw, so the tiles don't jump about while the latest loads.

### Decisions made in building it (easy to change; say if any is wrong)

- **"Unavailable for hire"** is built as a view of the bikes that can't be hired: open P5s and bikes in storage. There's no separate "not for hire" switch without a fault. If you meant a way to take a bike off hire for other reasons (reserved, waiting for sale, staff use), that's a small addition: it would be refused in the scanner and counted as unavailable in the fleet records.
- **A fault type is required** for new issues. The server still accepts an issue without one, so a phone with an old page open doesn't fail.
- **Repeats are counted per bike and fault type,** and an issue can have several types. Repeats follow ID changes on the bike's history page. The Issue Reporter and Dashboard count by the ID each issue was logged under.
- **The starting fault types** follow the M-check items, plus Accessories (locks, baskets, child seats) and Other. Rename or add to suit.

### Data and backups

**New file:** `app-settings` (fault types, repeat window, home screen). It's in the nightly backups, in the "QR codes, message templates, Rezdy products seen, fault types and home screen" restore part. Without the file, everything uses the starting fault types and the original tile order.

### Tests and checks

- **Tests:** 94 (87 before, plus 7 in `tests/maint.test.mjs`). They cover:
    - fault types renamed, added, left out (kept, retired), Admin only, stale saves refused, and duplicates refused;
    - issues logged with types, and M-check failures mapped to types;
    - a fault type set by an update, with no text needed;
    - repeat detection inside and outside the window;
    - bikes unavailable now, timed from the move to P5;
    - home screen order and hiding, with Load Manifest protected;
    - a bike's history through a rename and after removal, with repeats across both IDs.
- **Browser** (Chrome, phone size): checked
    - the Report tab's fault chips and the repeat box;
    - the 🔁 Repeats filter;
    - changing a fault type in an update;
    - the ⛔ Unavailable filter;
    - a bike's history page and its Excel (opened with openpyxl);
    - saving fault types and the home screen in Admin, and the home screen following it;
    - the Dashboard's repeat faults.

**Manual:** the Issue Reporter (fault types, repeats), the Asset Register (Unavailable, Bike history), the Dashboard and Admin are updated, and Getting started covers the home screen order. Help and the Claude Doc are updated; the issuing guide's version line is updated.

**Files:**
- **New:** `netlify/lib/maint-core.mjs`, `public/bike.html`, `tests/maint.test.mjs`.
- **Changed:** `netlify/lib/ops-core.mjs`, `netlify/lib/backup-core.mjs`, `netlify/functions/*.mjs` (headers), `public/issues.html`, `public/fleet.html`, `public/admin.html`, `public/index.html`, `public/dashboard.html`, `public/help.html`, the version label on every page, `docs/manual.md`, `netlify.toml` (the `/bike` route), `tests/dev-server.mjs`, `package.json`, `package-lock.json`, this file.

# SA eBikes Operations Tools v3.6

## New in v3.6: fleet reporting

Builds on v3.5.1 (the new scanner as default), which should be merged first. Deploy as usual (branch, preview, merge); there's nothing to set in Netlify.

### What it does

- **A record per bike per day** (`fleet-days`), saved when the next manifest loads, alongside the daily summary. Each record holds:
    - the model;
    - where the bike was at 8 am;
    - its status at 8 am: hired, available, out of service (P5) or in storage;
    - for a hired bike, the location(s) it went out from, how many hires, and the day of hire.
- **Records don't change when the register does.** Days with no manifest between two loads get records too: bikes available, none hired, except bikes still out with a group that hadn't been returned.
- **Utilisation** = days hired ÷ days available, per bike, model and location, on the new **Fleet report** (`/report`). It's open to staff, read-only, and linked from the Dashboard and the Asset Register.
- **Rebuilding past days** (Admin → Fleet history and dashboard data) works from:
    - the daily archives (every copy of a day, so a reset or reload doesn't lose hires);
    - the move log, walked back from today's locations;
    - P5 periods from the issue history;
    - the register's change history.

  **Preview rebuild** saves nothing. **Save rebuild** works one month per request, to stay well inside the function time limit. A record made on the day is never replaced. Where a rebuilt record had to estimate, it's marked (`e`) and the report says how much:
    - **model:** before the change history began, a bike that wasn't scanned with its model uses today's register;
    - **location:** before the first recorded move.
- **Register change history** (`asset-history`) records every add (by hand or spreadsheet), field edit (from → to), ID change and removal, with who made it. Removed bikes keep a final copy, so past days still count them. Location stays in the move log.
    - **Saved safely:** entries are queued inside the register in the same save, then moved across. A save cut off in between is finished by the next register save, and nothing is recorded twice.
    - **Where it shows:** under **Register changes** on each bike's record, and as an Excel download on the Asset Register.
- **Exports:**
    - **Excel:** a small writer in our own code (`public/assets/xlsx-lite.js`, about 8 KB), not a library. It writes an uncompressed .xlsx, checked in Excel's format with openpyxl and LibreOffice. The workbook has a summary with definitions, By model, By bike, By location, month by month, and every daily record.
    - **PDF:** a print layout. **🖨 Print or save as PDF** uses the browser's own Save as PDF, so nothing is added to the repository.
- **Dashboard:** for days with records, each model's fleet and bikes available come from the records, so the two screens agree. The old "Build history from archives" button is replaced by the fleet rebuild, which also rebuilds the daily summaries.

### Definitions (agreed)

| Term | Meaning |
| --- | --- |
| Available | In the fleet (bought, not disposed), not on P5 at 8 am, and not at a storage location at 8 am. A hired bike always counts as available. |
| Hired | Out with a group at any time that day, including days 2 and 3 of a multi-day hire. A 4-hour hire is a day. A bike checked in, or a group returned, before the day began doesn't count for that day. |
| By location | A hired bike counts where it went out from (the group's hire location). A bike not hired counts where it was at 8 am. Home delivery shows hires only. |
| Days | Every calendar day. No manifest, or no groups, means no bikes went out. The report lists those days so a missed manifest can be spotted. |

### Data and backups

- **New files:**
    - `fleet-days`: one file, about 1 MB a year at 50 bikes, with short keys;
    - `asset-history`: capped at 20,000 entries.
- **In the nightly backups and the off-site download.** The restore parts become:
    - "Asset register, locations, move history and change history";
    - "Dashboard data and fleet records".
- **Older backups** (v3.5) simply don't have the two new files. Restoring one leaves them as they are.

### After deploying (owner)

1. **Before merging,** on the preview: **Admin → Backups → Load into this preview** to bring in live data, then **Admin → Fleet history and dashboard data → Preview rebuild**.
2. **Read the month-by-month lines.** Check that days with no manifest are days you were quiet, and that hires look right for three or four days you remember (compare with Rezdy).
3. **After merging,** run **Preview rebuild** and **Save rebuild** on the live site once.

### Tests and checks

- **Tests:** 87 (74 before, plus 13 in `tests/fleet.test.mjs`). They cover:
    - Adelaide 8 am in and out of daylight saving;
    - records written at the next load (hired, available, storage, not yet bought);
    - records unchanged by later register edits;
    - the history queue healing after a cut-off save;
    - multi-day hires;
    - days with no manifest, with a group still out;
    - a P5 logged in the afternoon;
    - the register as it stood (edits, removals and renames undone);
    - rebuild: live records kept, estimates marked, preview saves nothing, repeat runs change nothing, Admin only;
    - the report view with today so far;
    - the report's sums by bike, model and location;
    - backups including the new files;
    - the Excel file's structure and checksums.
- **Changed test:** the existing dashboard test now expects capacity from the fleet record. The trike's P5 was logged after that day, so it was available then.
- **Browser** (Chrome, phone size, 37 days of test data): checked the Fleet report in every period and view, a bike's days, the Excel download (opened with openpyxl and LibreOffice), the PDF, Admin's preview, and the Asset Register's register changes after an edit.

**Manual:** a new Fleet report section. Asset Register, Dashboard, Admin and backups are updated, and Getting started says where the report opens. Help, the Claude Doc and the issuing guide's version line are updated.

**Files:**
- **New:** `netlify/lib/fleet-core.mjs`, `public/report.html`, `public/assets/fleet-report.js`, `public/assets/xlsx-lite.js`, `tests/fleet.test.mjs`.
- **Changed:** `netlify/lib/ops-core.mjs`, `netlify/lib/backup-core.mjs`, `netlify/functions/*.mjs` (headers), `public/admin.html`, `public/dashboard.html`, `public/fleet.html`, `public/help.html`, the version label on every page, `docs/manual.md`, `netlify.toml` (the `/report` route), `tests/core.test.mjs`, `tests/dev-server.mjs`, `package.json`, `package-lock.json`, this file.


# SA eBikes Operations Tools v3.5.1

## New in v3.5.1: the new scanner is the default

Split out from v3.6 so it gets real use on the phones before the fleet reporting arrives. Deploy as usual (branch, preview, merge); there's nothing to set in Netlify.

### What changes on the phones

- **Every phone uses the new scanner** (zxing-wasm, from v2.7) unless someone on that phone chose the classic one. Phones that tapped **switch back** before keep the classic scanner (`saeb-scan-engine` = `classic`). Phones that never chose, or chose the new one, now use the new one.
- **The link under the camera** now reads **Trouble scanning? Use the classic scanner**, or **Classic scanner · Use the new scanner** on a phone set to classic.
- **It falls back to the classic scanner by itself** if the new one can't start, and says so: **Classic scanner (the new one couldn't start here)**. It tries the new one again the next time scanning starts. The fallback existed since v2.7; it's now labelled, and it releases the camera first if the new scanner had opened it.
- **No long wait on a poor signal.** The first time on a phone, the decoder (about 930 KB) has to download. If it isn't ready within 10 seconds, that scan uses the classic scanner and the download carries on. **Starting the scanner…** shows while it waits.
- **The decoder is fetched ahead of time:**
    - the **home screen** fetches it in the background 3 seconds after opening (skipped on phones set to classic, or with data saver on);
    - **camera pages** (Group Scanner, Issue Reporter, Asset Register) start preparing it 1.5 seconds after loading, so it's ready by the first tap.
- **Stopping while it starts** no longer leaves the camera on. Before, tapping Stop during the decoder download could open the camera afterwards with no way to see it.

### Repository clean-up

This zip has only the real folders (`docs/`, `netlify/`, `public/`, `tests/`, `tools/`) and the top-level config. The `scanner-main` download of v3.5 still had the stray copies listed under v3.1 at the top level, so `npm run check` failed on it as downloaded. Replacing the whole folder in GitHub Desktop, as in "Releasing a new version", removes them from the repository; GitHub Desktop will list them as deleted. That's expected.

### Tests and checks

- **Tests:** 74, unchanged (the scanner switch runs only in the browser).
- **Tested in a browser** (Chrome, with a fake camera showing an EB-012 label):
    - **No setting, and set to new:** the new scanner, which read EB-012 on the Issue Reporter. On the Group Scanner, issuing to Smith (x1) scanned EB-012 into the group (1 of 1).
    - **Set to classic:** the classic scanner, with **Use the new scanner** under it.
    - **Decoder blocked:** fell back to classic, with the fallback label.
    - **Decoder 15 seconds slow:** **Starting the scanner…**, then classic at 10 seconds.
    - **Stop during a slow start:** no camera left running.
    - **Home screen:** fetched both decoder files in the background.
- **Before merging, on real phones:** on the preview, scan a few bikes on the iPhone 13, the iPhone 15 and an Android phone, with nothing changed in their settings. Check the link under the camera says **Use the classic scanner**.

**Manual.** Getting started → Scanning barcodes is rewritten for the new default, and the troubleshooting row for a barcode that won't scan is updated. The Help page, the Claude Doc and the issuing guide are updated.

**Files:** `public/assets/scan.js`, `public/index.html`, `public/help.html`, `docs/manual.md`, `package.json`, `package-lock.json` (its version had been left at 3.0.0), `netlify.toml`, this file.


## New in v3.5: the screen moves on by itself

**A design rule from now on:** when a job is finished, the screen moves on to the next job by itself, so staff don't jump between tabs or need to know where to go next.
- **It never changes anything by itself.** Marking a group out or returned always takes a tap.
- **It always says where it has gone,** so staff can choose differently.

Deploy as usual; there's nothing to set in Netlify. Fleet reporting moves to v3.6.

### Issuing (Group Scanner)

- **Groups remember their booking:** each group now keeps the bikes booked (`qty`) and any non-standard equipment (`equip`, for example "1× Child Seat") from Load Manifest. Groups loaded before v3.5, and walk-ins, use the "(x2)" in their name.
- **Active Group chips** show only groups still waiting to go out, soonest first, each with its start time and "scanned/booked". Groups already out or back are behind **Show all**.
- **Under the active group:** "1 of 2 bikes scanned", then "✓ 2 of 2", and **Needs 1× Child Seat** for booked equipment.
- **🚴 Mark Smith (x2) out** under the bike list. It's green once every booked bike is scanned, and asks first if fewer are. The next group waiting, by start time, then becomes active ("✓ Smith (x2) out · Next: Jones (x3), 10:30"), and the camera stays on.
- **Each new day starts in Issuing.** The mode chosen is kept for the rest of that day (`saeb-scan-mode-day`). Before, a phone left on Checking in or M-check opened that way the next morning.

### Checking in, M-check, faults

- **Checking in:** a group with every bike back moves to the top of the list with **Mark returned**. That was a trip to the Groups tab before.
- **M-check:** the camera stays on between bikes. Before, it closed after every bike.
- **Scans are ignored while any form is open** (M-check, take off, return with exception, location). This fixes a confirmed problem: with "M-check each bike as it's checked in" on, a second bike in view could be checked in behind an open M-check form and replace the bike being checked, so the first bike's M-check was lost.
- **A fault swap:** after taking a bike off for a fault, the app offers to log it now. The Issue Reporter opens with the bike filled in (`/issues?bike=EB-012&from=scanner`), and returns to the scanner once it's logged.

### Load Manifest

After a successful push, the page goes straight to the Group Scanner (`/scanner#start`), in Issuing, with the first group due active. If a product needed checking (no location, or more than one), it waits, with a **Go to the Group Scanner →** button.

### Tests and checks

- **Tests:** 74 (1 new): each group keeps its booked count and equipment.
- **Tested in a browser,** with the real 16 Oct manifest:
    - **The push:** it went straight to the scanner, which opened in Issuing even though the phone had been left on Checking in, with the first booking due active.
    - **Issuing:** "0 of 2", then "✓ 2 of 2"; Mark out took the next group (Lane (x2), 9:00 AM), and the finished group moved behind Show all.
    - **Checking in:** both bikes back showed the group at the top with Mark returned, which marked it returned.
    - **A fault swap:** the Issue Reporter opened with EB-008 filled in, and returned to the scanner after logging.
- **Manual:**
    - **Group Scanner:** rewritten for the new flow, with button names matching the screen (**🚴 Issuing**, **✓ Checking in**, **🔧 M-check**; the manual said "Issuing bikes" and "Checking bikes in");
    - **SOPs:** issuing, checking in, M-check, fault swap and loading the manifest updated.

  The Help page, the Claude Doc and the separate issuing guide are updated.

**Files:**
- `netlify/lib/ops-core.mjs`;
- pages: `public/scanner.html`, `public/manifest.html`, `public/issues.html`, `public/help.html`;
- `tests/saving.test.mjs`, `docs/manual.md`, `package.json`, `netlify.toml`, this file;
- version labels.

## v3.4: Rezdy matching you can check

Checked against the 18 real pickup manifests from October and November (58 bookings, 12 product names): the matching words already in use match every real product to exactly one location. The matching rules themselves don't change. What v3.4 adds is the ability to see and check matching, so a new or renamed product can't send bookings to the wrong place unnoticed. Deploy as usual; there's nothing to set in Netlify.

- **Products seen.** Every product name in a loaded manifest is recorded in a new live file, `rezdy-products`: the name, bookings counted, first and last seen, and the location it matched. A retried load isn't counted twice. It's in every backup, restored with the "QR codes, message templates and Rezdy products seen" part.
- **Load Manifest, "Check before loading".** Under the table, it lists any product that is:
    - **new:** never seen before, with the location it will go to and the word that matched;
    - **matching more than one location:** showing which wins and what else matched;
    - **matching none.**

    Groups whose product matches more than one location are also flagged in the table.
- **Loading the same day again asks first,** if bikes are already scanned for that day ("17 Oct 2026 is already loaded, with 1 bike scanned…"). Cancel changes nothing.
- **Group Scanner:** a group with no location now shows **⚠ NO LOCATION · set it below** next to its Set location menu. Before, it showed no badge at all, so it was easy to miss.
- **Admin → Rezdy products:** every product seen with its current location, with problems flagged. Plus **Try matching**:
    - **What to test:** pasted names, a chosen manifest, or every product seen;
    - **Trying words:** draft matching words for one location, showing which products would change location, before **Save these words** (which uses `updateLocation` with the edit-conflict check).
- **Dashboard:** "No location" is now labelled "Location not set".
- **For developers:** `Locs.matchAll(product, list)` in `ops-plus.js` returns every match, with the word that matched, in winning order. `fromProduct` is unchanged.

**Tests:** 73 (2 new, in `tests/rezdy.test.mjs`): products counted with first and last seen and location, a retried load not double-counted, an unmatched product kept; and products seen included in backups.

**Tested in a browser with the real manifests:**
- **First day loaded:** every product flagged as new, with its location and matching word.
- **Second day:** only Full Day Hire - Beresford Estate flagged as new.
- **Same-day reload:** with a bike scanned, the warning appeared, and cancelling kept the scan.
- **Unmatched booking:** the 27 Oct manifest's "Nil" booking showed **⚠ NO LOCATION** on the scanner.
- **Admin:** the list (with "Nil" flagged). Trying "oxenberry" on VIC showed Full Day Hire - Oxenberry Farm moving to VIC and becoming ambiguous; nothing was saved, and Save turned off when the words went back. Choosing a manifest file worked.

**Manual.** The Help page and the Claude Doc are updated:
- **Load Manifest:** "Check before loading", ambiguous products, the same-day warning, and the loading SOP.
- **Admin:** Rezdy products and Try matching.
- **Troubleshooting:** two new rows.

**Files:**
- **New:** `tests/rezdy.test.mjs`.
- **Changed:**
    - server: `netlify/lib/ops-core.mjs`, `netlify/lib/backup-core.mjs`;
    - pages: `public/assets/ops-plus.js`, `public/manifest.html`, `public/scanner.html`, `public/admin.html`, `public/dashboard.html`, `public/help.html`;
    - docs and config: `docs/manual.md`, `package.json`, `netlify.toml`, this file;
    - version labels.

## v3.3: saving you can trust

Every save now ends in one of three clear states, every save is safe to repeat, a save interrupted halfway is finished by its retry, and two people editing the same record can't silently overwrite each other. Deploy as usual (branch, preview, merge). There's nothing to set in Netlify.

### What staff see

- **Saved, Not confirmed, or Not saved.** "No connection, NOT saved" was often wrong: the save may have gone through before the reply was lost.
    - **No answer:** a save that gets no answer within 15 seconds (20 seconds for loading a page) is tried once more after 3 seconds. If that also gets no answer, the page says **Not confirmed**: it may or may not have saved, and tapping again is safe.
    - **Where the message comes from:** it's `Ops.NOT_CONFIRMED`, used by every page. Before v3.3, requests had no time limit at all.
    - **The Group Scanner** doesn't use the quiet retry; its own queue keeps retrying. It gets the time limit, so one stuck send can't hold up the queue.
- **Refused scanner changes are listed.** The status light shows "1 not saved · tap", and tapping lists what was refused and why, kept on the phone until cleared. Before, a toast flashed past.
- **Guest message confirmations.** If "Was it sent?" can't be recorded, the sheet says so and stays open, instead of closing as if it had worked.
- **A stale edit is refused, not overwritten.** This now applies to bikes (including a bike moved since its form was opened), locations, lost-property edits, walk-in contacts, site checklists, QR codes and message templates. Shifts and team members have had it since v3.2. The page explains, and reloads the latest version.

### Underneath

- **Retries can't duplicate:**
    - **Lost Property:** a new item keeps one ID until it's saved, a note keeps its ID while its text is the same, and closing or reopening twice is recognised. Before, reopening twice added two "Reopened" notes.
    - **Checklists:** "Not required today" keeps one ID per site until saved.
    - **Load Manifest:** each load carries a `loadId`, so a retried load changes nothing, and scans made after the first load are kept.
- **"Already done" is success:**
    - **Resolving an issue** that's already resolved returns `already-resolved` with who resolved it, not an error. The page says "resolved", or "was already resolved by JB" if someone else got there first.
    - **Re-adding a bike** with identical details returns `already-saved`. A different bike with the same ID is still refused.
- **Two-part saves heal on retry:**
    - **A scan:** a retried scan passes the hire on again, so the M-check record is made even if the first attempt stopped between the two writes. In v3.2, the bike then wasn't flagged as due an M-check.
    - **A Dandelion drop-off:** a retried drop-off returns its bikes again, so their moves are finished. Moving a bike already there logs nothing.
    - **A lost-property photo** is saved before the register record, so an item never claims a photo that isn't there.
    - **Loading a manifest:** the previous day's archive is overwritten under the same key when two phones collide, instead of writing a second archive.
- **Late destructive changes are refused.** Delete group, Clear all and Reset day carry `dayOf`, the manifest date they were made on. If a different day has been loaded since, they're refused (`day-changed`) and listed on the phone. Changes without `dayOf`, from phones not yet updated, behave as before.
- **Versions:** bikes, locations, lost items, walk-in contacts and each site's checklists now carry a version `v`, raised on every change. That includes every move of a bike: by hand, by check-in, and by drop-off. QR codes and messages use the file's own version. Existing records count as version 0, so nothing needs converting.

### Things found while testing

- **Browsers already re-send some saves by themselves.** In testing, Chrome automatically re-sent a save when the connection dropped before any reply, and the app never knew. That's normal browser behaviour, and real phones do it too, which is why every save has to be safe to repeat. Before v3.3, a re-sent lost-property item was duplicated.
- **The local test server** (`tests/dev-server.mjs`) has a `/__dropreply?n=2` switch: the next n saves are carried out, but their replies are dropped, to test this.

### Tests

There are 71 tests (9 new, in `tests/saving.test.mjs`), each making a save fail halfway and checking the retry heals it:
- a scan's M-check record;
- a Dandelion drop-off's moves;
- a lost-property photo saved before its item;
- lost items, notes, close and reopen made safe to repeat;
- a stale lost-property edit refused;
- two phones resolving the same issue (both succeed);
- a bike edit refused after the bike was moved;
- stale location, contact and checklist edits refused;
- a retried manifest load, and one archive under contention;
- Delete group, Clear all and Reset day after a new day.

Two older tests were updated for the new "already done" rules.

**Tested in a browser:**
- **Lost Property:** one reply lost (the quiet retry finishes it: one item, "✓ Added"); every reply lost ("Not confirmed", then Save again gives one item, not two).
- **Resolving with a lost reply:** shows "resolved".
- **Group Scanner:** an out-of-service scan listed under "1 not saved", then cleared.
- **Asset Register:** a stale edit refused after a move, with the move kept.

**Manual.** The Help page and the Claude Doc are updated:
- **Getting started:** the status light's new "not saved" state, and "Bad signal" rewritten around Saved / Not confirmed / Not saved, conflicts, and late destructive changes;
- **Troubleshooting:** two new rows.

**Files:**
- **New:** `tests/saving.test.mjs`.
- **Changed:**
    - server: `netlify/lib/ops-core.mjs`;
    - shared code: `public/assets/ops-client.js`, `public/assets/ops-plus.js`;
    - pages: `public/scanner.html`, `public/manifest.html`, `public/issues.html`, `public/fleet.html`, `public/lost.html`, `public/contacts.html`, `public/checklists.html`, `public/admin.html`, `public/help.html`;
    - tests: `tests/core.test.mjs`, `tests/dev-server.mjs`;
    - docs and config: `docs/manual.md`, `package.json`, `netlify.toml`, this file;
    - version labels.

## v3.2 (with fixes v3.2.1 to v3.2.3)

## v3.2.3: roster sheets as they really are

These fixes come from the first real roster spreadsheet (week of 2 Nov), which v3.2 refused.

- **Spreadsheet times with seconds** (`08:45:00`, as Excel saves them) are accepted, and so is `5:15:00 pm`.
- **Close as a finish** means until the work's done. It's stored as `end: 'close'` and shown as "8:45am–close". It counts as the end of the day for the overlap check. In a calendar file it ends at 5:30 pm, with "(until close)" in the title. In Admin's shift form it's the **Until close** tick box, and it downloads as `Close`.
- **Not available** is a new kind of entry (`kind: 'na'`): a person and a date, with an optional note, and no site or times. It shows on the roster as "N/A · Shayne not available (note)", on the home screen's On today, in My shifts, and in the roster email under "Not available".
    - **The rule:** a person can't be both rostered and not available on the same day, and Copy last week skips not-available entries.
    - **In a sheet,** any of these count: **N/A** (or NA, Not available, Unavailable, Away, Off) as the Site or Start, or a row with no site and times blank or 0 (as in the first sheet).
    - **In Admin,** it's **N/A · Not available** in the Where list, which hides the times.
- **Workshop shifts:** Admin's shift form now lists storage locations such as HOM. Uploads already accepted them.
- **Existing shifts** have no `kind` and are read as ordinary shifts. Nothing needs converting.
- **Tests:** 62 (3 new): spreadsheet times; Close; every N/A form; a sheet laid out like the real one (seconds, Close, a bare "10", HOM, and a not-available row with 0 times) uploading with no problems; not available clashing with a shift; and Copy skipping N/A.
- **Browser test:** the real 2 Nov sheet. The preview showed 10 rows, no problems, and **Add 10 shifts**; it then appeared correctly in Admin and on the staff Roster, and downloaded back as CSV with Close and N/A.
- **Files:** `netlify/lib/roster-core.mjs`, `public/roster.html`, `public/admin.html`, `public/index.html`, `tests/roster.test.mjs`, `docs/manual.md`, `public/help.html`, `package.json` and this file. The Claude Doc is updated.

## v3.2.2

- **Admin locks as soon as you leave it.** That covers any link, the browser's Back button, or closing the tab. Coming back asks for the password again: on leaving, the page forgets the password (`pagehide`), and a page restored from the browser's Back history reloads (`pageshow`), so nothing shows before the password is entered. Switching to the mail or messages app (Email roster, Text about this shift) doesn't leave the page, so it stays unlocked. Email roster now records the send *before* handing over to the mail app.
- **Back to Load Manifest:** a new button at the top of Admin. **Lock now** also returns to Load Manifest.
- **Tested in a browser:** opening Admin asks once; Back to Load Manifest clears the password; the browser's Back button to Admin asks again; reopening by link asks again. 59 tests pass. The manual, Help and the Claude Doc are updated.
- **Files:** `public/admin.html`, `docs/manual.md`, `public/help.html`, `package.json` and this file.

## v3.2.1 (fix)

- **Admin asked for the password 4 or 5 times.** Admin loads several things at once, and each request that went out before the password was typed asked for it separately. Now a refused request first checks whether a password has been entered since it was sent, and if so retries with it. The prompt appears once, or twice if the first attempt is wrong. (`public/assets/ops-client.js`)
- **A password under 8 characters showed as "No admin password yet".** It now says it's too short, so the fix is obvious. (`netlify/functions/ops.mjs`, `netlify/lib/ops-core.mjs`, `public/admin.html`)
- **Tested in a browser:** correct first time (1 prompt), wrong then right (2 prompts), too short (the new message). 59 tests pass.

**Deploying:** the same as v3.2: a branch, a pull request and the preview. If v3.2 is already on your branch and not yet merged, put these files on the same branch and the preview updates. No other steps.

## New in v3.2

Two things: the backup-status fix found by the independent review (planned as v3.1.1), and the **Roster**, with an **admin password** and contact details for the team.

### Before you merge

1. **Set the admin password.** In Netlify → Site (or Project) configuration → Environment variables, add `SAEBIKES_ADMIN_PASSWORD`: at least 8 characters, different from the staff PIN, applied to **all deploy contexts** so the preview can use it too.
2. **Release as usual** ("Releasing a new version" below): Back up now on the live site, a branch, a pull request, then test on the preview.
3. **On the preview, check:**
    - **Admin asks for the admin password.**
    - **Team:** edit someone and add an email and mobile.
    - **Roster card:** add a shift for next week; Copy last week, then Undo copy.
    - **CSV:** Download CSV, change a time in the file, Upload CSV, read the preview, apply, then Undo upload.
    - **Staff screens:** open **Roster** from the home screen and check the shift shows, with no phone numbers or emails anywhere on the page.
4. **Merge at a quiet time.**

### After it's live

1. Open **Admin** and enter the admin password.
2. Under **Team**, add each person's full name, email and mobile.
3. If VIC's opening checklist was edited in Admin (it has been), add "Backup status on the home screen is green (tell the manager if it's red)" to it there.
4. Roster next week, and send it with **Email roster**.

### What changes for staff

**Admin is closed to staff once the admin password is set.** This covers everything on the Admin page: Team, Site checklist lists, QR codes, Message templates, Dashboard data, Backups and Restore, plus every roster change. Staff who used to add names to Team will need the manager to do it.

Everything staff use day to day is unchanged, plus three additions:
- **the Roster tile;**
- **On today** on the home screen;
- **an amber backup line** for "some archives weren't copied".

### Backup status, fixed (the review's finding)

The status said green after a failure in three situations: a failure recorded in the same millisecond as the last success, two overlapping backups overwriting each other's status, and a backup cut off before it could record anything. All three are fixed without relying on clock precision.

- **One backup or restore at a time.**
    - **The lock:** a lock in the backup store, created only if it doesn't exist, with a 5-minute lease (well beyond Netlify's 60-second function limit).
    - **When it's busy:** Back up now and Restore are refused with "already running". A nightly run that finds the lock taken is recorded as skipped, not failed.
    - **Restores:** they hold the lock for their whole run, including their safety snapshot, so a nightly can't capture a half-restored state, and pruning can't remove a photo a running snapshot has just checked.
- **Status writes can't be lost.** Every change to the status record is a conditional write, retried on conflict, the same way the live data is saved.
- **The result decides, not the clock.** Each attempt records itself as running when it starts, then as ok or failed when it ends. The status is red if:
    - the last finished attempt failed;
    - an attempt started more than 10 minutes ago and never finished;
    - there's been no good backup for 36 hours.

    Status records written by v3.1 are read correctly.
- **Archive-copy problems are separate.** A snapshot that completed and checked counts as good even if copying a daily archive afterwards fails. That shows **amber**, and the next run retries the archive.
- **`tools/verify-backup.mjs`.** Run `node tools/verify-backup.mjs SA-eBikes-backup-<date>.json` to re-check every part of an off-site copy against its checksum, count the records, and confirm the photos and archives are there. It prints no customer details. The first off-site copy (1 Nov) passes.
- **The roster in backups.** The roster file is now in every backup and download, and can be restored on its own ("Roster").

### The admin password

- **The variable:** `SAEBIKES_ADMIN_PASSWORD`, at least 8 characters. Browsers send it as `x-saebikes-admin-password`, only once Admin has asked for it, and keep it for that tab only (`sessionStorage`). **Lock now** in Admin forgets it.
- **When it's needed** (`ADMIN_ACTIONS` and `ADMIN_VIEWS` in `ops-core.mjs`):
    - **actions:** `addMember`, `updateMember`, `retireMember`, `backupNow`, `markOffsite`, `rebuildDaily`, `restoreSnapshot`, `saveChecklist`, `saveMessages`, `saveQrLinks`, and every roster change;
    - **views:** `backups`, `backupPart`, `teamAdmin` and `rosterAdmin`.

    A wrong password is answered after a 600 ms delay, like a wrong PIN.
- **Not set (or under 8 characters):** Admin works with the staff PIN as before, with a note at the top of Admin saying so. Contact details can't be stored or read at all: `teamAdmin`, and any team save that includes them, are refused with `admin-not-configured`.

### Team: Known as and contact details

- **Known as:** the existing `name` field, now labelled Known as. It's the only name staff ever see.
- **New Admin-only fields:** `fullName`, `email` and `mobile`. A team save that leaves them out keeps them.
- **Staff view:** the `team` view now returns only `id`, `name`, `initials` (and `retired`). `teamAdmin` returns everything.
- **Edit-conflict check:** members carry a version `v`. A save from a form opened at an older version is refused with `changed` and the current details; a retry of a save that went through is accepted.

### Roster

- **Storage:** a new live file, `roster`, in `netlify/lib/roster-core.mjs`.
- **Each shift:** `{ id, date, site, memberId, start, end, note }`, plus a version `v` and up to 30 history entries. Removed shifts are kept, marked removed. Shifts more than 400 days old are dropped.
- **Per week (by its Monday):** when it was emailed, and the state before the last upload or copy, for Undo.
- **Views:**
    - `roster` for staff: shifts with Known as and initials, "changed" flags, active members (name and initials) and sites;
    - `rosterAdmin` for Admin: the same plus versions, history and Undo availability.
- **Actions** (all Admin):
    - `rosterSave` (add or edit, with the conflict check and the overlap check);
    - `rosterRemove`;
    - `rosterCopyWeek` (asks to confirm the number of shifts it would replace);
    - `rosterImport` (`dryRun` for the preview; applying needs `confirmReplace` equal to the number of existing shifts changed or removed);
    - `rosterUndoImport`;
    - `rosterEmailed`.
- **How an upload is matched:** each file row is matched to an existing shift by date, person and site. Same times and note means unchanged; different means a change; no match means an add. An existing shift in those weeks with no match is a remove.
- **Warnings for possible wrong dates:** a different week from the one on screen, dates already passed, a week already exactly as in the file, and a week identical to one of the previous 8.
- **Email roster** uses `mailto:` with everyone rostered as **Bcc**, so recipients don't see each other's addresses.
- **Text about this shift** uses `sms:` from the manager's phone.
- **Add to my calendar** downloads an `.ics` file in local time.
- **Pages:** `public/roster.html` (route `/roster`), the Roster card in `admin.html`, and **On today** in `index.html`.

### Tests

There are 59 tests:
- 29 core tests (unchanged);
- 18 backup tests (7 new);
- 12 new roster tests.

The new backup tests cover:
- the same-millisecond failure (your reviewer's case);
- only one run at a time, and a nightly being skipped rather than failed;
- an expired lock being taken over;
- a run cut off part-way showing red after 10 minutes;
- 20 simultaneous status writes with none lost;
- an archive-copy failure showing amber, with the snapshot kept;
- a status written by v3.1.

The roster tests cover:
- date and time formats;
- the admin password, locked, wrong and unset;
- staff views never containing contact details;
- the team edit-conflict check;
- shifts: add, overlap, edit history, stale edits refused, remove, safe retries;
- the "changed" flag after emailing;
- Copy week, with confirm and undo;
- upload: the preview, applying, re-applying (no change), undo, every row problem, every wrong-date warning, and undo ending once the week is edited;
- the roster being in backups.

**Local test server:** `tests/dev-server.mjs` now serves `/roster`, with the admin password `admintest1`. `DEV_ADMIN_PASSWORD=none node tests/dev-server.mjs` runs it without one.

**Tested in a browser:**
- **Admin:** the password prompt, Team with contact details, add shift, the overlap refusal, the edit-conflict message, Copy last week with confirm and undo, the CSV preview with "Replace 1 shift", a bad file blocked line by line, the CSV download, the Email roster sheet (Bcc), and Admin with no password set.
- **Staff:** the Roster and My shifts pages (no contact details in the page), Add to my calendar, and On today.

**Manual.** The Help page and the Claude Doc are updated:
- **New Roster section;**
- **Admin:** the Roster card, Team, the admin password, and "one at a time" for backups;
- **New SOPs:** checking your shifts, rostering a week, rostering from a spreadsheet, and setting the admin password;
- **Updated:** the backup line (amber, "didn't finish"), Adding a team member, and two troubleshooting rows.

**Files:**
- **New:** `netlify/lib/roster-core.mjs`, `public/roster.html`, `tools/verify-backup.mjs`, `tests/roster.test.mjs`.
- **Changed:**
    - server: `netlify/lib/backup-core.mjs`, `netlify/lib/ops-core.mjs`, `netlify/functions/ops.mjs`, `netlify/functions/backup-nightly.mjs`;
    - pages: `public/admin.html`, `public/index.html`, `public/assets/ops-client.js`, `public/help.html`;
    - docs and tools: `docs/manual.md`, `tools/check.mjs`, `tests/backup.test.mjs`, `tests/dev-server.mjs`;
    - config: `netlify.toml` (the `/roster` route), `package.json`, this file;
    - version labels in the other pages.

## Releasing a new version (from v3.1 on)

A new version goes to a **preview** first: a copy of the app at its own address, with its own data. It goes live only when you merge it. This uses GitHub Desktop (free), which handles moved and deleted files properly. The GitHub website's upload is how stray copies ended up in the repository.

### One-time setup

1. **Install GitHub Desktop** from desktop.github.com and sign in with the GitHub account that holds the Operations Tools repository.
2. **Clone the repository:** File → Clone repository. Pick the Operations Tools repository (the one Netlify deploys from), and choose a folder on your computer, for example Documents/GitHub.
3. **Check Netlify makes previews.** In Netlify, open the Operations Tools site, then Site (or Project) configuration → Build & deploy → Continuous deployment → **Deploy Previews**. It should say "Any pull request against your production branch".
4. **Check the staff PIN reaches previews.** In Environment variables, `SAEBIKES_STAFF_PIN` should apply to **all** deploy contexts, not just Production. If a preview later says "Staff PIN is not set up", this is why.

### Each release

1. **Back up the live data.** On the live site, Admin → **Back up now**. Check it says ✓.
2. **Make a branch.** In GitHub Desktop, make sure Current branch is `main` and tap **Fetch origin** (or **Pull**). Then Current branch → **New branch**, named after the version (for example `v3-2`), based on `main`.
3. **Replace the files.**
    - **Open the folder:** Repository → **Show in Finder** (or Explorer).
    - **Delete what's there:** select everything you can see in that folder and delete it. The hidden `.git` folder isn't shown, and stays, which is what you want.
    - **Copy in the new version:** unzip the new version and copy everything **inside** its folder (`DEPLOY_NOTES.md`, `docs`, `netlify`, `netlify.toml`, `package.json`, `package-lock.json`, `public`, `tests`, `tools`) into the repository folder.
4. **Commit and publish.** GitHub Desktop lists the changes. Type a summary such as "v3.2", tap **Commit to v3-2**, then **Publish branch**.
5. **Open a pull request.** Tap **Create Pull Request**, which opens GitHub in the browser, then **Create pull request**.
6. **Test the preview.**
    - **Find it:** after a minute or two, Netlify adds a "Deploy Preview ready" check with a link to the pull request. Open it. The home screen shows the blue PREVIEW banner.
    - **Load real data:** in the preview's Admin, tap **Load into this preview** on the latest live backup.
    - **Try a normal day:** load a manifest, scan a bike out and back in, tap Returned, do an M-check, report an issue, add a lost item, and open the Dashboard. Then look at whatever the release changed.
7. **Go live.** At a quiet time, not on a Saturday morning, tap **Merge pull request**, then **Confirm merge**, on GitHub. Netlify deploys the live site within a couple of minutes.
8. **Check it.** On the live site, the home screen shows the new version and a green backup line.
9. **Tidy up.** In GitHub Desktop, switch back to `main` and tap **Fetch origin** / **Pull**, ready for next time.

### If something goes wrong after going live

- **Code:** Netlify → Deploys. Pick the deploy before this one and tap **Publish deploy**. The previous version is live again straight away. If Netlify says auto publishing is now locked, unlock it on the same page before the next release.
- **Data:** only if records were damaged, Admin → Backups → **Restore** the backup from step 1, ticking only the damaged parts.

---

## v3.1

This version protects the data: automatic, checked backups with a restore, previews that can't touch live data, and a release check. Nothing staff do day to day changes, apart from a backup line on the home screen and one new item on VIC's opening checklist.

**Deploying v3.1 itself** is the first release done through a preview. Follow "Releasing a new version" below, with two differences:

- **Before merging,** download a backup from the **live** v3.0 Admin page (**Download backup**). The live site has no nightly backups yet, so this is your safety copy.
- **On the preview,** there's no live backup to load yet, because v3.0 doesn't take them. Test it with a few made-up entries instead.

**After merging:**

1. On the live site, open **Admin**, tap **Back up now**, and check the status turns green.
2. Tap **Download off-site copy** once, to start the monthly cycle.
3. In Netlify, open **Functions**. `backup-nightly` should show with a **Scheduled** badge and its next run time. **Run now** there runs it straight away.
4. Next morning, check the home screen's backup line says it backed up overnight.
5. On the next release, do the restore drill from the manual on its preview.

**This zip is the whole app.** Every file is here, unlike earlier version zips, which held only what had changed. Replace the whole folder each time; "Releasing a new version" shows how. Doing that once also removes the stray copies at the top of the repository: `admin.html`, `checklists.html`, `contacts.html`, `dashboard.html`, `fleet.html`, `help.html`, `index.html`, `issues.html`, `lost.html`, `manifest.html`, `qr.html`, `scanner.html`, `ops-plus.js`, `scan.js`, `ops-core.mjs`, `core.test.mjs`, `dev-server.mjs`, `manual.md`, `build_help.py`, `robots.txt`, and the `assets/`, `vendor/`, `functions/` and `lib/` folders. None were deployed, but `assets/ops-client.js` there was a pre-v1.6 copy.

### Nightly backups

- **When:** a scheduled function, `netlify/functions/backup-nightly.mjs`, runs at 16:00 UTC. That's 2:30 am in Adelaide in summer and 1:30 am in winter. It only runs on the live site.
- **What:** every live file, as stored: `day`, `issues`, `assets`, `moves`, `team`, `mchecks`, `mcheck-status`, `site-checklists`, `site-checks`, `qr-links`, `daily-stats`, `lost-property`, `message-templates`. It also copies the lost-property photos and the daily archives.
- **Where:** a separate Netlify Blobs store, `sa-ebikes-backups`, so a bug or a slip in the live data can't reach it.
    - **Snapshots:** each one is a folder, `snap/<id>/`, with one file per part.
    - **Photos and archives:** they never change once written, so they're copied once and shared by every snapshot. Photos are stored as `photo/<checksum>`, and archives under the same `archive/…` names as the live ones.
- **Checked before it counts:**
    - **Checksums:** every part is written, read back and compared against its SHA-256 checksum.
    - **The manifest:** written **last**, it holds each part's checksum, size and record count. A snapshot without one never finished. It's never offered for restore, and it's cleared up after a day.
    - **Unreadable live files:** a live file that can't be read stops the backup with an error, rather than backing up rubbish.
- **Time limit:** Netlify stops a scheduled function at 30 seconds. The snapshot itself takes a second or two. Archive copying stops at about 18 seconds and carries on the next night, so the first nights catch up on the existing archives.
- **Kept:**

| Backup | Kept for |
| --- | --- |
| Nightly | 30 days |
| The first of each month (Adelaide time) | 12 months |
| Back up now, and "Before a restore" | 90 days |

    The newest three good snapshots are always kept. Archives in the backup store are never deleted. Photos are removed once no kept snapshot uses them.
- **Failure notification:**
    - **Admin's status box** and the **home screen** show green, or red if the last attempt failed or there's been no good backup for 36 hours.
    - **VIC's opening checklist** gains "Backup status on the home screen is green", so someone sees it every morning.
    - **No email service** is involved.
- **Customer information:** backups hold names and phone numbers, as the live data does. They're in the same Netlify account, reachable only through the PIN-protected API, and deleted by the retention rules above. Daily archives keep phone numbers indefinitely, as agreed.
- **Cost:** no new services. Expect tens of MB of extra storage a year and about 30 extra function runs a month. It's worth a glance under Netlify **Usage** after the first month.

### Admin → Backups (new first card)

- **Status:** the last good backup, the last failure and its message, archives still to copy, the last off-site download and the last restore.
- **Back up now:** the same backup, with the reason "manual". It's the first step of every release.
- **Download off-site copy:**
    - **How it's fetched:** one part at a time (`view=backupPart`), each checked against its checksum in the browser, then the photos and every daily archive.
    - **What's saved:** one file, `SA-eBikes-backup-<date>.json`, in Downloads.
    - **The reminder:** it records the date, and the home screen shows "Off-site backup download due" after 30 days.
    - **Why it replaces the old download:** the old one-response backup would have failed once photos and M-checks passed Netlify's size limit for a single response.
- **Restore:**
    - **Choosing:** pick a snapshot, tick the parts, type RESTORE.
    - **Checks first:** every ticked part is checked, so one bad checksum means nothing is restored. Then a "pre-restore" snapshot of the live data is taken.
    - **Writing:** the ticked parts are written with a higher version number than the live files, so scanners accept them.
    - **Archives:** these are only ever added, never replaced.
    - **Afterwards:** every part is read back and its count compared.
- **Restoring from a downloaded file** (only needed if the whole Netlify site were lost) isn't built in. Whoever maintains the app would do it with the Netlify CLI. The file's format is: `files.<name>.data` (the live file), `files.<name>.sha`, `photos.<item id>`, and `archives.<key>`.

### Previews have their own data

Before v3.1, a deploy preview used the live data. Netlify's site-wide store is shared by every deploy, so testing a new version on a preview could change live records.

- **How it works now:** `ops.mjs` picks its stores from Netlify's deploy context. The live site keeps `sa-ebikes-ops` and `sa-ebikes-backups`, unchanged. A deploy preview uses `sa-ebikes-ops-deploy-preview`, and a branch deploy `sa-ebikes-ops-branch-deploy`, each with its own backup store.
- **Belt and braces:** a host name with `--`, as every preview and branch URL has, is never treated as live.
- **On a preview:** the home screen has a blue PREVIEW banner. Admin offers **Load into this preview** for the live site's backups. This reads the live backups, writes only the preview's data, and is refused on the live site.
- **Preview data** builds up across previews, which share one store. Loading a live backup resets it.

### Release safety

- **`npm run check`** (`tools/check.mjs`) confirms:
    - every file the site needs is present;
    - nothing stray sits at the top level;
    - every `netlify.toml` route has its page;
    - the version is the same in `package.json`, every page, `ops-core.mjs`, this file and `netlify.toml`;
    - `help.html` is built from the current `docs/manual.md` (`python3 tools/build_help.py --check`);
    - both functions load;
    - all tests pass.
- **Node is pinned** to 22 in `netlify.toml`.
- **The JSONBin tool is removed:** the Admin card, the API action and its code. `JSONBIN_*` environment variables are no longer read; delete any still set in Netlify.
- **The old one-file backup view** (`view=backup`) is removed. Its replacement is above.

### VIC opening checklist

VIC's **default** opening list has a 12th item, "Backup status on the home screen is green (tell the manager if it's red)". If VIC's opening list has been edited and saved in Admin, the saved list is used instead, so add that line there yourself. Other sites don't get it.

### Tests

There are 40 tests: 29 existing, and 11 new in `tests/backup.test.mjs`. The JSONBin migration test is gone. The new tests cover:

- **Snapshots:** a snapshot holds every file, photo and archive, each matching its checksum. A snapshot that fails part-way is never listed, the status turns red, and the next good run clears it. A backup that doesn't read back fails, and so does an unreadable live file.
- **Status:** red after 36 hours. The off-site reminder after 30 days.
- **Restore:** checked first, safety snapshot taken, only ticked parts replaced, newer version numbers, photos and missing archives put back. A damaged snapshot is refused with nothing changed.
- **Retention:** the rules above over 400 days of snapshots, and never fewer than the newest three.
- **Archive copying:** stops at its time limit and finishes the next night.
- **Previews:** store names by deploy context. A preview loads a live backup into its own data without touching the live data or the live backups, and the live site refuses it.
- **Admin:** Back up now, the list and the checked download parts.
- **Checklist:** the VIC-only item.

`tests/memstore.mjs` is a shared stand-in for Netlify Blobs that can be made to fail on purpose. `tests/dev-server.mjs` now has backups. `DEV_CONTEXT=deploy-preview node tests/dev-server.mjs` runs it as a preview with one "live" backup to load.

Tested in a browser:

- **Live:**
    - **Home screen:** red ("no backup yet"), then green.
    - **Back up now** worked.
    - **Restore:** refused without RESTORE. Restoring only the issue log undid a resolved issue.
    - **Download off-site copy:** the file checked and parsed.
    - **The off-site reminder** cleared.
    - **VIC's list** shows the backup item.
- **Preview:**
    - **Banner:** the home screen shows it.
    - **Load into this preview** put the "live" groups into the preview only.

**Manual.** The Help page and the Claude Doc are updated:

- **Getting started:** the home screen's backup line and the PREVIEW banner.
- **Site Checklists:** the VIC item.
- **Admin:** rewritten for backups. The JSONBin part is gone.
- **New SOPs:** monthly off-site copy (replacing the monthly backup), the backup line is red, restoring from a backup, the yearly restore drill, and updating the app.
- **Also updated:** the daily routine, and three new troubleshooting rows.

**Files changed:**

- **New:** `netlify/functions/backup-nightly.mjs`, `netlify/lib/backup-core.mjs`, `tools/check.mjs`, `tests/backup.test.mjs`, `tests/memstore.mjs`.
- **Changed:** `netlify/functions/ops.mjs`, `netlify/lib/ops-core.mjs`, `public/admin.html`, `public/index.html`, `public/help.html`, `docs/manual.md`, `tools/build_help.py`, `tests/core.test.mjs`, `tests/dev-server.mjs`, `netlify.toml`, `package.json`, this file, and the version labels in the other pages.


## v3.0

**New file, needed:** `public/lost.html` (Lost Property). `netlify.toml` has a new `/lost` route, so it needs to go up too.

**No bookings today** (Load Manifest, Step 1).

- **The button:** a date (today by default) and a **No bookings today** button. After "Load a blank manifest for …?", it does everything a real upload does:
    - the current day is archived on the server and downloaded as `Group_File_<date>.csv`;
    - the daily summary is saved;
    - multi-day and overdue groups carry over;
    - Contacts and the scanner move to the new date with no bookings.
- **An empty file** (headers only, as Rezdy exports a quiet day) now shows "This manifest has no bookings for …" with **Continue: no bookings** or **Choose another file**, instead of an error.
- **On the server:** `loadManifest` accepts zero groups only when `empty: true` is sent, so an accidental empty push is still refused.

**Lost Property** (new home tile, with a count of open items).

- **Each item records:** a description; a photo, shrunk on the phone to about 800 px JPEG (typically 60–150 KB); the date and place found (location list plus a note); who found it; where it's kept (location plus a note); and optionally the owner, picked from today's or the previous day's bookings or typed in, with the phone checked.
- **Follow-up:** dated, initialled notes. **Text** or **WhatsApp** the owner with a message written for you; afterwards the app asks whether it was sent and adds a note either way.
- **Closing:** returned to owner, posted, donated, disposed of, handed to police, or other with a note, plus a date. **Reopen** is available.
- **Seeing what's waiting:** items held 30+ days are tagged. **Download CSV** gives every item with its notes.
- **Storage:** the register is `lost-property`, and each photo is its own file, `lost-photo/<id>`, so the list stays quick. Photos are included in the Admin backup.

**Home screen.** The tiles are reordered: Today's Contacts, Site Checklists, Group Scanner, Show QR, Asset Register, Issue Reporter, Lost Property, Load Manifest, Help & SOPs. The Admin link is gone from the bottom. **⚙️ Admin** now sits beside **📊 Dashboard** at the top of Load Manifest.

**Guest messages.**

- **The templates:** Running late for pickup, Late returning (without the flat battery line) and Weather warning, in `message-templates`. They're editable in **Admin → Message templates**, and {first}, {site}, {time} and {weather} fill themselves in.
- **💬 Message** on each contact card (replacing Send link; the guest links are now in the same sheet) and on each group card with a phone number.
    - **Suggestions:** the Group Scanner suggests "running late for pickup" when the start time has passed with nothing scanned out, otherwise "late returning". Contacts suggests pickup before 1 pm and returning after.
    - **Before sending:** the wording can be edited, then Text or WhatsApp opens with it filled in.
- **The record:** each message is logged on the booking as **opened**. Coming back to the app shows **Was it sent?**: Sent, Not sent (with an optional reason), or leave it as not confirmed. The card shows the latest message and its status, coloured green, amber or red.
- **🌦 Weather warning to groups out** (Groups tab) lists every group with bikes out, ticked by default. Groups with no phone can't be ticked. You describe the weather once, then step through each ticked group, sending and confirming one at a time.

**Manual.** The Help page and the Claude Doc have a new Lost Property section (how it works; SOPs for logging and returning), and SOPs for messaging a late guest and for weather warnings. Getting started, Load Manifest, Contacts, the Groups tab, Admin and troubleshooting are updated.

**Files changed:** `netlify/lib/ops-core.mjs`, `netlify.toml`, `public/assets/ops-plus.js`, `public/lost.html` (new), `public/index.html`, `public/manifest.html`, `public/contacts.html`, `public/scanner.html`, `public/admin.html`, `public/help.html`, `docs/manual.md`, `tests/core.test.mjs`, `tests/dev-server.mjs`, version labels in the other pages, `package.json`, this file.

## v2.9

**New files, all needed:**

- `public/qr.html` (Show QR)
- `public/dashboard.html` (Dashboard)
- `public/assets/vendor/qrcode-generator.js` (qrcode-generator 1.4.4, about 55 KB, draws the codes)

`netlify.toml` has two new routes, `/qr` and `/dashboard`, so it needs to go up too.

**Locations: one list, four kinds, with Rezdy matching words.**

- **Kinds:** every location has a kind.
    - **Hire site:** VIC, OXB, BER, DOG, SRV, HUG, HAZ.
    - **Home delivery:** HMD.
    - **Collection point:** DLN, Dandelion Wines.
    - **Storage only:** HOM, TRA, and any location added before this version.
- **Upgrading:** the new locations are added to your list automatically the first time it's read. Edits you've made (names, retired locations, ones you added) are kept.
- **Matching words:** hire sites and Home delivery have words that appear in their Rezdy product names (Beresford: "beresford"; Home Delivery: "deliver", "collection"; and so on). Load Manifest puts a booking at the first location whose word is in its product. Anything unmatched is flagged "Unrecognised product", as before.
- **Editing:** words and kinds are edited in **Asset Register → Locations**: a kind menu, and a **Words** button. A new Rezdy product needs no update to the app, just a word.
- **DEL is now HMD.** Groups and contacts saved under DEL are converted when they're read.
- **Everywhere else:** New Group, the location menu on a group, the by-location sections, the check-in prompt (a delivery still compares against TRA), badges, sorting, the shared report and the spreadsheets all use the list. A manifest location that isn't a hire site or delivery on the list is dropped.

**Dandelion drop-offs.**

- A group with bikes still out shows **↩ Dropped at Dandelion Wines**, one button per collection point.
- Pressing it checks every bike still out in at DLN, closes the group as Returned, and moves those bikes to DLN in the register (move history: "dropped off").
- Staff then use Move bikes when they collect them.

**Show QR** (home tile, and 🔳 QR on the Group Scanner).

- **The codes:** SA eBikes Ride Guide, Online Waiver and Google Review, drawn on the phone from links stored in **Admin → QR codes for guests** (name | link, one per line, https only, up to 8). Each was checked by decoding it back to its link.
- **Showing them:** tap a code to show it full screen; tap, swipe or use Next to move on. Once loaded, the codes still show without signal.
- **Send link** on Today's Contacts opens Text or WhatsApp with "Hi Name, here's the SA eBikes Ride Guide: link" filled in.

**Daily summary.**

- **When:** saved when the next day's manifest is loaded (reloading the same date doesn't count).
- **What:** bookings and walk-ins with bikes scanned, bikes hired, bikes hired per location, bikes out and available per model, out of service, M-checks passed and failed, and the IDs hired.
- **Filling history:** **Admin → Dashboard data → Build history from archives** summarises every archived day. It uses today's register for models, so older days are approximate.

**Dashboard** (📊 Dashboard on Load Manifest; read-only, open to all staff).

- **Totals:** week, month and financial year (from 1 July) to date, for bookings and bikes, against last week, last month and the same date last FY.
- **Trend:** 8 weeks, or 6 months.
- **Load by model:** each model's busiest day this week. Orange at 90% or more.
- **Other sections:** bikes hired by location this month, most time out of service this FY (from P5 issues), and bikes to review: 4+ years old with a week or more out of service, or hired a quarter as often as the typical bike.
- **Today so far** is included live.

**Manual.** The Help page and the Claude Doc have new Show QR and Dashboard sections, and new SOPs for a group dropped at Dandelion and for getting history onto the Dashboard. Load Manifest, Contacts, the Groups tab, Asset Register locations, Admin and troubleshooting are updated.

**Files changed:** `netlify/lib/ops-core.mjs`, `netlify.toml`, `public/assets/ops-plus.js`, the new files above, `public/index.html`, `public/manifest.html`, `public/scanner.html`, `public/contacts.html`, `public/fleet.html`, `public/admin.html`, `public/help.html`, `docs/manual.md`, `tests/core.test.mjs`, `tests/dev-server.mjs`, version labels in the other pages, `package.json`, this file.

## v2.8

**New file, needed:** `public/assets/vendor/libphonenumber-min.js` (libphonenumber-js 1.11.12, about 170 KB). It holds Google's phone-number rules for every country. Load Manifest, Contacts and the Group Scanner load it.

**Phone numbers checked and corrected.** This happens when the manifest is loaded, and when a walk-in's number is entered.

| Arrives as | Saved as | Why |
| --- | --- | --- |
| +1 0411 382 221 | +61 411 382 221 | Not a valid US number; it's an Australian mobile |
| 0411 382 221 | +61 411 382 221 | No country code: Australian |
| 61411382221 | +61 411 382 221 | + added |
| +61 0411… | +61 411… | Extra 0 dropped |
| +1 508 789 1744 | unchanged | A real US number |
| 12345 | unchanged, flagged "check number" | Not valid anywhere |

- **Load Manifest Step 2** shows each correction under its group, and counts them under the table.
- **Contacts** shows "Corrected from …" under a corrected number, and a red "check number" tag on doubtful ones.
- The original number is kept with the contact (`phoneFrom`), so a correction can always be traced.

**Walk-ins.**

- **New Group** now has a hire location drop-down (Visitor Centre, Oxenberry Farm or Home delivery), pre-set from the phone's "This phone is at" (TRA starts on Home delivery). It also has Full day or 4 hours, and an optional contact name and phone.
- **Start time** is set to when the group is added. A 4-hour hire shows "DUE BACK 2:15 PM" on its card.
- **Contact later:** "+ Add contact" on the group card, or "+ Add phone" on Today's Contacts. A walk-in with bikes out and no phone shows "No phone yet".
- **On Contacts:** walk-ins appear with a Walk-in tag once they have a contact.
- **Order number:** walk-ins get one like "WALK-G4CX8EMD", so the contact carries over with the group if it's overdue.
- **Set location:** any group without a location, walk-in or manifest booking, has a "📍 Set location…" menu on its card.

**Site Checklists: Not required today.** This button is on the Opening tab. One record (name, time, optional reason) covers the whole day: no opening or closing is expected, and the home-screen reminders stop. If the site opens after all, the opening checklist can still be signed off. It shows as "⏸ Not required" in History and in the CSV.

**Fix:** a registered bike with no brand or model recorded no longer shows "Not in asset register" in the scanner.

**Manual.** The Help page and the Claude Doc have a new "A site not opening today" SOP and a rewritten "Walk-in or late booking" SOP. Load Manifest, Contacts, the Groups tab, Site Checklists and troubleshooting are updated.

**Files changed:** `netlify/lib/ops-core.mjs`, `public/assets/ops-plus.js`, `public/assets/vendor/libphonenumber-min.js` (new), `public/scanner.html`, `public/contacts.html`, `public/manifest.html`, `public/checklists.html`, `public/index.html`, `public/help.html`, `docs/manual.md`, `tests/core.test.mjs`, version labels in the other pages, `package.json`, `netlify.toml`, this file.

## v2.7

**New files, all needed:**

- `public/checklists.html` (Site Checklists page)
- `public/assets/scan.js` (scanner switch)
- `public/assets/vendor/zxing-reader.js` (new scanner engine, zxing-wasm 1.2.15)
- `public/assets/vendor/zxing_reader.wasm` (about 930 KB, downloaded once per phone, only by phones using the new scanner)

The existing `public/assets/vendor/html5-qrcode.min.js` stays; it's still the default scanner.

**`netlify.toml` changes, also needed:** the security header now allows WebAssembly (`'wasm-unsafe-eval'` in `script-src`), which the new scanner needs. There's also a new `/checklists` route.

**New scanner, opt-in per phone.**

- **The switch:** every camera screen (Group Scanner, Issue Reporter, Asset Register add/edit and Move bikes) shows "Trouble scanning? Try the new scanner" under the camera. Tapping it switches that phone, and "switch back" undoes it.
- **What it does differently:** it asks for an HD camera picture, decodes only what's inside the green guide box, and uses the zxing-wasm decoder.
- **Fallback:** if it can't start, the phone falls back to the classic scanner automatically.
- **Tested** in Chrome with a fake camera playing photos of labels 26 and 20. With an HD picture, the new scanner read both labels, including 20 on the round head tube. The classic scanner read neither. At the small default camera size, neither read anything. Real-world proof is the two iPhones.

**Site Checklists (`/checklists`, new home-screen tile).**

- **Lists:** opening and closing per site. VIC has the agreed lists, with "Batteries on charge for tomorrow" and "Site locked and alarm on" mandatory on close. Any other site starts with a copy of the VIC lists until its own are saved.
- **Answering:** every item needs Done, or Problem with a note. Mandatory items can't be marked Problem. Sign-off uses the 👤 name, or asks for initials.
- **History:** a site's records by date, and a CSV of every checklist for every site, one row per item.
- **Home-screen reminder** for the phone's site: not opened yet, not closed by 3 pm, or not closed yesterday.
- **Admin → Site checklists:** edit any site's lists as text, one item per line, with `*` marking mandatory.
- **Problems** are kept on the checklist record. They don't create Issue Reporter issues, which are for bikes.
- **Storage:** two new files, `site-checklists` and `site-checks`. Both are uncapped (a few records a day) and included in the Admin backup.

**Manual.** The Help page and the Claude Doc have a new Site Checklists section (how it works; SOPs for opening, closing and changing a checklist) and a "Scanning barcodes" part in Getting started. Admin, the daily routine and troubleshooting are updated.

**Files changed:** `netlify/lib/ops-core.mjs`, `netlify.toml`, `public/index.html`, `public/admin.html`, `public/scanner.html`, `public/issues.html`, `public/fleet.html`, `public/help.html`, the new files above, `docs/manual.md`, `tests/core.test.mjs`, `tests/dev-server.mjs`, version labels in the other pages, `package.json`, this file.

## v2.6

**Load Manifest heading** now reads "Upload Rezdy Pickup Manifest (CSV)".

**Issue Reporter Log.**

- **Filters:** All, Open, P1, P2, P3, P4, OOS (P5), Resolved. Each shows its count, for example "P3 · 2". P1 to P4 and OOS show open issues at that priority.
- **Resolved issues:** they show "Reported 12 Oct · Resolved 14 Oct (2 days)", or "same day", in place of the reported-by line.

**Manual.** In the Help page and the Claude Doc, the Log tab description is updated.

**Files changed:** `public/issues.html`, `public/manifest.html`, `public/help.html`, `docs/manual.md`, version labels in the other pages, `package.json`, `netlify.toml`, this file. No server changes.

## v2.5

**By time / By location.** A switch on Contacts and on the scanner's Groups and Summary tabs, remembered per phone. The default is by time.

- **By time:** groups are listed by start time, then surname. Groups with no time (walk-ins, older manifests) go last.
- **By location:** groups are listed under headings with counts (Visitor Centre, Oxenberry Farm, Home delivery, No location), each in time order.
- **Carried over first:** in both orders, groups carried over from an earlier day sit at the top under "Carried over", in red. That covers overdue groups and multi-day hires.
- **Scan tab:** the group chips follow the same order, so the next booking is first.
- **Previous day:** the view uses the same order.

**Check-in location safeguards.** These are in the scanner's *Checking in* mode and on the Groups tab tick boxes.

1. **Daily confirmation.** The first check-in of the day, or switching to Checking in, asks "Where are you checking in?" with one tap per location. The current one is marked. It isn't asked again that day. Choosing a location in the "This phone is at" menu also counts as confirming.
2. **Destination in every confirmation.** For example, "✓ EB-010 in · Brown (x2) · 1 of 2 · → OXB".
3. **Hire-location check.** When a group was hired from somewhere other than this phone's location, the app asks once for that group: "here (VIC)" or "where it was hired from (OXB)". For home deliveries, the alternative is TRA. The answer applies to the rest of that group's bikes this session. Visitor Centre groups checked in at VIC aren't asked.

Unticking a bike isn't affected.

**Manual.** In the Help page and the Claude Doc, the Contacts and Group Scanner descriptions and the Checking in SOP are updated. Troubleshooting has a new row on fixing bikes checked in at the wrong location.

**Files changed:** `public/scanner.html`, `public/contacts.html`, `public/help.html`, `docs/manual.md`, version labels in the other pages, `package.json`, `netlify.toml`, this file. No server changes.

## v2.4

### The pickup manifest

**Load the Rezdy pickup manifest from now on.** It's the only export with the **Product** column, which says where each hire is. It also has the start time (Session), the agent, Order Special Requirements and the internal notes, and keeps its columns fixed. The session, mobile and daily exports still load, but without hire locations.

**Hire location from the product name.**

| Product name contains | Shows as |
| --- | --- |
| "Deliver" or "Collection" | 🚚 Home delivery |
| "Oxenberry" | 📍 Oxenberry Farm |
| "Visitor Centre" | 📍 Visitor Centre |
| anything else | Flagged "Unrecognised product" on Load Manifest, Contacts and the group name |

To teach the app a new product, edit `siteFromProduct()` in `public/manifest.html`. Agent codes are tidied into names (GETYOURGUIDE → GetYourGuide, KARAWATHACOTTAGES → Karawatha Cottages); add new ones in `agentName()` in the same file. A product name with "Two Day", "2 Day" and so on also sets the hire length, in case you ever add multi-day products in Rezdy.

**Where it shows.**

- **Load Manifest Step 2:** a location pill with start time and agent on each group, and a line counting bookings at each location.
- **Contacts:** a location pill on each card, start time and agent beside the order number, an amber border on home deliveries, and counts by location in the heading.
- **Scanner:** a location badge with start time on group cards (Groups, Summary, previous day) and under the active group. Home deliveries have an amber border.
- **Spreadsheets:** the shared report, the scanner CSV and the Admin archive CSV include the hire location.

**Not in the pickup manifest:** the delivery address and rider requirements. Staff put both in **Order Special Requirements** when booking. The manual's new "Booking details in Rezdy" SOP covers this.

**Manual.** In the Help page and the Claude Doc, Load Manifest is rewritten for the pickup manifest, with a new "Booking details in Rezdy" SOP. Contacts, the Groups tab, Admin, the daily routine and troubleshooting are updated.

**Files changed:** `netlify/lib/ops-core.mjs`, `public/manifest.html`, `public/contacts.html`, `public/scanner.html`, `public/admin.html`, `public/help.html`, `docs/manual.md`, `tests/core.test.mjs`, version labels in the other pages, `package.json`, `netlify.toml`, this file. `public/assets/ops-plus.js` is unchanged from v2.3.

## v2.3

### M-checks

**The rule.** Every bike needs a passed M-check since its last ride. A bike that hasn't had one can still be issued, with an amber warning, and the hire records that it went out unchecked. A bike scanned onto a group by mistake, or swapped before riding, doesn't count as a ride, so its M-check still stands. A multi-day hire needs one check, not one each day.

**Doing a check.** The scanner's Scan tab has a third mode, **🔧 M-check**.

- It lists every bike at the rack that's due a check. Tap one, or scan or type it.
- The checklist follows the M-check order: front wheel and tyre, steering and handlebars, brakes, frame and fork, pedals cranks and chain, saddle and seatpost, rear wheel tyre and gears, battery, motor and display, lights bell and kickstand.
- **All good · sign off** records a pass under the name on the phone. If no name is set, it asks for initials.
- Marking any item as a fault logs an issue in the Issue Reporter, labelled "found in M-check", with the faults, note, odometer and who found it. Brakes, steering, frame and battery faults default to P5, which takes the bike out of service. Staff can lower the priority.
- *Checking in* mode has an option, **M-check each bike as it's checked in**, set per phone. It opens the checklist after each check-in.
- It works offline like the rest of the scanner and sends when signal returns.

**The record.**

- **Asset Register:** each bike shows "✓ M-checked 13/10/26 09:12 · JB" or "🔧 Needs M-check", with a chip that lists the bikes due. A bike's record shows its M-check history: the latest 10, or every check on a date you pick.
- **Download M-check log:** every check as a CSV, with date and time, bike, who signed off, pass or fault, faults, notes, odometer and whether an issue was logged.
- **Register CSV:** adds Last M-check, M-checked By and M-check Due.
- **Each hire:** keeps the M-check that stood when the bike went out. It shows in the scanner CSV and the Admin archive CSVs as "M-check Before Hire", or "NOT CHECKED since last ride", and as "⚠ no M-check" on the group card.
- **Retention:** the M-check log isn't capped, because it's a safety record. It's included in the Admin backup. A yearly download to Drive is good practice.

**Storage.** Two new storage files: `mchecks` (the full log, read only for history and exports) and `mcheck-status` (each bike's latest check and last hire, small, read with the scanner's regular update). The scanner's check every few seconds now makes four small reads instead of three.

**The checklist** is fixed for now, in `netlify/lib/ops-core.mjs` and `public/assets/ops-plus.js`. Keep the two in step if it changes. Editing it in Admin, and separate lists for trailers and eTukTuks, could come later.

**Manual.** The Help page and the Claude Doc have new SOPs for doing an M-check and for checking a bike's M-check on a past day. The scanner, Asset Register, Issue Reporter, Admin, daily routine and troubleshooting are updated.

**Files changed:** `netlify/lib/ops-core.mjs`, `public/assets/ops-plus.js`, `public/scanner.html`, `public/fleet.html`, `public/issues.html`, `public/admin.html`, `public/help.html`, `docs/manual.md`, `tests/core.test.mjs`, version labels in the other pages, `package.json`, `netlify.toml`, this file.

## v2.2

**New file: `public/assets/ops-plus.js`.** Every tool page loads it after `ops-client.js`. Make sure it's deployed alongside the pages.

**Who's using this phone.**

- A 👤 button sits beside Back and Help on every tool page. The first time the app opens on a phone, it asks staff to pick their name, and it's remembered on that phone.
- The team list is kept in **Admin → Team**. Anyone can add a person (full name and initials, 1–5 letters, unique among current staff), edit them, or retire someone who has left. Retired names stay on old records.
- **Filled in automatically (still editable):** initials on issue reports and updates, the "repaired by" name, scan-to-move and location changes.
- **Recorded against the action:** issued by, checked in by, taken off by, Returned by, exception by, and the initials on check-in moves. These show in the scanner (for example "in 3:42 pm · JB" and "✓ RETURNED · JB"), in the scanner CSV and in the Admin archive CSV (Issued By, Checked In By, Taken Off By).
- It's an honest system, not a sign-in. Anyone can pick any name.

**Previous day, read-only.** A *Today / Previous day* switch on Contacts and on the scanner's Groups and Summary tabs. It shows the previous manifest as it was when the next one was loaded: customers, groups, bikes, check-ins and exceptions. A reload of the same date doesn't count as the previous day. It's fetched only when the switch is tapped.

**Overdue carry-over.** Loading a manifest now also carries across any earlier group with bikes not checked in and not marked Returned. This is in addition to multi-day hires still running.

- These groups show a red **OVERDUE · out since …** badge in the scanner and an **Overdue** badge on Contacts. Bikes already checked in stay ticked.
- They keep carrying each day until checked in and Returned.
- No-show groups (no bikes) and groups closed with an exception aren't carried.
- A multi-day hire not returned after its last day becomes overdue.
- The Load Manifest log says how many were carried and how many are overdue, and the Summary tab counts overdue groups.

**Typed bike IDs without leading zeros.** In the scanner (issuing and checking in), the Issue Reporter (Report and Resolve) and Move bikes, typing **12** or **eb12** finds EB-012 when it's the only match. The full registered ID is recorded. If more than one bike matches, staff are asked to type more. Unregistered IDs are used as typed. Scanned barcodes are unchanged.

**Manual.** The Help page and the Claude Doc are updated:

- Getting started has new sections: "Your name on this phone" and "Typing a bike ID".
- There are new SOPs for an overdue group and for adding a team member.
- Load Manifest, Contacts, the Groups tab and troubleshooting are updated.

**After deploying:** add your team in Admin → Team, then each person picks their name on their phone.

**Not in this version:** the new scanning engine. It's waiting on the phone model and label photos.

**Files changed:** `netlify/lib/ops-core.mjs`, `public/assets/ops-plus.js` (new), every page in `public/`, `docs/manual.md`, `tests/core.test.mjs`, `package.json`, `netlify.toml`, this file.

## v2.1

### Bike locations

**Where every bike is.** Each bike in the Asset Register has a current location.

- The starting locations are VIC (Visitor Centre), OXB (Oxenberry Farm), HOM (Home storage and workshop) and TRA (Trailer).
- While a bike is out with a group, it shows "Out with Smith (x2)" over its location without changing it.
- Chips above the list count bikes at each location, out on hire, and with no location. Tap a chip to filter.
- The register CSV has a Location column.

**Three ways a bike moves, all logged.**

1. **By hand:** change Location on the bike's record. Initials are needed for an existing bike, but not when a new bike gets its first location.
2. **Scan to move:** tap *Move bikes to a location*, choose the destination, enter initials, then scan or type each bike. Each line shows moved (from where), already there, or not in the register. This needs a connection, unlike the Group Scanner.
3. **Check-in:** the scanner's *Checking bikes in* mode has a **This phone is at** setting. It's set once per phone and remembered. Every bike checked in on that phone, by scan or tick box, moves there. If it isn't set, check-in still works and staff are reminded to set it.

A spreadsheet import with a Location column (code or name) also moves bikes, logged as "spreadsheet".

**History.** Every change is recorded with the time, bike, from, to, how (by hand, scanned, checked in, spreadsheet) and initials. Check-ins record the group name instead of initials, because the scanner has no staff names.

- A bike's record shows its last 10 moves.
- *Download move history* gives the full log as a CSV.
- The Admin backup includes it.
- History is kept in its own storage file, capped at the latest 20,000 moves. That's years at your volumes. It keeps the register the scanner reads every few seconds small.

**Managing locations.** The Asset Register has a Locations section where anyone can add, rename or retire a location. A location can only be retired once no bikes are there. Retired locations keep their history and can be restored. New locations appear in the scanner's "This phone is at" list straight away.

**After deploying:** existing bikes have no location yet, and show "No location" with a chip to list them. The quickest way to fill them in is to download the register CSV, fill in the Location column, and load it back. Then set "This phone is at" on each phone.

**Manual.** New SOPs for moving bikes between locations and for adding or retiring a location. Checking in, the Asset Register description, the daily routine and troubleshooting are updated. The changes are in both the Help page and the Claude Doc.

**Files changed:** `netlify/lib/ops-core.mjs`, `public/fleet.html`, `public/scanner.html`, `public/index.html`, `public/help.html`, `docs/manual.md`, `tests/core.test.mjs`, version labels in the other pages, `package.json`, `netlify.toml`, this file.

## v2.0

**Load the Rezdy session manifest from now on.** The session manifest keeps the same columns every day and has one row per booking. The mobile and daily exports drop columns that are empty that day. The importer still reads the mobile export, so an old file won't break anything, but use the session manifest.

**Order Special Requirements** show in small grey text under each group in the scanner (Scan and Groups tabs), on Load Manifest Step 2 and on the Contacts card. Long text is cut to two lines; tap to read it all. A drop-off location shows too, when the file has one. Special requirements aren't included in the archive spreadsheets.

**Check-in before Returned.**

- The Scan tab has a switch: *Issuing bikes* or *Checking bikes in*. In check-in mode, a scan ticks the bike in on whichever group has it out. Mixed returns don't need sorting by group first.
- Each bike on the Groups tab has a tick box and shows its check-in time. The count reads "2 of 3 checked in".
- **Returned** only works when every bike is ticked in. Otherwise the button reads "Returned (1 not in)" and opens *Return with exception*. Staff choose a reason for each missing bike: left at location to collect, damaged with an issue logged, missing, or other with a note. The reasons go on the group's record and into the spreadsheets.
- *Undo Returned* reopens a group and clears its reasons.
- A bike that has been checked in can go straight to another group without the "also in" warning.

**Multi-day hires.** Rezdy only lists a multi-day hire on its first day, so the app keeps track.

- Hire length comes from **"2 day hire"** (2–7) in the booking's Rezdy internal notes. Staff can also set it in the Days column on Load Manifest, or on the group card. Nothing else from the internal notes is read or shown.
- Groups show "Day 1 of 2", "Day 2 of 2" and so on, in the scanner, on the Contacts card and in the shared report.
- **Out overnight** is available before the last day.
- Loading the next manifest carries the group over with its bikes and contact. This also works when reloading the same day or when a day is skipped. A group marked Returned early isn't carried.

**Flag fix.** Bookings written as "7 unisex ebike" are no longer flagged as non-standard.

**Spreadsheets.** The scanner CSV, the Load Manifest archive CSV and the Admin archive CSVs gain Hire Day, Checked In At and Not Back Reason columns.

**Manual.** The Help page and the Claude Doc have new SOPs: marking a multi-day hire in Rezdy, checking bikes in, a bike that doesn't come back, and multi-day hires. Loading, issuing, end of day, the daily routine and troubleshooting are also updated.

**Before the first busy day:** groups loaded under v1.9 have no hire length or order number. Multi-day carry-over starts with the first manifest loaded after this deploy.

**Files changed:** `netlify/lib/ops-core.mjs`, every page in `public/`, `docs/manual.md`, `tests/core.test.mjs`, `package.json`, `netlify.toml`, this file.

## v1.9

**Issue updates.** Any issue, open or resolved, can take updates.

- Tap an issue on the Log tab to see its history and add an update: what has changed, initials (required) and an optional odometer reading.
- On an open issue an update can change the priority. Raising to P5 takes the bike out of service straight away (after a confirmation); lowering from P5 puts it back. Resolved issues take notes but not priority changes.
- The Resolve tab shows the updates on the matched issue, with a "Not fixed yet? Add an update" button.
- The Log list shows how many updates each issue has. The shared list includes the latest update. The CSV adds Updates, Latest Update and Update History columns.

**Odometer on every report.** Reporting an issue now needs the odometer reading in km.

- The form shows the last reading recorded for that bike, from earlier reports and updates, and asks for confirmation if the new reading is lower.
- If the display can't be read (flat battery, broken screen), staff tick "Can't read it" and the report still saves.
- Issues logged before v1.9 show "Not recorded".

**Purchase price, disposal date and sale price in the Asset Register.**

- New fields: purchase price, and a Disposal group with disposal date, sale price and a short disposal note. A sale price or note needs a disposal date; a disposal date can't be before the purchase date or in the future.
- A bike with a disposal date drops out of the active fleet. It's hidden from the list (the count line shows how many and toggles them on), and fleet age and purchase cost stats cover active bikes only.
- The Group Scanner warns, amber, if a disposed bike is scanned. It still adds it, the same way as an unregistered barcode.
- *Remove from register* is now only for records entered by mistake; the confirm text says so.
- Spreadsheet import and export include Purchase Price, Disposal Date, Sale Price and Disposal Note. Export adds a Status column (Active or Disposed). **Import change:** a column that isn't in the file now leaves that detail as it was. Before, a missing column blanked it.

Purchase and sale prices are visible to anyone with the staff PIN. If that's a problem, they can be moved behind a separate admin PIN later.

**Archives as spreadsheets (Admin).**

- Each archive has **View** (a readable table on the page) and **CSV** (a flat spreadsheet). The JSON download is gone; the full backup still exists.
- One row per bike: tour date, archive time and reason, group, group status, whether the group was deleted, bike ID, brand, model, scanned at, taken off at and why. Empty groups get one row. Customer phone numbers aren't included.
- **Download as one CSV** puts every archive between two tour dates in one file, oldest first. It reads four archives at a time and shows progress.
- Dates are written dd/mm/yyyy hh:mm, so Excel set to Australian dates reads them as dates.
- Archives from before v1.7 have no brand or model saved, so the page fills those in from today's register.

**Manual.** The Help page and the Claude Doc are updated for all of the above.

**Files changed:** `netlify/lib/ops-core.mjs`, `public/issues.html`, `public/fleet.html`, `public/scanner.html`, `public/admin.html`, `public/help.html`, `docs/manual.md`, `tests/core.test.mjs`, version labels in the other pages, `package.json`, `netlify.toml`, this file.

## v1.8

**Returned asks first.** Tapping ✓ Returned on a group now asks "Mark … as returned?" before it applies. Returned is the point where those bikes can be scanned into another group without a warning, so it shouldn't happen by a stray tap. Un-marking (tapping Returned again) and 🚴 Out don't ask.

**Bike changes leave a trail.** Tapping × on a scanned bike now asks why it's coming off:

| Choice | Use it when |
| --- | --- |
| 🔁 Swapping for another bike | The customer wants a different bike. Scan the replacement straight after. |
| 🔧 Fault found | The bike has a problem. The app reminds staff to log it in the Issue Reporter too. |
| ✕ Scanned by mistake | The bike never went out with this group. |

- The bike leaves the group but stays on its record under *Taken off this group*, with the time it was scanned on, the time it came off, and the reason. This shows on the Scan, Groups and Summary tabs.
- The bike is free to be issued again straight away, to another group or the same one, with no warning.
- *Clear all* records each bike as "group cleared" rather than wiping them.
- Deleting a group keeps a hidden copy for the day, so its bikes still appear in the day's archive and the `/admin` backup.
- The shared report, the scanner CSV and the Load Manifest archive CSV include taken-off bikes, with "Taken Off At" and "Reason" columns.
- The trail belongs to the day. It's archived with everything else when a new manifest is loaded or the scanner is reset.

The trail doesn't record *who* took the bike off; the scanner has no staff names. If that matters later, asking for initials (as the Issue Reporter does) is a small addition.

**Help & SOPs page (`/help`).** The user manual and SOPs are built into the app.

- A *Help & SOPs* tile on the home screen opens the full manual, with section chips across the top.
- Every tool page has a **? Help** button beside *Back*, which opens the manual at that tool's section.
- The page is static. It has no customer data and doesn't need the staff PIN to load.

To change the manual, edit `docs/manual.md`, then run `python3 tools/build_help.py` (needs `pip install markdown`) to rebuild `public/help.html`, and deploy. Don't edit `help.html` directly; the next build overwrites it.

**Files changed:** `netlify/lib/ops-core.mjs`, `public/scanner.html`, `public/manifest.html`, `public/help.html` (new), `docs/manual.md` (new), `tools/build_help.py` (new), `tests/core.test.mjs`, version labels in the other pages, `package.json`, `netlify.toml`, this file.

## v1.7

**Serial numbers in the Asset Register.** Every bike now needs both a Bike ID and a serial number.

- The add/edit form has a Serial number field with its own 📷 button, for frames that carry a serial barcode. Typing works too.
- The app won't save a bike without a serial, and won't let two bikes share one ("WTU 123" and "WTU123" count as the same).
- Bikes entered under v1.6 have no serial yet. They show a *Serial number missing* tag, and the count line at the top offers a filter to list just those bikes. Opening one goes straight to the serial field. Any edit to one of these bikes needs the serial filled in before it will save.
- Spreadsheet import, export and template now include a **Serial Number** column. An import with a missing serial on any row, or two rows with the same serial, is refused with the row number, and nothing is changed.
- Search matches serial numbers.
- The Issue Reporter shows the serial on the bike details card, saves it with each new issue, and includes it in the issues CSV.

**Bike model in the Group Scanner.** Each scanned bike now shows its barcode and its brand and model.

- On the Scan tab, under each barcode. The confirmation after a scan reads, for example, "✓ EB-012 · Gazelle Medeo T9 added", so staff can check the bike in their hand matches.
- On the Groups and Summary tabs, each group lists one line per bike (barcode, then model) in place of the old barcode tags.
- A barcode that isn't in the register shows *Not in asset register*, and the scan confirmation turns amber. The bike is still added; this is a prompt to check the ID, not a block.
- The shared report and the scanner CSV include brand and model. So does the archive CSV from the Load Manifest page.
- The server records brand and model on each bike at the moment it's scanned, so archived days still say what went out even if a bike is later edited or removed from the register.

Bikes scanned before v1.7 still show their model on screen (looked up from the register), but archives saved before the upgrade only have barcodes.

**Files changed:** `netlify/lib/ops-core.mjs`, `public/fleet.html`, `public/scanner.html`, `public/issues.html`, `public/manifest.html`, `tests/core.test.mjs`, version labels in the other pages, `package.json`, `netlify.toml`, this file. `public/assets/` and `netlify/functions/ops.mjs` are unchanged.

**One cost to know about.** The scanner's 8-second check now also reads the asset register, so each poll is three small storage reads instead of two. With the polling limits from v1.5 this should sit well inside the free plan, but it's worth a glance under Netlify **Usage** after the first busy week.

## v1.6: Asset Register (`/fleet`)

One record per bike, keyed by the barcode ID:

| Field | Notes |
| --- | --- |
| Bike ID | From the barcode; scan or type it |
| Serial number | Added in v1.7; required |
| Key number | |
| Brand, model | Suggestions appear from bikes already entered, keeping spelling consistent |
| Frame or rim size | Free text, e.g. M, 52cm, 20in |
| Date of purchase | Age in months is worked out from this each day |

- Each bike shows whether it has open issues or is out of service.
- A fleet-age summary shows average age and counts under 2 years, 2–4 years and 4+ years.
- **Load the whole fleet from a spreadsheet.** Tap *Get template*, fill it in on a computer, then *Choose CSV*. Day-first dates (15/09/2024) are understood. Running the import again updates existing bikes rather than duplicating them.
- *Download CSV* exports the register with age in months, for insurance, depreciation or a stocktake.
- "Add bike" won't overwrite a bike that's already registered; it offers to open that bike instead.

**In the Issue Reporter:**
- Entering or scanning a bike ID shows its brand, model, key number, size and age, so staff can check it's the right bike.
- An ID that isn't in the register is flagged, and staff are asked to confirm before logging it.
- Each new issue saves the bike's details as they were at the time, so the history stays accurate even if a bike is later sold or edited.
- Bike details also appear on the Resolve screen, the issue log, the shared report and the issues CSV.

The register is included in the `/admin` backup.

## Changes in v1.5

**Storage moved from JSONBin to Netlify Blobs.** Blobs is built into Netlify, so there is no separate account, no API key and no request quota from a third party. Data stays with the site.

**Phones send changes, not whole copies.** Each scan, new group or issue report is sent as one small action, and the server applies it to the latest data. Two phones scanning at the same moment no longer overwrite each other. Rapid scanning on one phone no longer drops bikes.

**Scans survive bad signal.** The scanner queues scans on the phone until the server confirms them. The queue survives a page reload, and the last known groups are kept on the phone so the scanner still works with no signal. The status in the top-right shows "saving 2…" or "1 unsaved · retrying" until everything is through.

**Far fewer requests.**

| Page | Before | Now |
| --- | --- | --- |
| Scanner | every 4s, plus issues every 15s | every 8s, one request covers both |
| Contacts | every 10s | every 60s |
| Issues | every 5s | every 20s |

All pages stop checking completely when the phone is locked or the tab is in the background. They slow to once a minute after 10 minutes with nobody touching the screen. A scanner left open on a locked phone now costs nothing.

**Staff PIN is now required.** The API refuses to run without `SAEBIKES_STAFF_PIN` set (minimum 6 characters). Customer phone numbers are no longer readable by anyone who finds the URL.

**Server-side safety nets.**
- The server refuses out-of-service bikes, even if a phone's fleet status is out of date.
- It warns when a bike is already in another group that hasn't been marked Returned.
- Loading a new manifest or resetting the scanner archives the previous day on the server first. Archives can be downloaded from `/admin`.

**Smaller fixes.**
- The manifest date is now chosen on the page, pre-filled from the file name. A renamed CSV can't silently lose its date.
- Contacts shows today's or tomorrow's manifest as current; anything else is flagged as out of date. Previously yesterday's counted as current.
- "Reset All Data" is removed from the Issue Reporter. The maintenance history can't be wiped from a phone.
- The Issue Reporter keeps the form filled in if a report fails to save, and won't double-log on a slow connection.
- The QR scanner library is now hosted with the site instead of loaded from unpkg.com.
- Content Security Policy tightened. Search engines are told not to index the tools.
- The "active group" is now per phone. Choosing a group on one phone no longer affects another.

## Folder layout

```text
public/                         ← the website (what staff see): one .html per tool, help.html, robots.txt
  assets/ops-client.js          ← PIN and talking to /api/ops, used by every page
  assets/ops-plus.js            ← team name, locations, phone numbers, guest messages
  assets/scan.js, assets/vendor/ ← scanners, phone-number rules, QR drawing
netlify/functions/ops.mjs       ← the API at /api/ops (picks live or preview stores)
netlify/functions/backup-nightly.mjs ← the nightly backup (scheduled)
netlify/lib/ops-core.mjs        ← the data rules (tested)
netlify/lib/backup-core.mjs     ← backups, restore, retention (tested)
docs/manual.md                  ← the manual; tools/build_help.py builds public/help.html from it
tools/check.mjs                 ← npm run check, before every release
tests/                          ← automated tests and a local test server (not deployed)
netlify.toml, package.json, package-lock.json
```

## Deploying

This version has a code dependency (`@netlify/blobs`), so Netlify needs to install it. **Dragging a ZIP onto Netlify will not do that.** Use one of the following.

### Option A — GitHub (the way we release; see "Releasing a new version" above)

1. Put this folder in a private GitHub repository.
2. In Netlify: **Site configuration → Build & deploy → Link repository**, and pick the repo.
3. Netlify reads `netlify.toml`, installs the dependency and deploys. Future changes deploy when you push to GitHub.

### Option B — Netlify CLI (quickest one-off)

On a computer with Node.js 18 or later:

```bash
npm install -g netlify-cli
cd <this folder>
npm install
netlify login
netlify link          # choose your existing operations site
netlify deploy --build --prod
```

## Environment variables (Netlify → Site configuration → Environment variables)

| Variable | Needed? | Notes |
| --- | --- | --- |
| `SAEBIKES_ADMIN_PASSWORD` | Yes, from v3.2 | At least 8 characters, different from the staff PIN. Protects Admin and the team's contact details. |
| `SAEBIKES_STAFF_PIN` | **Required** | At least 6 characters. A short phrase is better than a number; staff only type it once per phone. |

Set it for all deploy contexts, so previews work too. Redeploy after changing environment variables. Any `JSONBIN_…` variables are no longer used and can be deleted.

## Good habits

- The live data is backed up and checked every night. Download the off-site copy from Admin each month (the home screen reminds you).
- Do the restore drill in the manual once a year, in winter, on a preview.
- Netlify shows Blobs and function usage under **Usage** in the dashboard. Look there in the first busy week to confirm usage is comfortably inside the free plan.

## Testing (for whoever maintains this)

```bash
npm install
npm test                      # data rules and backups, including two phones scanning at once
npm run check                 # everything above, plus the release checks; run before every release
node tests/dev-server.mjs     # local copy at http://localhost:8888, PIN testpin1
DEV_CONTEXT=deploy-preview node tests/dev-server.mjs   # the same, behaving as a preview
```
