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
