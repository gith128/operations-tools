## Getting started

Operations Tools is the staff web app we use to issue bikes, contact customers, track faults and keep the fleet register. It runs in the phone's browser, and every phone sees the same data within seconds.

Each section of this manual has two parts. **How it works** explains the screen. **SOP** is the procedure staff follow, step by step.

### Opening the app

1. Open the Operations Tools address in Safari or Chrome. Add it to the home screen so it opens like an app.
2. The first time on a phone, the app asks for the **staff PIN**. Enter it once; the phone remembers it.
3. The home screen lists the tools in the order of a typical day: Today's Contacts, Site Checklists, Roster, Group Scanner, Show QR, Asset Register, Issue Reporter, Lost Property, Load Manifest, and Help & SOPs. Admin and the Dashboard are opened from links at the top of Load Manifest. The Fleet report is opened from the Dashboard or the Asset Register. Admin can change the order of the tools and hide any of them (**Configuration → Home screen**), the same on every phone; a hidden tool still opens from its address.
4. Every page has a **Back to Operations Tools** button at the top left.

Under the heading, the home screen shows the **backup line**:

- **Green, "✓ Backup: last good 2:31 am today":** the data was backed up and checked overnight. Nothing to do.
- **Amber, "Some daily archives weren't copied":** last night's backup is good, but copying some daily archives failed. They're tried again the next night. Mention it to the manager if it's still amber after two days.
- **Red, "⛔ No good backup since …" or "The last backup didn't finish":** the last backup failed or was cut off, or none has been taken for 36 hours. Tell the manager the same day. See "SOP: The backup line is red" under Admin.
- **"📥 Off-site backup download due":** it's more than 30 days since a copy was downloaded. This is the manager's job, not the counter's.

When there's a roster, **On today** sits under the backup line: who's working where today, and your own next shift. Tap it to open the Roster.

A blue **PREVIEW** banner means you're on a test copy of the app, not the live site. Nothing done there reaches the live data. Staff phones should never be on a preview; if one is, go back to the usual address.

The staff PIN protects customer names and phone numbers. Don't write it on the phone or share it outside the team. If a phone is lost, change the PIN in Netlify and give staff the new one.

### Your name on this phone

The first time the app opens on a phone, it asks **Who's using this phone?** Tap your name. The 👤 button at the top of each page shows your initials; tap it to change or clear them.

Your initials then fill in automatically on issue reports, updates, repairs and bike moves (you can still change them on the form). They're also recorded against bikes you issue, check in or take off a group, and groups you mark Returned. If your name isn't on the list, add it under **Admin → Team**.

### Typing a bike ID

When you type a bike ID instead of scanning it, leave out the leading zeros and the dash: **12** or **eb12** finds EB-012. The full ID is what gets recorded. If more than one bike matches, the app asks you to type more of the ID.

### Scanning barcodes

Every phone uses the **new scanner** unless someone has chosen otherwise. It uses a sharper camera picture and reads only what's inside the green box: fill the box with the barcode, about 15–20 cm away. Labels on flat parts of the frame read best; on round tubes, the curve can stop any scanner reading them.

- **Starting the scanner…** shows briefly the first time on a phone, while it downloads the scanner (about 1 MB). The home screen fetches it in the background, so usually it's already there.
- **Trouble scanning?** Tap **Use the classic scanner** under the camera, then stop and start scanning. It's set per phone, and **Use the new scanner** switches back.
- **"Classic scanner (the new one couldn't start here)"** means the phone has fallen back to the classic scanner by itself, usually because the download didn't finish on a poor signal. Scanning still works. It tries the new one again next time you start scanning.

### The status light (top right)

| Shows | Means | What to do |
| --- | --- | --- |
| Green, "live" | Connected and up to date | Nothing |
| Amber, "saving 2…" | Changes are on their way to the server | Wait a few seconds |
| Red, "1 unsaved · retrying" | No signal; changes are held on the phone | Keep working. They send when signal returns. Don't close the browser tab. |
| Red, "offline" | Can't reach the server | Check signal, then tap the light to retry |
| Red, "PIN needed · tap here" | The PIN was wrong or has changed | Tap the light and re-enter the PIN |
| Red, "1 not saved · tap" (Group Scanner) | The server refused a change, for example an out-of-service bike, or a Delete group sent after a new day was loaded | Tap the light to see what wasn't saved and why. OK clears the list. |

### Bad signal

The Group Scanner keeps working with no signal. Scans are queued on the phone and survive a page reload. Other pages need a connection to save. When you save, you'll see one of three things:

- **✓ Saved** (or similar): it's saved.
- **Not confirmed:** no answer came back, so it may or may not have saved. The form stays filled in. Tap Save again when you have signal: it can't make a duplicate, and if the first one did save, it just says so.
- **Not saved, with a reason:** the server refused it (for example, someone else changed the same record since you opened it). Read the reason; nothing was saved.

A save that gets no answer is tried once more by itself a few seconds later, so most dropouts sort themselves out without you noticing.

**Two people changing the same thing.** If someone else changed a bike, a lost item, a contact, a location or an Admin setting after you opened it, your save is refused rather than quietly overwriting theirs. The page shows their latest version: open it again and make your change.

**Delete group, Clear all and Reset day** made on a phone with no signal are refused if a new day's manifest has been loaded before the phone reconnects, so yesterday's tidy-up can't wipe today's groups.

Pages check for updates less often when nobody is touching the screen, and stop completely when the phone is locked. Tap the status light to refresh straight away.

### Undo and corrections

Mistakes are put right in one of three ways. Nothing is erased: the original stays on the record, and the record shows who put it right and when.

- **Undo (10 seconds).** After adding a bike to a group, checking a bike in, marking a group Out, a Dandelion drop-off or signing off an M-check, a dark bar at the bottom of the screen offers **Undo** for 10 seconds. One tap reverses it; no reason is asked. A bike checked in goes back to where it was; an M-check sign-off undone leaves the bike due again. The record shows **↶ Undone** with the time and initials.
- **Correction (any time after).** A sheet asks for your initials and a reason, then shows **✎ Corrected** with the time, initials and reason on the record. Each record can be corrected once. Corrections are:
    - **Untick a checked-in bike** (Groups tab): it goes back to being out, and moves back to where it was.
    - **↶ Undo drop-off** on a group dropped at Dandelion: its bikes go back to being out, move back, and the group is open again.
    - **↶ Restore** a group deleted today (Deleted today, at the bottom of Groups). Any of its bikes that have since gone out with another group stay with that group.
    - **Void** an M-check signed off wrongly (Asset Register → the bike → M-check history): the bike is due again.
    - **↶ Reopen: not fixed** on an issue marked repaired by mistake (Issue Reporter → the issue).
    - **✎ Logged in error** on an issue logged on the wrong bike, or that wasn't a real fault: it's closed and left out of repeats, time out of service and the Dashboard. Log it again on the right bike.
    - **↶ Restore** a bike removed from the register by mistake (Asset Register → Removed bikes): it comes back as it was, and past days count it as in the fleet all along.
- **Just edit it.** Asset details, contacts, a group's location or hire length, lost property details and notes are simply edited, as before.

**Not reversible here:** loading a manifest (Load Manifest warns first), Reset day, a message already sent to a guest, and site checklist sign-offs (sign again instead). Anything else lost can be recovered from the nightly backups in Admin.

## Load Manifest

Load Manifest takes the day's Rezdy **pickup manifest** and sets up the scanner groups and the contact list on every phone. It is the first job of each hire day. It replaces the previous day's groups, except multi-day hires still running and groups with bikes still out, which carry over with their bikes.

### How it works

- **Step 1** takes the Rezdy **pickup manifest** export (CSV). Each booking becomes a group named after the customer and bike count, for example "Smith (x2)". Use the pickup manifest: it's the only export that says where each hire is.
- **Step 2** shows the tour date (taken from the file name, which you can change) and, for each group:
    - where the hire is, read from the Rezdy product name using each location's matching words (for example "Beresford" → **📍 Beresford**, "Deliver" → **🚚 Home Delivery**), with the start time and the agent (for example GetYourGuide);
    - its bike count, and a flag on any group booked with non-standard equipment: child seat, cargo, eTukTuk, surf rack or another named bike type;
    - the booking's **Order Special Requirements** in small grey text (tap to read all of it);
    - any phone number that was corrected (for example "+1 0411… → +61 411…"), or that still doesn't look valid (**Check number**);
    - a **Days** column with the hire length. It reads "2 day hire" (or 3, up to 7) from the booking's internal notes in Rezdy. Change it here if the note was missed.
- Under the table, a line counts bookings at each location. A product whose name matches no location is flagged **Unrecognised product**, and one that matches more than one location is flagged with both, so the wrong location can't be picked silently. The **📊 Dashboard** link at the top of the page opens the Dashboard.
- **Check before loading** appears under the table when the file has a product to look at:
    - **🆕 New product:** a product name the app has never seen in a manifest before, with the location it will go to and the word that matched. New and renamed Rezdy products are when a booking is most likely to land in the wrong place, so check it's right.
    - **⚠ Matches 2 locations:** it shows which wins (the first) and which else matched.
    - **❓ No location:** no location's words appear in the name.

    Every product name and where it went is kept in **Admin → Rezdy products**.
