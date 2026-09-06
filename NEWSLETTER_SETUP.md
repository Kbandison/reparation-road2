# Newsletter setup

Everything runs on Resend, which the site already uses. No new vendor.

Code is in place and builds; the steps below are the parts that need a human —
running SQL, adding DNS records, and pasting keys.

## 1. Run the migration

Paste `newsletter_migration.sql` into the Supabase SQL editor and run it. It is
idempotent, so re-running is safe.

It adds consent columns to `profiles`, creates `newsletter_subscribers` for
signups with no account, and creates `newsletter_events` as the consent audit
trail. Both new tables are service-role only — no browser can read them.

## 2. Set up the sending subdomain

Marketing email must not share a domain with password resets and receipts. A
spam complaint on the newsletter would otherwise degrade delivery of mail people
actually need.

1. In Resend → Domains, add `news.reparationroad.org`.
2. Add the SPF, DKIM, and DMARC records Resend gives you to the DNS for
   `reparationroad.org`.
3. Wait for verification.

Keep `noreply@reparationroad.org` exactly as it is for transactional mail.

## 3. Create the audience

Resend → Audiences → create one named **The Road Report**. Copy its ID.

One audience, not five. Membership tier and billing state already live in
Supabase and change there first; `lib/newsletter-segments.ts` computes the
recipient list for a given segment at send time. Mirroring those values into
parallel lists would only create copies that drift.

## 4. Point a webhook back at the site

Resend → Webhooks → add `https://reparationroad.org/api/newsletter/webhook`,
subscribed to:

- `contact.updated`
- `contact.deleted`
- `email.bounced`
- `email.complained`

Copy the signing secret.

This is the return path. Without it, an unsubscribe made in the inbox never
reaches the member record, and the reconcile job pushes that person back into
the audience on its next run.

## 5. Environment variables

Add to `.env.local` and to the Vercel project:

| Variable | Value |
| --- | --- |
| `RESEND_NEWSLETTER_AUDIENCE_ID` | Audience ID from step 3 |
| `RESEND_WEBHOOK_SECRET` | Signing secret from step 4 (`whsec_…`) |
| `NEWSLETTER_FROM` | `The Road Report <news@news.reparationroad.org>` |
| `NEWSLETTER_REPLY_TO` | A real monitored inbox — readers write back with family records |
| `NEWSLETTER_POSTAL_ADDRESS` | Physical mailing address. **Required by CAN-SPAM in every newsletter.** |
| `NEWSLETTER_TOKEN_SECRET` | Any long random string. Signs unsubscribe links. |
| `CRON_SECRET` | Any long random string. Authenticates the reconcile job. |

`RESEND_API_KEY` and `NEXT_PUBLIC_APP_URL` are already set.

Until `RESEND_NEWSLETTER_AUDIENCE_ID` exists, signups are still recorded in
Supabase — consent is never lost — and the reconcile job pushes them to Resend
once it is configured.

## 6. Deploy

`vercel.json` schedules the reconcile job daily at 05:00 UTC. It only ever looks
at rows that are currently `subscribed`, so it can never re-subscribe someone who
opted out.

Daily, not hourly, because the Hobby plan caps cron frequency at once per day —
an hourly expression makes the deploy fail outright. The gap is tolerable: a row
that failed to reach Resend only matters if an issue ships before the next pass.
To run it on demand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://www.reparationroad.org/api/cron/newsletter-reconcile
```

On Pro, change the schedule to `0 * * * *` for hourly.

## What exists now

| Path | Purpose |
| --- | --- |
| `newsletter_migration.sql` | Schema: consent columns, subscriber table, audit trail |
| `lib/newsletter.ts` | Contact sync, consent records, signed unsubscribe tokens |
| `lib/newsletter-emails.ts` | Confirmation and welcome templates, with unsubscribe + postal footer |
| `lib/newsletter-confirm.ts` | Turns a confirmed signup into a live subscription |
| `lib/newsletter-segments.ts` | Recipient lists computed from Supabase at send time |
| `app/api/newsletter/subscribe` | Public signup (POST) and confirmation (PUT) |
| `app/api/newsletter/unsubscribe` | One-click unsubscribe, RFC 8058 compatible |
| `app/api/newsletter/preferences` | The signed-in member's own toggle |
| `app/api/newsletter/webhook` | Resend → site. Unsubscribes, bounces, complaints |
| `app/api/cron/newsletter-reconcile` | Repairs anything the live sync missed |
| `app/api/admin/newsletter` | Segment sizes and list health |
| `/newsletter/confirm`, `/newsletter/unsubscribe` | Landing pages for email links |
| Footer form, signup checkbox, settings toggle | The three ways consent is given or withdrawn |

## Decisions worth confirming with the client

**The signup checkbox is unticked by default**
(`components/auth/auth-modal.tsx`). A pre-ticked box is not valid consent under
GDPR, and a genealogy audience reliably includes UK and EU researchers. Ticking
it by default would lift signups and is defensible for a US-only list — it is a
one-line change, but it is the client's call, not ours.

**Signup consent waits for email verification.** Ticking the box at signup sets
`newsletter_pending_opt_in`; the contact only reaches Resend once the account's
email is verified. This keeps mistyped addresses out of the sending list.

**Cancelling a membership does not unsubscribe anyone.** Former members are
often the readers most worth keeping. See the comment in
`app/api/stripe/webhook/route.ts`.

## Still to build

- Composing and sending an issue (the recurring template, and generating
  "New This Week" from the collection record counts).
- The 3-email welcome sequence beyond the first message.
- An admin screen over `/api/admin/newsletter`.
- Rate limiting on the public subscribe endpoint. It has a honeypot and a
  5-minute resend cooldown per address, but no global limit.
