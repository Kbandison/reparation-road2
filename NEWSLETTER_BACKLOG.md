# Newsletter — outstanding work

Paused on 2026-09-06. The system is functionally complete: subscribers can be
collected, an issue can be written and sent. Everything below is known-missing,
not discovered-later.

Setup and architecture: [NEWSLETTER_SETUP.md](NEWSLETTER_SETUP.md).

## Blocking a first real send

- [ ] **Real postal address.** `NEWSLETTER_POSTAL_ADDRESS` in Vercel is still
      `Reparation Road, 123 Example St, City, ST 00000`. It renders in the footer
      of every issue and is required by CAN-SPAM. Runtime value — no redeploy.
- [ ] **Verify the two fixes from the first test send.** Send one test and
      confirm the archive section renders ("The Archive", 101,596 records) and
      that preview/test no longer need a manual save first.

## Gaps, in priority order

- [ ] **Rate limiting on `POST /api/newsletter/subscribe`.** Currently a honeypot
      and a 5-minute per-address cooldown, nothing more. Confirmed no global
      limit. This is the only item with an attacker rather than an inconvenience
      behind it: a script cycling addresses burns Resend quota and can get the
      sending domain flagged. Fix before the footer form sees real traffic.
- [ ] **Welcome sequence emails 2 and 3.** Only the welcome exists. Plan was:
      day 0 welcome, day 2-3 "Getting Started With the Database", then "What
      We're Building". Needs a scheduled sender — the daily reconcile cron is
      the obvious place to hang it off.
- [ ] **List-health screen.** `/api/admin/newsletter` already returns segment
      counts plus an `unsynced` figure; nothing displays it. A stuck sync is
      currently invisible unless someone queries by hand.
- [ ] **Send resumption.** A send that exceeds the 300s function limit marks the
      issue sent with a partial count rather than double-sending. Correct at
      thousands, wrong at tens of thousands. Needs per-recipient send tracking
      to resume safely.

## One-time manual tasks

- [ ] **Refresh link-preview caches.** The light OG image is live, but Facebook,
      LinkedIn, Slack and iMessage cache hard. Run the URL through each
      platform's debugger or the old dark image persists for days.
- [ ] **Decide about `apaul@reparationroad.org`.** Subscribed during testing and
      currently the entire list. Remove if that was demo-only; otherwise they
      receive the first genuine issue.

## Deliberately not done

- **Segment-specific audiences in Resend.** One audience holds consent;
  recipient lists are computed from Supabase at send time. Mirroring tier into
  parallel audiences would only create copies that drift.
- **Editing a sent issue.** It is the record of what reached people's inboxes.
