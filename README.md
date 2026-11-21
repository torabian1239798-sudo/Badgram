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

1. Create a Supabase project.
2. Open **Project Settings → API** (or the project's Connect panel).
3. Copy the Project URL and Publishable key.
4. Copy `.env.example` to `.env` and set:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Use only the publishable/anon key in the mobile app. Never put a service-role or secret key in an Expo public environment variable.

5. In Supabase **SQL Editor**, run the complete contents of `supabase/schema.sql`.
6. In **Authentication → Providers**, enable Phone authentication and configure an SMS provider. For development, Supabase also supports configured test phone numbers and fixed OTP codes.
7. In **Database → Publications**, verify that `public.messages` is included in `supabase_realtime`. The SQL file attempts to enable it automatically.

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

This is an active foundation, not a production-certified messenger. It currently supports text messages, registered-phone lookup, basic private/group conversation creation, and live message inserts. It does not yet include media uploads, push notifications, message editing/deletion, read receipts, blocking/reporting, end-to-end encryption, or a full moderation/admin system. Complete security review, database migration verification, SMS-provider configuration, and real-device testing are still required before public release.

## Iranian SMS delivery (Kavenegar)

The app uses Supabase Auth to generate and verify phone OTPs. The Edge Function at
`supabase/functions/send-sms/index.ts` only delivers the OTP supplied in the signed
Supabase Send SMS Hook; it does not generate or validate OTPs itself.

### Provider setup

1. In Kavenegar, create an SMS verification template. Its body should contain the
   provider's `%token%` placeholder, and note the exact template name.
2. Deploy the Edge Function named `send-sms` with JWT verification disabled.
   The endpoint is:
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-sms`
3. In Supabase **Edge Functions → Secrets**, add these server-side secrets:
   - `SEND_SMS_HOOK_SECRET`: a Supabase Standard Webhooks secret in the form
     `v1,whsec_<base64-secret>`.
   - `KAVENEGAR_API_KEY`: the private API key from the provider.
   - `KAVENEGAR_TEMPLATE`: the exact verification-template name from step 1.
4. In Supabase **Authentication → Hooks**, enable **Send SMS** and set its HTTP
   endpoint to the Edge Function URL. Configure the same Standard Webhooks secret
   for the hook signature. Do not paste provider credentials into the app, GitHub,
   or chat.
5. In **Authentication → Providers → Phone**, enable phone sign-in and ensure SMS
   OTP confirmation is enabled. Do not enable automatic phone confirmation.
6. Test with a phone number you control, then confirm that the OTP arrives and
   that Supabase accepts it. Check provider and Supabase logs without exposing OTPs.

The function accepts Iranian E.164 mobile numbers in the `+989xxxxxxxxx` format
and converts them to the local `09xxxxxxxxx` receptor format expected by the
Kavenegar VerifyLookup API. The API key and hook secret are read only from server
environment variables. Never add them to `EXPO_PUBLIC_*` variables.

**Deployment status:** source code is committed to the `feature/iran-sms-auth`
branch. The Edge Function still needs deployment, secrets, and Auth Hook
configuration before real SMS sign-in can work.
