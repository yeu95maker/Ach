# Releasing MealMatch to the App Store (no computer needed)

State: app config, icon, eas.json, privacy policy, store text and screenshots are done.
Expo project ID 0b3229e0-4bbd-4e02-96dc-e249cd12bf6d is in app.json. Bundle ID com.yeu95maker.mealmatch.

The first iOS build must create the Apple distribution certificate, which eas-cli only does
in interactive mode. It is run from the cloud session with these environment variables:

- EXPO_TOKEN – Expo access token
- EXPO_ASC_KEY_ID, EXPO_ASC_ISSUER_ID – App Store Connect API key (Admin role)
- EXPO_ASC_API_KEY – the .p8 file contents (written to a file; EXPO_ASC_API_KEY_PATH points to it)
- EXPO_APPLE_TEAM_ID – Apple Developer Team ID

Allowed domains needed: expo.dev, api.expo.dev, storage.googleapis.com,
api.appstoreconnect.apple.com, appstoreconnect.apple.com, developer.apple.com.

Steps for the session:
1. printf the key into a file (rebuild PEM line breaks if they were lost), export EXPO_ASC_API_KEY_PATH.
2. `cd mealmatch && npm ci && npx eas-cli@latest build -p ios --profile production --auto-submit`
   driven through a pty (pexpect); answer "yes" to generating a new distribution certificate
   and provisioning profile, and let it use the API key for submission.
3. Later builds can run non-interactively, or from expo.dev once GitHub is linked.
