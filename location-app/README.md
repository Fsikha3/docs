# Circle Locator

Consent-based location sharing for family, friends or teams (installable PWA, works on Android/iOS browsers).

- Create a circle → share the 6-character invite code.
- Members join with the code and **manually** tap "Start sharing". Sharing status is always visible.
- "Stop sharing" erases your last location; "Leave" deletes all your data.
- It can only show people who joined your circle and are currently sharing. It cannot track an arbitrary phone number.

## Run

```bash
node server.js          # http://localhost:3000
```

Phones need HTTPS for GPS (browsers block geolocation on plain http, except localhost).
Deploy to Render/Railway/Fly, or test locally with `cloudflared tunnel --url http://localhost:3000`.

## Stack
Node (no dependencies), Leaflet + OpenStreetMap, JSON file storage (`data.json`, gitignored).

## Next steps
Native Android (Kotlin foreground service) for background tracking, geofence alerts ("reached home"), SOS button, place history.
