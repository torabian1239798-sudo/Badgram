# Badgram

A Persian-first Expo / React Native messaging app with a dark glass UI and Supabase backend.

## Current foundation

- Phone-number OTP authentication through Supabase Auth.
- Persistent native authentication session.
- Private conversations and group creation using registered phone numbers.
- Conversation list backed by PostgreSQL.
- Message history and live incoming-message updates through Supabase Realtime.
- Row Level Security policies for profiles, conversations, memberships, and messages.

## Requirements

- Node.js LTS
- A Supabase project
- Expo Go for development, or an EAS build for an installable Android package

## Configure Supabase

1. Open **Project Settings → API** (or the project's Connect panel).
2. Copy the Project URL and Publishable key.
3. Copy `.env.example` to `.env` and set:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Use only the publishable/anon key in the mobile app. Never put a service-role or secret key in an Expo public environment variable.

4. Confirm that the database schema in `supabase/schema.sql` matches the deployed project. Do not blindly rerun the full schema against an existing production database.
5. In Supabase **Authentication → Providers**, enable Phone authentication.
6. In **Database → Publications**, verify that `public.messages` is included in `supabase_realtime`.

## Run locally

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go. If you change `.env`, restart Expo with its cache cleared:

```bash
npx expo start -c
```

## Android APK

Install and sign in to EAS CLI, then configure the project:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview
```

The preview profile is configured for an installable APK.

## Important limitations

This is an active foundation, not a production-certified messenger. It currently supports text messages, registered-phone lookup, basic private/group conversation creation, and live message inserts. It does not yet include media uploads, push notifications, message editing/deletion, read receipts, blocking/reporting, end-to-end encryption, or a full moderation/admin system. Complete security review, SMS-provider configuration, and real-device testing are still required before public release.

## Iranian SMS delivery (Kavenegar)

The app uses Supabase Auth to generate and verify phone OTPs. The deployed Edge Function named `send-sms` only delivers the OTP supplied in the signed Supabase Send SMS Hook; it does not generate or validate OTPs itself.

### Provider setup

1. In Kavenegar, create an SMS verification template. Its body should contain the provider's `%token%` placeholder, and note the exact template name.
2. The Edge Function is deployed at:
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-sms`
   with JWT verification disabled.
3. In Supabase **Edge Functions → Secrets**, add these server-side secrets:
   - `SEND_SMS_HOOK_SECRET`: the Supabase Standard Webhooks signing secret in the format supplied by the Send SMS Hook.
   - `KAVENEGAR_API_KEY`: the private API key from Kavenegar.
   - `KAVENEGAR_TEMPLATE`: the exact verification-template name from step 1.
4. In Supabase **Authentication → Hooks**, enable **Send SMS** and set its HTTP endpoint to the Edge Function URL. Configure the same signing secret for the hook. Do not paste provider credentials into the app, GitHub, or chat.
5. In **Authentication → Providers → Phone**, enable phone sign-in and ensure SMS OTP confirmation is enabled. Do not enable automatic phone confirmation.
6. Test with a phone number you control, then confirm that the OTP arrives and Supabase accepts it. Check provider and Supabase logs without exposing OTPs.

The function accepts Iranian E.164 mobile numbers in the `+989xxxxxxxxx` format and converts them to the local `09xxxxxxxxx` receptor format expected by the Kavenegar VerifyLookup API. The API key and hook secret are read only from server environment variables. Never add them to `EXPO_PUBLIC_*` variables.

**Deployment status:** the `send-sms` Edge Function is deployed and active with JWT verification disabled. Real SMS sign-in is not yet verified; it still requires the three server-side secrets, the Authentication Send SMS Hook configuration, Phone Auth configuration, and a successful end-to-end OTP test.
