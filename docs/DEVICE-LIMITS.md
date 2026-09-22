# Device account limits

Free AI makes extra accounts tempting. To keep one person from farming many,
each computer has two limits:

| Limit | Default | Setting |
| --- | --- | --- |
| Accounts that can **start** on a computer (be used there first) | 2 | `DEVICE_MAX_NEW_ACCOUNTS` |
| Accounts that can **sign in** on a computer at all | 4 | `DEVICE_MAX_ACCOUNTS` |

An account that already signed in on a computer can always sign in there
again. Refused learners see why, e.g. *"This computer already has 2 Vylos
accounts. Sign in with one of them to keep learning."*

## How it works

- **Device id.** The app hashes the operating system's install id
  (`/etc/machine-id` on Linux, `MachineGuid` on Windows, `IOPlatformUUID` on
  macOS) with SHA-256 (`electron/device.ts`). The raw id never leaves the
  computer, and reinstalling Vylos doesn't change it.
- **"Registered" means first used.** Accounts are created in the browser
  (email or Google), where the app can't see them. So an account counts as
  registered on the computer where it is **first signed in to Vylos**.
- **Server-side decision.** After every sign-in, and on startup with a saved
  session, the app calls the `device-register` Edge Function. Its database
  function `register_device` checks both limits under a lock, so parallel
  sign-ins can't slip past them. A refused sign-in never opens the app, and
  its session is revoked.
- **AI requires it** (once `REQUIRE_DEVICE` is on). `ai-generate` and
  `ai-live-token` only serve an account from a computer it's registered on,
  so skipping the app's check doesn't get anyone free AI.

The data lives in `public.device_accounts` (device hash, account, first
device or not, first and last seen). Deleting an account removes its rows.

## Limits of this approach

The device id comes from the learner's computer, so someone with admin
rights who edits the OS id, or who scripts the API with invented ids, can get
past it. It stops casual farming (new emails on the same computer), not a
determined attacker. If abuse continues, add per-IP sign-up limits or
CAPTCHA (`[auth.captcha]` in `supabase/config.toml`), or require verified
email (`enable_confirmations`).

The hashed device id is a persistent identifier: mention it in the privacy
policy.

## Rolling it out

Order matters: turning on `REQUIRE_DEVICE` before every installed app sends
the device id would cut off AI for older versions.

1. **Database and functions.** Apply the migration and deploy:
   ```bash
   supabase db push
   supabase functions deploy device-register ai-generate ai-live-token
   ```
   The limits start counting now. The AI functions still accept requests
   without a device id.
2. **Release the app** that sends the device id (see [RELEASING.md](RELEASING.md)).
   Every release is mandatory, so installed apps update to it.
3. **Enforce** once users have updated:
   ```bash
   supabase secrets set REQUIRE_DEVICE=true
   ```
   From then on, an account over a computer's limits gets no AI there.

Apps from before step 2 don't call `device-register`, and apps from after it
work fine before the server is deployed: they treat a missing function as
"not checked" and let the learner in.