- The date warning appears if the date is in the past, or more than a day ahead. The Contacts page only treats today's and tomorrow's manifest as current.
- **Push to Scanner + Contacts** replaces the groups on every phone. If the same date is already loaded and bikes have been scanned for it, it asks first: loading it again takes those scans off every scanner (they stay in the day's archive). Before it replaces anything, the server archives the current groups and scans, and the page downloads them as `Group_File_<date>.csv`. Multi-day hires still running, and any group with bikes not yet checked in (marked Overdue), are carried into the new day with their bikes, and the log says how many. Then it opens the Group Scanner by itself, unless there's a product to check first.
- **No bookings today** (under the upload box, with a date): loads a day with no bookings, after you confirm. Everything a real upload does still happens: the current day is archived and downloaded, its summary saved, and multi-day and overdue groups carried over. A file with no bookings in it shows a warning with **Continue: no bookings** or **Choose another file**.
- **📊 Dashboard** and **⚙️ Admin** links sit at the top of the page.
- **Download Archive CSV Only** saves the current groups without loading anything new.

Only the hire length is read from the internal notes. Nothing else in that field is shown to staff.

### SOP: Booking details in Rezdy

Who: whoever takes the booking. When: as soon as it's booked, or when details change.

1. **Multi-day hire:** in **internal notes**, write the hire length exactly like this: **2 day hire** (or 3 day hire, and so on). It can sit anywhere among other notes. Don't write that phrase for any other reason.
2. **Home delivery:** put the delivery address and collection time in **Order Special Requirements**, for example "Deliver to Unwind Cottage, Karawatha Cottages. Collect 5pm." The pickup manifest doesn't carry the delivery address anywhere else.
3. **Rider requirements:** heights, experience, a nervous rider, anything the team should know at hand-over, also go in **Order Special Requirements**.

### SOP: Loading the day's manifest

Who: whoever opens. When: before the first booking arrives, or the evening before for an early start.

1. Check the previous day's groups are returned. Any with bikes still out carry over as Overdue, and multi-day hires carry over on their own.
2. In Rezdy, export the **pickup manifest** for the day as CSV.
3. Open **Load Manifest** and choose the file in Step 1.
4. In Step 2, confirm the **tour date** is correct. Fix it if the file was renamed.
5. Read the group list. Check each booking's location: deliveries need bikes on the trailer, Oxenberry bookings need bikes at Oxenberry. For every flagged group, check the booking in Rezdy and set aside the right equipment. Read any special requirements.
6. If **Check before loading** lists a **new product**, check the location it shows is right. If a booking shows **Unrecognised product** or matches two locations, check in Rezdy where it's hired from, then teach the app: in **Admin → Rezdy products**, try a word on that location and save it (or tap **Words** on the location in **Asset Register → Locations**). Reload the manifest file to pick it up.
7. Check the **Days** column against the multi-day bookings you know about. Set it by hand if a longer booking shows 1.
8. Note any bookings missing a phone number or marked **Check number**, and confirm the number at check-in.
9. Tap **Push to Scanner + Contacts**. Keep the downloaded `Group_File` CSV if you want a local copy; the server has its own. When it's loaded, the page goes straight to the Group Scanner, ready to issue the first booking. If there was something to check (a product with no location, or two), it waits instead: tap **Go to the Group Scanner →** when you're ready.
10. Open the Group Scanner on the hire phone and check the groups have appeared (within about 10 seconds), including any multi-day hires carried over.

If a walk-in or late booking arrives after loading, don't reload the manifest. Add the group by hand in the Group Scanner (see below), so scans already made aren't archived away.

## Today's Contacts

Today's Contacts lists every booking from the loaded manifest with one-tap call, SMS and WhatsApp buttons. Staff use it to reach a customer who is late, lost or overdue, without opening Rezdy.

### How it works

- Each card shows the customer's name, order number, start time and agent, where the hire is (for example 📍 Visitor Centre or 📍 Beresford, or 🚚 Home Delivery with an amber border), the bikes booked and any equipment flags. The heading counts bookings at each location.
- A multi-day hire shows a badge such as **Day 2 of 2** beside the order number. Special requirements and any drop-off location appear in small grey text; tap to read all of it.
- Tap a number to call, or use the SMS and WhatsApp buttons. The contact button saves that one customer to the phone as a vCard.
- **Save all to Contacts (.vcf)** saves every customer at once. This helps WhatsApp show names in group chats.
- The heading shows the manifest date. If the loaded manifest isn't today's or tomorrow's, the page says it is out of date and shows no customers.
- The list refreshes about once a minute. Tap **Refresh** after a new manifest is loaded.
- Phone numbers are checked when the manifest is loaded. A corrected number says what was changed, for example an Australian number Rezdy gave as +1. A number that still doesn't look valid shows **check number**: confirm it with the customer at check-in.
- **💬 Message** opens the guest messages: running late for pickup, late returning, weather warning, and the guest links (Ride Guide, online waiver, Google review). The likely one is marked **Suggested**. Check the wording, tap **Text** or **WhatsApp**, then answer **Was it sent?** when you come back. The card shows the latest message and whether it was sent, not sent, or not confirmed.
- Walk-ins appear with a **Walk-in** tag once they have a contact. **+ Add phone** or **Edit** adds or changes their number; it's checked the same way.
- The **Today / Previous day** switch at the top shows the previous manifest's customers, read-only, for follow-up calls such as a forgotten jacket or a damage query.
- A customer whose bikes are still out from an earlier day shows a red **Overdue** badge.
- The **By time / By location** switch orders the cards: by start time, or grouped by hire location (Visitor Centre, Oxenberry Farm, Beresford and so on, then Home Delivery). Hires carried over from an earlier day (overdue or multi-day) always come first. Each phone remembers its choice.

### SOP: Contacting a customer during the day

1. Open **Today's Contacts** and check the date in the heading is today.
2. Find the customer by name or order number.
3. Use the channel that suits them. If a call isn't answered, try WhatsApp, which overseas visitors on travel SIMs can often still receive.
4. For an overdue group, call first, then SMS with our number and a simple question ("Are you OK? Do you need a hand getting back?").
5. Record anything important, such as a breakdown or a changed return time, in the Issue Reporter or with the person running the day.

Customer phone numbers are private. Save customers to a phone only for the day's work, and delete them once their hire is finished.

## Group Scanner

The Group Scanner records which bikes go out with which booking, and checks them back in. Every bike issued is scanned onto its group and ticked in when it returns, so at any moment we can see who has which bike, and the day leaves a record.

### How it works

**Scan tab**

- The switch at the top chooses what scanning does: **🚴 Issuing**, **✓ Checking in** or **🔧 M-check**. The phone keeps the one chosen for the rest of the day, and starts each new day in **🚴 Issuing**.
- **When a job is done, the screen moves on to the next one by itself.** It never changes anything by itself: marking a group out or returned always takes a tap. It always says where it has gone, for example "✓ Smith (x2) out · Next: Jones (x3), 10:30", so if that's not who's at the counter, tap a different group.
- **🚴 Issuing:**
    - **Active Group** chips across the top: the groups still waiting to go out, soonest first, each with its start time and bikes scanned against bikes booked (for example "1/2"). Tap one to make it the group you're scanning into on this phone. Groups already out or back are behind **Show all**. Each phone chooses its own active group.
    - Under the chips, the active group shows its progress ("1 of 2 bikes scanned", then "✓ 2 of 2"), any equipment the booking needs (for example **Needs 1× Child Seat**), its location, a multi-day hire's day ("Day 2 of 2") and special requirements.
    - **🚴 Mark Smith (x2) out**, under the bikes scanned, marks the group out. It turns green when every booked bike is scanned; before that it asks first. The next group waiting becomes active, and the camera stays on.
    - Arriving from Load Manifest, the scanner opens in **🚴 Issuing** with the first group due already active.
    - **Start Scanning** opens the camera. Hold the bike's barcode in the box. You can also type the ID in the box below and tap **+**.
    - Each scanned bike shows its barcode, brand and model, and scan time. The confirmation reads, for example, "EB-012 · Gazelle Medeo T9 added". Check it matches the bike in front of you.
- **✓ Checking in:** scan each bike as it comes back. It's ticked in on whichever group has it out, so a mixed return doesn't need sorting first. The list shows each group with bikes still out. When every bike in a group is back, it moves to the top with a **Mark returned** button, so there's no need to go to the Groups tab. Set **This phone is at** once on each phone (VIC, OXB, TRA and so on); every bike checked in on that phone, by scan or by tick box, is moved to that location in the Asset Register. The first time each day, the app asks where you're checking in, and each confirmation shows where the bike is going (→ VIC). If a group was hired from somewhere else, or was a home delivery, it asks once for that group whether its bikes go to this phone's location or back where they were hired from (TRA for deliveries). Tick **M-check each bike as it's checked in** to have the checklist open straight after each check-in.
- **🔧 M-check:** lists every bike at the rack that's due an M-check (it hasn't passed one since it last went out). Tap a bike, or scan or type it, to open the checklist. The camera stays on between bikes. See the M-check SOP below.
- **While a form is open** (an M-check, taking a bike off, a return), the camera ignores what it sees, so a bike in view can't be checked in behind the form.
- **Last scans:** the last three results stay on screen above the camera, newest first: the time, the bike and what happened. Green is fine, amber needs a look, red was refused. They stay until the next scan pushes them down, so a warning isn't lost if you look away.
- **Sounds:** one short beep for OK, two beeps for a warning, a low tone for refused, and a buzz on Android phones (iPhones can't vibrate for a web page). **🔊 Sounds on** under Start Scanning turns them off or on for that phone. An iPhone's silent switch also silences them.
- **The camera:**
    - If a bike's label won't read after about 6 seconds, **Can't read it? Type the bike ID below** appears. Tap it to type the ID.
    - After 3 minutes without a scan, the camera stops by itself to save the battery. Tap **Start Scanning** to carry on.
    - Leaving the page (a phone call, another app, the lock screen) stops the camera; coming back starts it again, so it doesn't come back frozen.
    - If the camera won't start, the box says why and what to do for that phone: camera blocked for the site, in use by another app, or not found.
- **Warnings when issuing:**
    - Red banner, "OUT OF SERVICE": the bike has a P5 issue open. It is refused. Do not hire it.
    - Amber, "has open issue logged": a lower-priority issue is open. The bike is added; check the issue before handing it over.
    - Red, "still out with Jones (x1)": the bike is still out with another group (not checked in, group not Returned). It is refused. Find out which group really has it: if it's come back, check it in; if it was scanned onto that group by mistake, take it off there. Then scan it again.
    - "isn't a registered bike": the barcode isn't in the Asset Register. The app asks before adding it. Check the label and the ID: **Cancel** if it was misread, **Add anyway** if it really is the bike going out (then add it to the register later). A similar amber warning, "recorded as disposed", appears for a bike that has been sold or written off.
    - Amber, "not M-checked since its last ride": the bike hasn't passed an M-check since it last went out. It's still added, and the hire records that it went out unchecked.
    - "already in group": it's been scanned onto this group already. Nothing changes.
- **× next to a bike** takes it off the group. The app asks why (see the swap SOP). The bike moves to *Taken off this group* with its times and reason, and is free to issue again.
- **Clear all** takes every bike off the active group, recorded as "group cleared".

**Groups tab**

- One card per group: its status, where the hire is and its start time (home deliveries have an amber border), the hire day for a multi-day hire, special requirements, then each bike with a **tick box**, its barcode and model, and the time it was checked in. The count reads, for example, "2 of 3 checked in".
- **Out** marks the group as on the road. **Out overnight** (multi-day hires, before the last day) marks bikes staying out overnight; the group carries into the next day's manifest.
- **Returned** works once every bike is ticked in. If any aren't, the button reads "Returned (1 not in)" and opens **Return with exception**: a reason for each missing bike (left at location to collect, damaged with an issue logged, missing, or other with a note). The reasons stay on the group's record. **Undo Returned** reopens the group and clears them.
- The hire length menu ("1-day hire", "2-day hire" and so on) sets the length by hand, for a booking whose note was missed.
- **Set Active** makes the group active on this phone. **Delete** removes the group (a copy is kept for the day's archive).
- **↩ Dropped at Dandelion Wines** (on a group with bikes still out) records that the group left its bikes at the Dandelion collection point. A sheet lists exactly which bikes will be marked dropped and which are already checked in; **Mark 2 bikes dropped at Dandelion Wines** confirms it. Every bike still out is checked in there, the bikes move to DLN in the Asset Register, and the group closes. Move them on with **Move bikes** when they're collected.
- **💬 Message** on a group with a phone number messages the guest, the same way as on Today's Contacts. It suggests "running late for pickup" when the start time has passed with no bikes scanned out, otherwise "late returning". The latest message and whether it went show under the group.
- **🌦 Weather warning to groups out** lists every group with bikes out, all ticked. Untick any that don't need it, describe the weather once, then send to each in turn, answering **Was it sent?** for each.
- The **🔳 QR** link at the top opens Show QR.
- **New Group** adds a walk-in or other group by hand: its name, hire location (pre-set from this phone), **Full day** or **4 hours**, and optionally a contact. The start time is set to now, and a 4-hour hire shows **DUE BACK** with the time on its card. A walk-in's contact can be added later with **+ Add contact**; while its bikes are out without a phone, the card shows **No phone yet**. Any group with no location has a **Set location** menu.

**Today / Previous day** (Groups and Summary tabs): the previous manifest's groups as they were when the next manifest was loaded, read-only. A group with bikes still out from an earlier day comes across to today with a red **OVERDUE · out since** badge, and stays until its bikes are checked in and it's marked Returned.

**By time / By location** (Groups and Summary tabs): the same ordering as on Contacts, with carried-over groups first. The Scan tab's group chips follow it, so the next booking is first along the row.

**Summary tab**

- Totals for the day: groups, bikes out, unique bike IDs, bikes checked in, multi-day hires, bikes due an M-check, overdue groups, bikes taken off groups, and any out-of-service bikes scanned.
- If *Total bikes out* is higher than *Unique bike IDs*, one bike is in two groups. Find it on the Groups tab.
- **Share Report** sends a text summary to WhatsApp, SMS or email. **Download CSV** saves the day as a spreadsheet, with hire day, check-in times, bikes not back and bikes taken off.
- **Reset All Data** clears every group on every phone, after archiving a copy. Use it only to start again on a day without a manifest.

### SOP: Issuing bikes to a group

1. Open the **Group Scanner** (after loading the manifest, it opens by itself). Check **🚴 Issuing** is highlighted.
2. Under **Active Group**, check the customer's group is the one highlighted; if not, tap it.
3. Read what's under it: any equipment needed (**Needs 1× Child Seat**) and special requirements.
4. Tap **Start Scanning**, and scan each bike as you hand it over. Listen for the beep and read the confirmation each time: right bike, right model, no warning. A red OUT OF SERVICE banner means put that bike aside and choose another. A red "still out with" means the bike is on another group: sort that out first. If it asks whether to add a bike that isn't registered, check the ID before tapping **Add anyway**. An amber warning needs dealing with before the customer rides off (see the list above).
5. When it shows **✓ 2 of 2 bikes scanned**, tap **🚴 Mark Smith (x2) out**.
6. The next group waiting is now active and the camera is still on. If that's the next customer at the counter, carry on from step 3; if not, tap their group.

### SOP: Swapping a bike (customer wants a different one)

1. With the customer's group active, tap **×** next to the bike they are handing back.
2. Choose **Swapping for another bike**.
3. Scan the replacement bike straight away. Check the confirmation.
4. The original bike stays on the group's record as "swapped" and can go to the next customer.

If the bike is being swapped because something is wrong with it, choose **Fault found** instead. The app offers to log the fault straight away: the Issue Reporter opens with the bike filled in, and comes back to the scanner once it's logged. Choose Cancel to scan the replacement first, then log the fault before anyone else takes the bike.

### SOP: Correcting a wrong scan

1. Tap **×** next to the bike that was scanned by mistake.
2. Choose **Scanned by mistake**.
3. Scan the correct bike.

If a bike was scanned into the wrong group, take it off with "Scanned by mistake", make the right group active, and scan it again.

### SOP: Checking bikes in and returning a group

1. On the **Scan** tab, choose **✓ Checking in**. The first time each day, confirm where you are when asked (on the trailer, choose TRA). Then tap **Start Scanning**.
2. Scan each bike as it comes back. Read the confirmation: it names the group, how many are back, and where the bike is going (→ VIC). If the app asks about a group hired from elsewhere, choose where its bikes are actually going.
3. Ask about any problems during the ride. Log anything that needs attention in the Issue Reporter.
4. When the group's last bike is in, it shows at the top with **Mark returned**: tap it, and carry on scanning the next return.

You can also tick bikes in by hand on the Groups tab, for example when the camera won't read a label.

### SOP: M-check

Who: any staff member. When: after a bike comes back, or before it goes out. Every bike needs a passed M-check since its last ride.

1. On the **Scan** tab, choose **🔧 M-check**. Bikes due a check are listed.
2. Tap a bike, or scan it. The checklist opens in M-check order: front wheel and tyre, steering and handlebars, brakes, frame and fork, pedals cranks and chain, saddle and seatpost, rear wheel tyre and gears, battery, motor and display, lights bell and kickstand.
3. Check each item on the bike. Everything starts as **OK**.
4. If all is well, tap **All good · sign off**. Your name from the 👤 button is recorded. The camera is still on: scan the next bike.
5. If something is wrong, tap **Fault** on that item, write what you found, and add the odometer if you can. The priority defaults to P5 for brakes, steering, frame and battery; lower it if the bike is still safe. Tap **Log faults · sign off**. An issue is logged in the Issue Reporter, and a P5 takes the bike out of service.

When checking in a whole group, tick **M-check each bike as it's checked in** so each checklist opens as the bike comes back.

### SOP: A bike that doesn't come back

1. Check in the bikes that are back.
2. Tap **Returned (1 not in)** on the group.
3. For each missing bike, choose why: **Left at location, to collect**, **Damaged, issue logged**, **Missing**, or **Other** with a note. Add where it is or what happened.
4. Tap **Close group with these reasons**.
5. Follow up the same day: arrange the collection, log the damage in the Issue Reporter, or tell the owner about a missing bike.

### SOP: Multi-day hires

1. On day 1, issue the bikes as normal. Check the group shows "Day 1 of 2" (or 3). If there's no day badge, set the hire length on the Groups tab.
2. At the end of each day except the last, tap **Out overnight** on the group. Don't tick the bikes in.
3. Next morning, load the manifest as usual. The group carries over with its bikes and shows "Day 2 of 2", even though Rezdy doesn't list it that day.
4. On the last day, check the bikes in and tap **Returned**. If the bikes come back early, check them in and tap Returned on any day; the hire ends there and won't carry over.

### SOP: Messaging a late guest

1. On **Today's Contacts** or the group's card, tap **💬 Message**.
2. Choose the message (the likely one is marked Suggested), and check the wording. Change anything you like.
3. Tap **Text** or **WhatsApp** and send it from your phone.
4. Back in the app, answer **Was it sent?**: **Sent**, **Not sent** (with a reason if you know it), or leave it as not confirmed. A late group showing "NOT sent" or "not confirmed" needs a call.

### SOP: Weather warning

1. On the Group Scanner's **Groups** tab, tap **🌦 Weather warning to groups out**.
2. Untick any group that doesn't need it, for example one already on its way back.
3. Describe the weather in a few words, for example "strong winds and rain expected from about 3 pm".
4. For each group: tap **Text** or **WhatsApp**, send, then answer **Was it sent?**. The next group comes up automatically.

### SOP: Walk-in or late booking

1. On the **Groups** tab, tap **New Group**.
2. Name it the same way as the manifest: surname and bike count, for example "Nguyen (x3)".
3. Check the hire location, and choose **Full day** or **4 hours**.
4. Add the contact's name and phone if you have them. If not, leave them for later.
5. Tap **Create Group**, then scan the bikes as normal.
6. Get a phone number before the group rides off if you can. Add it with **+ Add contact** on the group card, or **+ Add phone** on Today's Contacts, even after they've left.

### SOP: Overdue group

1. Loading the manifest carries any group with bikes not checked in across to the new day, with a red **Overdue** badge. The Load Manifest log says how many.
2. Call the customer from **Today's Contacts**, where they also show as Overdue.
3. Check the bikes in as they come back, then tap **Returned**. If a bike isn't coming back, use **Return with exception**.
4. If the bikes came back the day before but weren't checked in, check them in now so the record is right.

### SOP: Group dropped at Dandelion

1. When a group calls to say they've left the bikes at Dandelion Wines, open the **Groups** tab.
2. On their group, tap **↩ Dropped at Dandelion Wines** and confirm.
3. When the bikes are collected, use **Asset Register → Move bikes to a location** to scan them from DLN onto the trailer (TRA) or back to the Visitor Centre.

### SOP: End of day

1. On the **Summary** tab, check every one-day group shows Returned, multi-day groups not on their last day show Out overnight, and bikes out equals unique bike IDs.
2. Chase any group not yet returned (see Today's Contacts).
3. Optional: **Share Report** to the team chat, or **Download CSV** for your records.
4. Leave the groups in place. Loading the next day's manifest archives them automatically and carries multi-day hires forward.

## Issue Reporter

The Issue Reporter is the fleet's maintenance log. Any fault found on a bike is logged here with a priority, and a P5 takes the bike out of service in the Group Scanner until someone records the repair.

### How it works

**Priorities**

| Priority | Label | Use it for | Effect in the scanner |
| --- | --- | --- | --- |
| P1 | Minor | Cosmetic: scuffs, a loose bell | Amber "open issue" warning |
| P2 | Low | Needs attention soon, safe to ride | Amber warning |
| P3 | Medium | Should be fixed before the next busy day | Amber warning |
| P4 | High | Fix before hiring again if possible | Amber warning |
| P5 | Out of service | Unsafe or unusable: brakes, battery, frame, motor | Refused, red banner |

The examples in the "Use it for" column are a starting point. Adjust them to suit our fleet.

**Report tab**: scan or type the bike ID. The bike's details from the Asset Register appear underneath (brand, model, serial, key, size, age) so you can confirm it's the right bike. Enter the odometer reading in km; the app shows the last reading recorded for that bike. Tap the **fault type** (one or more; **Other** if none fits), choose a priority, describe the problem, add parts or notes, and enter your initials. The date and time are recorded automatically. The fault types are set in **Configuration → Fault types**.

**Repeat faults**: if the bike had the same fault type logged within the repeat window (90 days unless changed in Admin), an amber **🔁 Repeat fault** box says when, and whether it was repaired. Say in the description what's happened since, so the workshop can look for the cause rather than fix the symptom again. Repeat issues are tagged **🔁 repeat** in the log.

**Resolve tab**: scan or type the bike ID. The most urgent open issue appears. Enter what was repaired and your full name, then **Mark as Resolved**. If the bike has more than one open issue, the app says so; resolve them one at a time. If the bike isn't fixed yet, tap "Not fixed yet? Add an update" instead.

**Updates**: tap any issue on the Log tab, open or resolved, to see its history and add an update: what has changed, your initials and, if you have it, the odometer reading. On an open issue an update can also change the priority. Any issue can have its **fault type** set or changed in the update (for issues logged before v3.7, which have none); a fault type change on its own needs no text. Changing to P5 takes the bike out of service in the Group Scanner straight away; changing down from P5 puts it back. Updates show on the Resolve tab, in the shared list (latest update) and in the CSV.

**From M-checks**: a fault found during an M-check is logged here automatically, labelled **found in M-check**, with the faults, notes, odometer and who found it. Its fault types come from the items that failed (for example, a failed front wheel is logged as Tyres and wheels). It's then handled like any other issue.

**Log tab**: every issue, filtered by All, Open, P1, P2, P3, P4, OOS (P5), Resolved or **🔁 Repeats**. Each issue shows its fault types. Each filter shows how many issues it holds; the P1 to P4 and OOS filters show open issues at that priority. Resolved issues show when they were reported and resolved, and how long the fix took, for example "Reported 12 Oct · Resolved 14 Oct (2 days)". Tap an issue for the full detail. Stats, **Share Open Issues** and **Download CSV** (the full history, including bike details, fault types and repeats) are at the bottom.

### SOP: Reporting a fault

When: as soon as a fault is found, by a customer, at return, or during a check.

1. Open **Issue Reporter**, **Report** tab.
2. Scan the bike's barcode. Check the details card matches the bike. If it says "not in the asset register", recheck the ID before going on.
3. Read the odometer on the bike's display and enter it in km. If it can't be read (flat battery, broken display), tick **Can't read it**. If the app warns the reading is lower than last time, check it again.
4. Tap the fault type. If the **🔁 Repeat fault** box appears, read it: this bike has had the same problem recently.
5. Choose the priority. If in doubt about safety, choose **P5**.
6. Describe what is wrong in plain words: what, where, and when it happens ("Rear brake rubs at low speed, left lever soft").
7. Add notes or parts ordered if relevant.
8. Enter your initials and tap **Submit Issue Report**.
9. For a P5, tag the bike physically as well (out-of-service tag on the handlebar) and park it away from the hire fleet.

### SOP: Recording a repair

1. Open the **Resolve** tab and scan the bike.
2. Read the issue shown. Confirm it is the one you fixed.
3. Describe the repair: parts replaced, adjustments made, test ride done.
4. Enter your full name and tap **Mark as Resolved**.
5. Scan the bike again in Resolve. "No open issues" means it's clear to hire. Remove any physical tag.

### SOP: Updating an issue

When: whenever something changes before the repair is finished: parts ordered or arrived, the fault gets worse, someone has looked at it, or the bike is still faulty after a repair.

1. Open the **Log** tab and tap the issue (filter by bike ID to find it quickly), or tap **Not fixed yet? Add an update** on the Resolve tab.
2. Write what has changed, in plain words ("Pads arrived, fitting Thursday").
3. Enter your initials. Add the odometer reading if you have the bike in front of you.
4. If the problem is now more or less serious, change the priority. Choose P5 if the bike is no longer safe to hire.
5. Tap **Add update**.

### SOP: Weekly fleet check

1. On the **Log** tab, filter **Open**.
2. Check nothing has sat open too long, especially P4 and P5.
3. Use **Share Open Issues** to send the list to whoever is doing repairs.

## Asset Register

The Asset Register holds one record per bike, keyed by its barcode ID. The Group Scanner and Issue Reporter read it to show what each barcode is, and it is our list for insurance, depreciation and stocktakes.

### How it works

| Field | Required | Notes |
| --- | --- | --- |
| Bike ID | Yes | The barcode on the bike. Scan it or type it. |
| Serial number | Yes | The frame serial. Scan it if the frame has a serial barcode, otherwise type it. No two bikes can share one. |
| Location | No | Where the bike is now: VIC, OXB, HOM, TRA or another location on the list. Changing it asks for your initials. |
| Key number | No | The battery or lock key. |
| Brand, model | No | Suggestions appear from bikes already entered, which keeps spelling consistent. |
| Frame or rim size | No | Free text, for example M, 52cm, 20in. |
| Date of purchase | No | The app works out the bike's age from it. |
| Purchase price | No | In dollars, for example 3499 or $3,499.95. |
| Disposal date | When disposed | The date the bike was sold or written off. A bike with a disposal date drops out of the active fleet. |
| Sale price | No | What it sold for; 0 if written off. Needs a disposal date. |
| Disposal note | No | Who bought it, or why it was written off. |

- The list shows each active bike's ID, key, brand and model, serial, size, age and purchase price. Tags show open issues, out-of-service bikes and missing serial numbers.
- Each bike shows its location (📍 VIC), or **Out with [group]** while it's on hire. The chips above the list count bikes at each location, out on hire, and with no location; tap one to filter. A bike's record shows its last 10 moves.
- Each bike at the rack shows its M-check: **✓ M-checked 13/10/26 09:12 · JB**, or **🔧 Needs M-check** if it hasn't passed one since its last ride. The **Needs M-check** chip lists them.
- A bike's record shows its **M-check history**: the latest 10, or every check on a date you pick.
- Disposed bikes are hidden. The count line shows how many there are; tap it to show them, greyed out with their disposal date and sale price. A search finds them too.
- The search box finds bikes by ID, serial, key, brand or model.
- If any bikes are missing a serial, the count line says how many. Tap it to list only those bikes.
- **Fleet age** shows average age, how many bikes are under 2 years, 2–4 years and 4 years or more, and the total purchase cost of the active fleet.
- **Download CSV** exports every bike, active and disposed, with prices, disposal details, age in months and open issue counts.
- **Load bikes from a spreadsheet** adds or updates many bikes at once. Every row needs a Bike ID and a Serial Number. A column left out of the file leaves that detail unchanged. A Location column (code or name) moves bikes, logged as "spreadsheet". If any row fails, nothing is changed and the row number is shown.
- **Move bikes to a location** opens scan-to-move: choose the destination, enter your initials, then scan or type each bike.
- **Locations** lists every location with how many bikes are there, and its kind: **Hire site** (bookings start there: VIC, OXB, BER, DOG, SRV, HUG, HAZ), **Home delivery** (HMD), **Collection point** (DLN, Dandelion Wines, where guests drop bikes) or **Storage only** (HOM, TRA). Hire sites and Home delivery show their **Rezdy product words**: a booking whose product name contains one of them is put at that location. Anyone can add a location, change its kind or words, rename or retire it. A location can only be retired once no bikes are there.
- **Download M-check log** saves every M-check: date and time, bike, who signed off, pass or fault, the faults and notes, and whether an issue was logged. The register CSV also shows each bike's last M-check and whether one is due.
- **Download move history** saves every change of location: when, which bike, from, to, how (by hand, scanned, checked in or spreadsheet) and who.
- **Register changes.** Every change to the register is recorded, from v3.6 on: a bike added (by hand or from a spreadsheet), each field edited with its old and new value, an ID changed, or a bike removed. A bike's record shows its latest 10 changes under **Register changes**, with who made them (from **👤** on that phone). **Download register changes** saves all of them as an Excel file. Location changes are in the move history instead.
- **📈 Fleet report** opens the utilisation report. See Fleet report.
- **⛔ Unavailable** (a filter above the list) shows the bikes that can't be hired right now: out of service, with an open P5, since the day it went to P5 and for how many days; or kept at a storage location such as HOM.
- **📜 Full history, purchase to disposal** on a bike's record opens its history. See Bike history below.

### Bike history

A bike's history page brings together everything recorded about it, from purchase to disposal:

- **Details:** serial, key, size, purchase date and price, its age, and disposal date, sale price and note. A bike whose ID was changed shows its old IDs too, and its history includes them. A bike removed from the register still has its history, from the copy kept when it was removed.
- **Utilisation, out of service, issues and M-checks** at a glance. Hire figures come from the fleet records, so they start when records began for that bike.
- **Faults by type**, with how many were repeats.
- **Month by month:** days available, hired and out of service, and utilisation.
- **History, newest first:** bought, register changes, moves, issues with their updates and repairs, M-checks, and disposal. Filter it by Issues, M-checks, Moves or Register.
- **⬇ Excel** downloads it all (details, month by month, history, issues, M-checks, moves and every daily record). **🖨 Print or save as PDF** prints the page.

### SOP: Adding a new bike

1. Fit the barcode label to the bike first.
2. Open **Asset Register** and tap **Add bike**.
3. Tap the camera next to **Bike ID** and scan the label.
4. Enter the **serial number**: scan it, or type it from the frame (often under the bottom bracket).
5. Fill in the key number, brand, model, size, date of purchase and purchase price. Pick from the suggestions where they fit.
6. Tap **Save bike**. If the app says the ID is already registered, open the existing record instead of creating a new one.

### SOP: Editing a bike

1. Search for the bike and tap it.
2. Change the fields and tap **Save changes**. Changes apply on every phone straight away.
3. If the barcode label is replaced, change the Bike ID here. Its record moves to the new ID; past issues stay under the old ID.

### SOP: Moving bikes between locations

When: whenever bikes go on or off the trailer, or move between the Visitor Centre, Oxenberry and home storage.

1. On the **Asset Register**, tap **Move bikes to a location**.
2. Choose where they're going and enter your initials.
3. Tap **Scan bikes** and scan each one as it's loaded or unloaded. Each line shows where the bike came from. You can also type IDs.
4. Tap **Done**.

For one bike, you can instead open its record, change **Location**, enter your initials and save. Bikes for a delivery go to TRA when they're loaded on the trailer, then into the customer's group as usual.

### SOP: Adding or retiring a location

1. Under **Locations**, enter a short code (2–6 letters or numbers, for example MCL) and a name, choose its kind, and for a hire site add the word or words that appear in its Rezdy product names.
2. Tap **+ Add location**. It appears in every location list straight away, including the scanner's "This phone is at".
3. To stop using a location, move its bikes elsewhere, then tap **Retire**. Its history is kept, and **Restore** brings it back.

### SOP: Checking a bike's M-check on a past day

1. Open the bike in the **Asset Register**.
2. Under **M-check history**, pick the date. Every check that day shows with its time, result and who signed off.
3. To see whether the bike was checked before a particular hire, open that day in **Admin → Show archives**. The **M-check Before Hire** column shows the check that stood when the bike went out, or "NOT CHECKED since last ride".
4. For a longer period, download the M-check log and filter by bike and date in Excel.

### SOP: Disposing of a bike (sold or written off)

1. Open the bike in the **Asset Register**.
2. Enter the **disposal date**, the **sale price** (0 if written off) and a short **disposal note**.
3. Tap **Save changes** and confirm. The bike drops out of the active fleet. Its record, prices and issue history are kept.
4. Remove the barcode label if the bike is leaving the business. If a disposed bike is scanned, the Group Scanner warns staff.

### SOP: Removing a bike entered by mistake

1. Open the bike and tap **Remove from register**, then confirm.
2. Only use this for a record that should never have existed, such as a duplicate or a typo in the ID. The record is deleted; its issue history stays in the Issue Reporter.

### SOP: Loading or updating many bikes from a spreadsheet

1. Tap **Get template**, or **Download CSV** to start from the current register.
2. Fill in or correct the rows on a computer. Dates can be 15/09/2024 or 2024-09-15.
3. Save as CSV and tap **Choose CSV**.
4. Confirm the number of bikes. Existing bikes are updated with the spreadsheet values; new ones are added. Columns not in the file are left as they are.
5. Read the result line. If it shows an error, fix that row and load the file again.

### SOP: Adding missing serial numbers

1. Tap "N missing a serial number" on the count line.
2. Work through each bike: open it, scan or type the serial, save.
3. For many bikes, download the CSV, add serials in the Serial Number column, and load it back.

## Site Checklists

Site Checklists records the opening and closing of each site. Each site (VIC, OXB and any added later) has its own opening and closing list, signed off under your name and kept as a dated record.

### How it works

- Choose the site at the top. It starts on the site this phone is set to.
- The status card shows whether the site has been opened and closed today, when and by whom.
- The **Opening** and **Closing** tabs list the items. Answer every item: **✓ Done**, or **✗ Problem** with a note. Items marked **MUST** have to be done; they can't be marked as a problem. At VIC these are "Batteries on charge for tomorrow" and "Sign and A-frame in. Bikes secured. Site locked and alarm on".
- **Not required today** (on the Opening tab) records that the site isn't opening, with an optional reason. It covers the whole day: no opening or closing is expected and the reminders stop. If the site does open after all, sign off the opening checklist as normal.
- **Sign off** saves the checklist with the date, time, your initials and every answer. Signing off twice on the same day keeps both records.
- **History** shows the site's past checklists, latest first, or every one on a date you pick. Tap one to see its items. **Download CSV** saves every checklist for every site, one row per item.
- The home screen shows a reminder when this phone's site hasn't been opened yet today, hasn't been closed by 3 pm, or wasn't closed yesterday.
- The lists are edited in **Configuration → Site checklists**.
- VIC's opening list includes "Backup status on the home screen is green". It's checked once a day, at VIC only.

### SOP: Opening a site

1. Open **Site Checklists** and check the site is right.
2. On **Opening**, work through each item on site, tapping **Done** or **Problem**. Write what the problem is.
3. Tap **Sign off opening**.
4. Deal with any problem now, or tell whoever is running the day. Bike faults go in the Issue Reporter.

### SOP: Closing a site

1. Open **Site Checklists**, choose **Closing**, and check the site is right.
2. Work through each item. The two MUST items, batteries on charge and the site locked, have to be done before you can sign off.
3. Tap **Sign off closing**.

### SOP: A site not opening today

1. Open **Site Checklists** and choose the site.
2. On **Opening**, tap **Not required today**.
3. Add a reason if there is one, for example "No bookings" or "Weather", and confirm.

### SOP: Changing a checklist

1. Open **Configuration → Site checklists**. Choose the site, and Opening or Closing.
2. Edit the list: one item per line, in order. Start a line with an asterisk (*) to make it mandatory.
3. Tap **Save checklist**. Staff see the new list straight away. Past records keep the wording they were signed off with.

A site added under Locations starts with a copy of the VIC lists until you save its own.

## Roster

The Roster shows who's working where, day by day, with any notes for each shift. Open it from the **Roster** tile on the home screen. Rosters are set by the manager in Admin; staff can see them but not change them.

### How it works

- **Whole team** shows one week at a time, Monday to Sunday. The arrows move between weeks. Each day lists its shifts by site, with each person's **Known as** name, their times and any note. Today is outlined in green.
- **Changed** next to a shift means it has been updated since the roster was emailed. Check it if it's yours.
- **close** as a finish time means until the work's done, whenever that is.
- **N/A** lists anyone who isn't available that day, with a note if there is one.
- **My shifts** shows your own shifts for this week and next, using the name set on this phone (the 👤 button). Each shows the site, the times, any note, and who else is on that day.
- **Add to my calendar** saves that shift to the phone's own calendar, with its own reminders. If the shift changes later, add it again and delete the old one.
- **On today** on the home screen shows who's working where today, and your own next shift.
- Staff only ever see names and initials. Phone numbers and email addresses stay in Admin.

### SOP: Checking your shifts

1. Open **Roster** and tap **My shifts**. If it asks who you are, tap 👤 at the top and pick your name.
2. Tap **Add to my calendar** on any shift you want a reminder for.
3. If you can't make a shift, or something looks wrong, tell the manager. Don't wait for the next roster email.

## Lost Property

Lost Property records anything guests leave behind: what it is, where and when it was found, where it's kept, who it might belong to, every attempt to return it, and how it ended.

### How it works

- **Open** lists items still waiting, newest first, with a photo, where each was found and where it's kept. Items held 30 days or more show **held … days**, so they get a decision. The home screen tile shows how many are open.
- **+ Add item** takes a photo (shrunk on the phone to keep it small), what it is, the date and place found, where it's kept, and the owner if known. **Whose is it?** lists today's and the previous day's bookings: picking one fills in the guest's name and phone.
- Tapping an item shows its details and photo. You can change where it's kept, add follow-up notes (each dated and initialled), and **Text** or **WhatsApp** the owner with a message already written. After sending, the app asks whether it went and adds a note either way.
- **Close this item** records what happened (returned to owner, posted, donated, disposed of, handed to police, or other with a note) and the date. Closed items stay on record under **Closed**, and **Reopen** brings one back.
- **Download CSV** saves every item, open and closed, with its notes.

### SOP: Logging lost property

1. Open **Lost Property** and tap **+ Add item**.
2. Take a photo, say what it is, and where it was found.
3. Choose where it will be kept, and put it there.
4. If you know whose it is, pick their booking under **Whose is it?**, or type their name and phone.
5. Tap **Save to the register**. Tick "Lost property logged" on the closing checklist.

### SOP: Returning lost property

1. Open the item. Text or WhatsApp the owner, or call them, and add a note of what you tried.
2. Keep adding notes as things happen, for example "Guest collecting Saturday".
3. When it's resolved, choose what happened and the date under **Close this item**, and tap **Close item**.
4. If an item reaches 30 days with no owner found, decide whether to donate or dispose of it, and close it.

## Show QR

Show QR puts the guest codes full screen on your phone for a guest to scan: the **SA eBikes Ride Guide**, the **Online Waiver** and the **Google Review**.

### How it works

- Open it from the home screen tile, or the **🔳 QR** link on the Group Scanner.
- Tap a code to show it full screen. Use **‹ Back** and **Next ›** (or swipe) to move between codes; tapping the code itself does nothing, so a guest's phone bumping the screen won't move it on. **Done** goes back.
- **Open** with the code's name (for example **Open SA eBikes Ride Guide ↗**) opens that link on your phone in a new tab, with Show QR still open behind it: handy to check a link works, or to show the page itself.
- The codes are drawn from the links set in **Configuration → QR codes for guests**, so a link can be changed or added without any update to the app. Once loaded, they still show without signal.
- To send a link to a guest's phone instead, use **Send link** on Today's Contacts.

If a code is hard to scan outdoors, turn your phone's brightness up: the app can't do that for you.

## Dashboard

The Dashboard shows how hiring is going: bookings and bikes for the week, month and financial year to date, how each bike model is loaded, where hires start, and which bikes spend time in the workshop. Open it from the **📊 Dashboard** link on Load Manifest. It's read-only.

### How it works

- **Week, month and financial year to date** (the financial year starts 1 July): bookings and bikes hired, compared with last week, last month and the same date last financial year.
- **Trend:** the last 8 weeks, or the last 6 months, of bikes hired and bookings.
- **Load by model:** for each model (T3, Brando, Surf, Gabby, Trike…), its busiest day this week, as bikes out against bikes available. Bikes available come from that day's fleet record: in the fleet, not out of service and not in storage. Orange means 90% or more: that model is close to running out on its busy days.
- **Bikes hired by location** this month.
- **Most time out of service** this financial year, from the Issue Reporter's P5 issues.
- **Repeat faults** this financial year: bikes that had the same fault type logged again within the repeat window, with the types. Tap a bike for its history.
- **Bikes to review:** bikes 4 or more years old with a week or more out of service, and bikes hired far less often than the rest of the fleet.

The figures come from a summary of each hire day, saved when the next day's manifest is loaded, plus today so far. They count bikes that were **scanned out**, so they're only as complete as the scanning. Bike models come from the Asset Register's **Model** field.

The **📈 Fleet report** link at the top opens utilisation over any period. See Fleet report.

### SOP: Getting history onto the Dashboard

1. Open **Admin → Fleet history and dashboard data**. Tap **Preview rebuild**, check the month-by-month results, then tap **Save rebuild**.
2. Open the Dashboard from Load Manifest.

## Fleet report

The Fleet report shows how hard each bike, model and location works: **utilisation**, the days a bike was hired divided by the days it was available. It answers questions like whether OXB has more bikes than it needs in winter, or whether the Brandos earn their place. Open it from **📈 Fleet report** on the Dashboard, or from the Asset Register. It's read-only, and open to all staff.

### How it works

Each day, every bike in the fleet gets one record, saved when the next day's manifest is loaded:

- **Hired:** out with a group at any time that day, including days 2 and 3 of a multi-day hire. A 4-hour hire counts as a day. The record also keeps the location it went out from, and how many hires.
- **Available:** in the fleet and free to hire at 8 am. A bike that was hired always counts as available.
- **Out of service:** on a P5 at 8 am. A P5 logged in the afternoon counts from the next day, so a bike hired that morning still counts as hired and available.
- **In storage:** at a storage location (such as HOM) at 8 am, and not hired. Not counted as available.
- **In the fleet** means bought on or before that day and not yet disposed of.

**Records don't change afterwards.** Editing a bike's model, moving it or closing its issue later doesn't change past days. Every calendar day counts: a day with no manifest, or a manifest with no groups, is a day the bikes were available and none went out. If a manifest was missed on a busy day, that day shows as no hires, so the report lists the days with no manifest to check.

**On screen:**

- **Period:** Last 7 days, This month, Last month, FY to date (the financial year starts 1 July), Last FY, or Custom dates. Today is included so far.
- **Show:** By model (with how many bikes), By bike, or By location. Each row shows utilisation, then days hired / days available. Grey bars are under 20%.
- **By location:** a hired bike counts at the location it went out from. A bike not hired counts where it was at 8 am. Home delivery shows bikes hired only, since no bikes are kept there.
- **Tap a bike** (By bike) to see each of its days: status, where it was at opening, and where it went out from.
- **Month by month** shows utilisation for each model or location when the period covers more than one month.
- **About these figures** says how much was rebuilt rather than recorded on the day, where a rebuilt day had to use today's model or an uncertain location, and which days had no manifest.

**Exports:**

- **⬇ Excel:** one file with a summary and the definitions, By model, By bike, By location, month by month for models and locations, and every daily record.
- **🖨 Print or save as PDF:** prints what's on screen, without the buttons. To save a PDF, choose **Save as PDF** (computer) or **Share → Save to Files** (iPhone) in the print screen.

### SOP: Checking utilisation for a decision

1. Open the Fleet report, choose the period (for a season, **Custom**), and **By location** or **By model**.
2. Read **About these figures** first. If days with no manifest include days you know were busy, the figures for those days are missing, not zero.
3. Tap **⬇ Excel** for the figures to keep, or **🖨 Print or save as PDF** for a copy to share.

## Admin

Admin holds the roster, the team list, backups, archived days and settings. Open it from the **⚙️ Admin** link at the top of Load Manifest; **← Back to Load Manifest** returns there. It is for the owner or manager, not day-to-day staff.

Admin has two areas, switched with the buttons at the top: **⚙️ Admin** for running things day to day, and **🎨 Configuration** for setting up the business. They share the admin password, and each has links to its groups at the top.

- **⚙️ Admin** (/admin): **People** (Team, Roster), **Day to day** (Rezdy products), **Fleet** (Fleet history and dashboard data) and **Data and safety** (Backups, Archived days).
- **🎨 Configuration** (/config): **Business**, **Guests and sites** (QR codes for guests, Message templates, Site checklists, and a note on Locations, which are kept in the Asset Register), **Maintenance** (Fault types), **Home screen**, and **Configuration file**.

### Configuration

- **Business** sets the business's name, tagline, logo, colours, heading font and country, shown on every page.
    - **Logo:** **Upload a logo** (PNG, JPEG or WebP) shrinks it on the phone to about 50 KB at most. **Use the standard logo** goes back to the SA eBikes bike, and **No logo** shows the name alone. **Show the name beside the logo** can be turned off for a logo that already includes the name.
    - **Colours:** the **main colour** is for buttons and green text, and needs to be dark enough for white text to read; a warning shows if it isn't. The **highlight colour** is for flashes, ticks, bars and the live light, never under text. SA eBikes uses #415b30 and #5fd64f.
    - **Heading font:** Baloo Bhai 2 (as on the SA eBikes logo) or the app's own font. It's kept with the app, so it shows without signal.
    - **Country:** used to read local phone numbers in manifests and contacts.
    - **Time zone** is shown but not changed here: it's set for each installation in Netlify (the SAEBIKES_TIMEZONE setting), because the server needs it before it reads any settings.
    - **The preview** shows the name, a button and a bar in the chosen colours before you save. Each phone keeps a copy of these details, so pages never wait for them. The home screen picks up a change when it next opens; other screens within a few hours, or straight away once the home screen has been opened.
- **Configuration file:** **⬇ Download configuration** saves everything on the Configuration page in one small file: business details and logo, fault types, home screen, QR codes, messages, site checklists and locations. Keep a copy with your backups. **⬆ Load a configuration file** lets you choose which parts to put back. A backup is taken first, so a load can be undone from Admin → Backups. Each part replaces what's there, except locations, which are added or updated but never removed. Hire records, issues and the asset register aren't touched. It's also how a new installation is set up.
- **Fault types** are the types staff choose when logging an issue. Rename one in place (its issues keep it), add one with **+ Add a fault type**, move them up or down, and **Retire** one that's no longer wanted: it leaves the list but stays on the issues that used it, and **Bring back** restores it. **Repeat window** is how many days count for a repeat fault (7 to 365; 90 to start). **Save fault types** applies them for everyone.
- **Home screen** sets the order of the tools on the home screen and which are shown, for every phone. Use ↑ and ↓ to move a tool, **Hide** or **Show**, then **Save home screen**. Load Manifest is always shown, because Admin is opened from it. A hidden tool still opens from its address (such as /qr), and its links elsewhere in the app still work.

Once an **admin password** is set (see "SOP: Setting the admin password"), Admin asks for it each time it's opened, and locks again as soon as you leave the page or tap **Lock now**. Switching to your mail or messages app to send the roster or a text doesn't lock it. Until it's set, a note at the top says so, Admin works with the staff PIN as before, and team contact details can't be stored.

### How it works

**Roster** is the first card. It shows one week at a time, starting with next week.

- **+ Add shift:** who, where, date, start, finish and a note. Tick **Until close** when the finish is whenever the work's done. Choose **N/A · Not available** as Where to show someone isn't available that day (the times disappear). Notes are seen by every staff member, so keep them to the day's work. A person can't be rostered for two shifts that overlap, or rostered on a day they're marked not available.
- **Edit** on a shift opens it with its **history**: who added it, and every change since. **Remove shift** takes it off the roster; it stays in the history.
- **Someone else's change wins until you've seen it.** If a shift was changed by someone else since you opened it, Save is refused with what they changed. Open it again to see their version, then make your change.
- **Text [name] about this shift** appears when the person has a mobile in Team. It opens a text from this phone with the shift written in.
- **Email roster** writes the week as an email for you to check, then **Open in Mail** opens it in your own mail app, with everyone rostered that week as **Bcc**, so nobody sees anyone else's address. It records when the roster was emailed; shifts changed after that show as "changed" to staff. People without an email address are named, so you can text them instead.
- **Copy last week** copies the week before into this week. Not-available entries aren't copied, since they're one-offs. If this week already has shifts, it asks before replacing them.
- **Download CSV** saves the week as a spreadsheet: one row per shift, with the columns **Date, Day, Site, Known as, Start, Finish, Note**. An empty week gives you the headings to fill in.
- **Upload CSV** reads a spreadsheet in that format (saved as CSV) and shows a preview before anything changes.
    - **What it shows:** for each week in the file, the shifts it will add, change and remove. An upload **replaces** the weeks in the file: a shift in that week that isn't in the file is removed.
    - **Before anything is replaced:** when the upload would change or remove shifts already rostered, an amber note says how many, and the button says **Replace 3 shifts** rather than Apply.
    - **Signs of wrong dates:** an amber note when the file is for a different week from the one on screen, has dates that have passed, is identical to what's already saved, or is identical to an earlier week.
    - **Rows with a problem** are listed with their line number (a name not on the team, a site that doesn't exist, a Day that doesn't match its date, a finish before the start, the same person twice at once, or someone rostered on a day they're marked not available). Nothing can be applied until the file is fixed.
    - **What can go in the file:** people as their Known as name or initials; sites as their code or name. Dates like 15/11/2026 or 15/11/26. Times like 9:00, 9am, 17:00, 10, or 08:45:00 as Excel saves them. **Close** as a finish. For someone not available, **N/A** as the Site with the times left blank (a row with no site and times of 0 counts as N/A too).
- **Undo upload** (or **Undo copy**) appears above the list after an upload or copy. It puts the week back exactly as it was, until anyone edits that week again.

**Team** gives each person a **Known as** name, which is the only name staff ever see, and their initials, used on every record they sign. With the admin password set, each person can also have a **full name, email and mobile**, which stay in Admin: email is used for **Email roster** and the mobile for texting about a change. Changing someone's Known as name changes it everywhere, including past and future shifts; their initials on past records stay as they were.

**Rezdy products** lists every product name seen in a manifest: how many bookings, when it was first and last seen, and the location it goes to with the current matching words. Products that match more than one location, or none, are flagged.

- **Try matching:** paste product names, or choose a Rezdy manifest, to see where each would go. Leave it empty to test every product seen.
- **Trying new words:** choose a location and edit its matching words. The results show straight away which products would change location, and which would become ambiguous. Nothing is saved until you tap **Save these words**. Saved words apply to manifests loaded from then on; groups already loaded keep their location.

**Backups** follows.

- **Nightly backups.** Every night at about 2:30 am (1:30 am in winter), a backup of everything is taken automatically: today's groups and contacts, the issue log, the asset register with locations and move history, M-checks, site checklists and sign-offs, lost property with its photos, the team, the configuration (business details, fault types, home screen, QR codes, messages and site checklists), the Dashboard data and fleet records, the register's change history, and the daily archives. Each part is read back and checked against a checksum before the backup counts. A backup that fails part-way is never offered for restoring.
- **Where they're kept.** Backups are kept in the app's own storage on Netlify, apart from the live data, and they are only reachable through the app with the staff PIN.
- **How long they're kept:** nightly backups for 30 days, the first backup of each month for 12 months, and **Back up now** and "Before a restore" backups for 90 days. The newest three are always kept, whatever their age.
- **The status box** shows the last good backup, any failure and why, how many daily archives are still being copied (the first nightly backups catch up over a few nights), when the off-site copy was last downloaded, and the last restore.
- **Back up now** takes and checks a backup straight away. Use it before any update to the app, and before a restore you're unsure about.
- **One at a time.** Only one backup or restore runs at a time. If one is already running, the next is refused with "already running: try again in a minute". A nightly backup that finds one running is skipped, not counted as a failure.
- **Download off-site copy** saves one file, `SA-eBikes-backup-<date>.json`, to this device's Downloads folder. It's fetched one part at a time, and each part is checked as it arrives. It holds customer names and phone numbers, so keep it private.
- **Restore** lists the backups, newest first. **Restore…** on one shows each part with how many records it holds then and now. Tick the parts to put back, type **RESTORE**, and tap **Restore**.
    - **Safety backup first:** before anything is changed, every ticked part is checked, and a backup of the data as it is now is taken ("Before a restore"). A restore can itself be undone by restoring that one.
    - **Parts not ticked** are left exactly as they are.
    - **Daily archives** are only ever added back. An archive that's already there is never replaced or removed.
    - **On phones:** restored data shows on phones at their next refresh, within a minute.
- **On a preview** (a test copy of the app), the card says so in blue and offers **Load into this preview** for the live site's latest backups. That copies live data into the preview's own, separate data to test with. The live site isn't touched.

**Everything else:**

- **Show archives** lists the archived days, newest first. A day is archived automatically each time a manifest is loaded or the scanner is reset. Tap **View** to read it on screen, or **CSV** to download it as a spreadsheet.
- Each archive spreadsheet has one row per bike: tour date, group, group status, bike ID, brand and model, scan time, hire location, hire day, check-in time, the M-check that stood when the bike went out, when and why it was taken off, and why it wasn't returned, if it wasn't. Customer phone numbers are not included.
- **Download as one CSV** puts every archive between two tour dates into a single spreadsheet. Leave the dates empty for all of them.
- **Site checklists** edits each site's opening and closing lists. See Site Checklists.
- **Message templates** sets the messages staff send guests (running late for pickup, late returning, weather warning). {first}, {site}, {time} and {weather} fill themselves in. Add, change or remove messages, then **Save messages**.
- **QR codes for guests** sets the codes on Show QR and the links in Message: one per line, the name, a |, then the link.
- **Fleet history and dashboard data** rebuilds the fleet records (and the Dashboard's daily summaries) for days before records began, from the daily archives, the move history, the issue log and the register's change history. Days recorded on the day are never changed. **Preview rebuild** shows, month by month, the days it would save, bikes hired against available, days with no manifest, and how much had to be estimated (the model from today's register, before the change history began; or a location from before moves were recorded). Nothing is saved until **Save rebuild**. It works through one month at a time, and is safe to run again.

### SOP: Monthly off-site copy

Who: the owner. When: the first working day of each month, or whenever the home screen says the off-site download is due.

The nightly backups are all kept with Netlify. This copy is the one that would survive losing the Netlify account itself.

1. On a computer, open **Admin**. Check the Backups status box is green.
2. Tap **Download off-site copy** and wait for "✓ Saved". It goes to the Downloads folder.
3. Leave it in Downloads, where it can be found by its date. The computer should have a login password, because the file holds customer names and phone numbers.
4. Once a year, delete copies more than 12 months old.

To prove a copy is complete, whoever maintains the app can run `node tools/verify-backup.mjs <file>` on it. It re-checks every part against its checksum and lists the counts, without showing any customer details.

### SOP: The backup line is red

Who: the owner or manager. When: the same day it's seen.

1. Open **Admin**. The Backups status box says when the last good backup was, and what went wrong with the last attempt.
2. Tap **Back up now**.
3. If it succeeds, the status turns green. Check again the next morning: if the nightly backup failed again, something is wrong with the scheduled backup. Pass the message from the status box to whoever maintains the app.
4. If it fails, note the message. The live data is unaffected and the app keeps working. Older backups are still there to restore from. Pass the message on the same day.

### SOP: Restoring from a backup

Who: the owner. When: data has been lost or damaged, for example a register import that went wrong, or issues closed by mistake.

1. Work out when the data was last right. Pick the newest backup from before that time.
2. Restore only the parts that are wrong. Leave the rest unticked, so today's work elsewhere is kept.
3. If **Today's groups and contacts** is one of them, do it when nobody is scanning, and tell staff to refresh their scanner afterwards.
4. Tick the parts, type **RESTORE** and tap **Restore**. Read the result: it lists each part and how many records it now holds.
5. Check the restored data in its own tool (for example, the Issue Reporter log).
6. If the restore made things worse, restore the **Before a restore** backup it took, with the same parts ticked.

### SOP: Restore drill (once a year, in winter)

A backup is only proven when it has been restored. This drill does that on a preview, so the live site is never touched.

1. On the live site, open **Admin** and tap **Back up now**.
2. Open the latest deploy preview address. See "Releasing a new version" in DEPLOY_NOTES.md: a preview is made whenever a change is proposed in GitHub.
3. In the preview's **Admin**, tap **Load into this preview** on that backup.
4. Compare the preview with the live site:
    - the counts in the Backups card;
    - one bike's M-check history;
    - an open P5 issue;
    - a lost-property photo;
    - last Saturday's archive.
5. In the preview, load a manifest, scan a bike out and back, and do an M-check.
6. Note the date and anything that didn't match.

### SOP: Updating the app (releasing a new version)

Who: the owner, or whoever maintains the app. The click-by-click steps are in DEPLOY_NOTES.md under "Releasing a new version". In short:

1. On the live site, **Admin → Back up now**.
2. Put the new version on its own branch in GitHub and open a pull request. Netlify builds a **preview** of it with its own, separate data.
3. On the preview, **Load into this preview**, then try a normal day: load a manifest, scan, check in, Returned, an M-check, an issue, a lost item, and the Dashboard.
4. At a quiet time (not a Saturday morning), merge the pull request. Netlify puts it live within a couple of minutes.
5. On the live site, check the home screen shows the new version number and a green backup line.

If something is wrong after going live, put the previous version back in Netlify (Deploys, pick the previous deploy, **Publish deploy**). Restore data only if data was damaged, using the backup from step 1.

### SOP: Adding a team member

1. Open **Admin**. Under **Team**, enter the person's **Known as** name (what the team calls them) and initials (1–5 letters).
2. Tap **Add**.
3. Tap **Edit** next to them and add their full name, email and mobile. These stay in Admin.
4. On their phone, they tap 👤 at the top of any page and pick their name.

When someone leaves, tap **Retire** next to their name.

### SOP: Rostering a week

Who: the manager. When: before the roster email goes out, usually the week before.

1. Open **Admin**. The Roster card opens on next week.
2. Either tap **Copy last week** and adjust, or add each shift with **+ Add shift**, or upload a spreadsheet (next SOP).
3. Check each day, including notes, then tap **Email roster**, check the email, and **Open in Mail** to send it.
4. If a shift changes after that, edit it, then tap **Text [name] about this shift** so the person knows straight away. Staff see "changed" on it in the Roster.

### SOP: Rostering from a spreadsheet

1. In Admin's Roster card, go to a week and tap **Download CSV** for a file with the right headings (an empty week gives just the headings).
2. Fill it in, one row per shift: Date, Day, Site, Known as, Start, Finish, Note. Write **Close** as the Finish for "until the work's done", and **N/A** as the Site (no times) for someone who isn't available. Save it as CSV.
3. Tap **Upload CSV** and choose the file.
4. Read the preview. Stop and check if there's an amber note: a different week from the one on screen, dates that have passed, or a file identical to one already saved usually means the dates weren't updated.
5. Fix any rows listed with a problem and upload again.
6. Tap **Add …** or **Replace …** to apply it. If it wasn't right, tap **Undo upload** straight away.

### SOP: Setting the admin password

Who: the owner, once.

1. In Netlify, open the Operations Tools site, then **Site (or Project) configuration → Environment variables**.
2. Add `SAEBIKES_ADMIN_PASSWORD` with a password of at least 8 characters that's different from the staff PIN. Apply it to all deploy contexts.
3. Redeploy (Deploys → Trigger deploy).
4. Open **Admin**. It asks for the admin password each time Admin is opened.
5. Add each team member's full name, email and mobile under **Team**.

Change it the same way if it's ever shared beyond the people who run the business.

### SOP: Finding what happened on a past day

1. Open **Admin** and tap **Show archives**.
2. Find the tour date and tap **View** to read it on screen, or **CSV** to open it in Excel.
3. Each row is one bike, with the group it went out with, when it was scanned, and when and why it was taken off, if it was.

### SOP: Archive spreadsheet for a period (season review, insurance claim)

1. Open **Admin**. Set the **From** and **To** tour dates.
2. Tap **Download as one CSV**. The page shows its progress while it reads each day.
3. Open the file in Excel. Filter the Bike ID column to see every hire of one bike, or the Group column to find a booking.

For faults on a particular bike, use the Issue Reporter's **Log** tab or **Download CSV** instead; the issue log is never archived away.

## Daily routine and troubleshooting

A normal hire day uses the tools in this order.

1. **Open:** sign off the site's opening checklist. Export the Rezdy pickup manifest and load it (Load Manifest). Set aside equipment for flagged groups, read the special requirements, and check the Days column.
2. **Check the fleet:** on the Issue Reporter's Log tab, filter Open and OOS. Keep P5 bikes out of the hire line.
3. **M-check:** in M-check mode, sign off every bike on the due list before it goes out. Checking bikes as they come back the day before keeps the morning list short.
4. **Each booking:** in Issuing mode, make the group active, scan each bike, read every confirmation, tap Out.
5. **During the day:** swap or correct bikes with ×, always choosing the reason. Log faults as they're found. Use Today's Contacts for late or overdue groups.
6. **Each return:** in Checking-in mode, with This phone is at set, scan each bike back, log any problems, then tap Returned. Use Return with exception for a bike that isn't back.
7. **Close:** sign off the site's closing checklist. On the Summary tab, check every group is Returned or, for a multi-day hire, Out overnight, and bikes out equals unique bike IDs.
8. **Monthly:** download the off-site copy from Admin. The nightly backups happen by themselves; VIC's opening checklist confirms the home screen's backup line is green.

### Troubleshooting

| Problem | What to do |
| --- | --- |
| The camera won't start | Read the message in the camera box: it says what to do on that phone. Usually: allow camera access for the site (iPhone: tap aA in the address bar → Website Settings → Camera, or Settings > Safari > Camera), close another app using the camera, then reload the page. |
| No beep when scanning | Check **🔊 Sounds on** under Start Scanning, the phone's volume and, on an iPhone, the silent switch. Sounds start after the first tap on Start Scanning. |
| A bike is refused as "still out with" a group | It's still on another group that hasn't been checked in. Check it in (or take it off that group if it was scanned there by mistake), then scan it again. |
| A barcode won't scan | Wipe the label, improve the light, hold the phone 15–20 cm away. If it still won't read, try the other scanner: the link under the camera switches between new and classic. Type the ID in the manual box as a last resort. |
| Status says "PIN needed" | Tap the status light and enter the current staff PIN. |
| A save says "Not confirmed" | No answer came back, usually because of signal. Tap Save again when you have signal. It can't create a duplicate. |
| A save says someone changed it since you opened it | Someone else saved the same bike, item, contact or setting while you were editing. The page now shows their version: open it again and make your change. |
| Status says "unsaved · retrying" | Keep working; scans send when signal returns. Don't close the tab or clear the browser. |
| Groups from yesterday still showing | Today's manifest hasn't been loaded. Load it. |
| Contacts says "not today" | The loaded manifest is for another date. Load today's, or check the tour date was set correctly. |
| Load Manifest says "Unrecognised product" | No location's words appear in that Rezdy product name. Check in Rezdy where it's hired from, then add a word to that location under Asset Register → Locations → Words, and reload the file. The group still loads without a location; set it on the group card. |
| Load Manifest lists a "New product" | Rezdy has a product name the app hasn't seen before. Check the location it shows. If it's wrong, fix the matching words (Admin → Rezdy products) before loading. |
| A group on the scanner says "⚠ NO LOCATION" | Its Rezdy product matched no location. Choose the location in the group's Set location menu. |
| A bike shows "not in asset register" | Check the ID was read correctly. If it's a new bike, add it in the Asset Register. |
| A bike is in two groups | Find which group really has it. Take it off the other with "Scanned by mistake". |
| Returned says "1 not in" | A bike isn't ticked in. Scan or tick it, or use Return with exception if it isn't back. |
| "isn't out with any group" when checking in | The bike wasn't scanned out today, or it's already checked in. Check the ID. |
| A multi-day hire didn't carry over | It was marked Returned when the next manifest was loaded. Add it with New Group, set the hire length and scan its bikes again. |
| Initials are wrong or missing | Tap 👤 at the top of the page and pick your name. If you're not on the list, add yourself under Admin → Team. |
| A typed ID says it "could be" two bikes | Type more of the ID, for example EB-12 rather than 12. |
| "check number" on a contact | The number doesn't fit any country's format. Ask the customer at check-in. For a walk-in, correct it with Edit on Today's Contacts. |
| A message shows "not confirmed" | Nobody answered Was it sent? after opening it. Check your phone's messages, and send again or call if it didn't go. |
| There's no Message button on a group | The booking has no phone number. For a walk-in, add one with + Add contact. |
| Can't sign off a checklist | An item hasn't been answered, or a MUST item isn't ticked as done. Every item needs Done or Problem; MUST items need Done. |
| Bikes were checked in at the wrong location | Open the Asset Register and tap the wrong location's chip. Tap Move bikes to a location, choose the right one, and scan or type each bike. The history keeps both entries. |
| A bike shows the wrong location | It was moved without being scanned or edited. Open it in the Asset Register, set the right location with your initials, and save. |
| "not M-checked since its last ride" when issuing | Do the M-check now if you can: switch to M-check and sign the bike off. The bike is issued either way, and the hire records whether it was checked. |
| A group was marked Returned by mistake | Tap Undo Returned on the Groups tab. |
| A bike was taken off by mistake | Scan it back onto the group. The trail will show both entries. |
| "Out of service" but the bike has been fixed | The repair hasn't been recorded. Resolve the issue in the Issue Reporter. |
| The home screen's backup line is red | The last backup failed, or none has been taken for 36 hours. Tell the manager today. The app keeps working as normal. See "SOP: The backup line is red". |
| A blue PREVIEW banner on the home screen | This phone is on a test copy of the app. Go back to the usual Operations Tools address. Nothing done on the preview reaches the live data. |
| Admin asks for an admin password | Admin is for the owner and manager. If you're meant to have it, ask the owner. Staff tools don't need it. |
| A roster upload says rows need fixing | Each row is listed with its line number and what's wrong. Fix the spreadsheet, save it as CSV again, and upload it again. Nothing has been changed. |
| Data is missing or wrong after a mistake | Don't try to re-enter it all. Tell the owner, who can restore just that part from last night's backup. See "SOP: Restoring from a backup". |
| Something else isn't working | Note the time, the page and what you tapped, and tell the owner. Don't use Reset All Data to fix it. |
