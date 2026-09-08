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

- [x] **Rate limiting on `POST /api/newsletter/subscribe`.** Done 2026-09-08.
      Postgres-backed (`rate_limits` table + `check_rate_limit`), 5/hour per IP
      and 100/hour globally. Requires `rate_limits_migration.sql`.
- [x] **Rate limiting on `POST /api/contact`.** Found while doing the above and
      more serious: the route has no authentication and sends to a
      caller-supplied address, so it was an open relay for Reparation Road mail
      on the same domain that carries password resets. It cannot be
      authenticated — the welcome email is sent before the account exists — so
      volume is the only available lever. 10/hour per IP, 200/hour globally.
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

## Found while working, not yet fixed

- [ ] **`/api/contact` type `welcome-profile` accepts a caller-supplied
      `userId`** and writes `first_name`, `last_name` and donor status to it with
      no authentication. The donor code is validated so status cannot be
      granted, but anyone who knows a profile UUID can rename that account.
      Rate limiting caps the volume; it does not close the hole. The fix is to
      derive the user from the session instead of the request body, which means
      touching the signup flow — deliberately not done in passing.

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
