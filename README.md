# Silverback

GitHub stats as tiles and home-screen widgets: open PRs, open issues and stars of one repository, plus
an organization's repository count, total open PRs and top languages.

There is no backend and no database. The app calls the GitHub GraphQL API straight from your device
with your token, in one query (`stats.js`). It keeps the last values on the device, so the tiles and
widgets still show something when you're offline.

## Run it

```bash
npm install
npm run dev
```

Open the URL Vite prints, paste a personal access token (fine-grained, read-only *Metadata*,
*Issues* and *Pull requests* is enough), then enter `owner/repo` and an organization, and press
**Save & refresh**. The token stays on the device (Capacitor Preferences, which is `localStorage`
in the browser). `npm test` checks the stats summary.

## Android widget

You need Android Studio and the Android SDK.

```bash
npm run android
```

This builds the web app, syncs it into `android/` and opens Android Studio. Run the app on a phone
or emulator and sign in once. Then long-press the home screen, open **Widgets**, find **GHero**,
and drag out **GHero open PRs** or **GHero organization**. Each widget refetches on its own every
30 minutes (Android's minimum) with the saved token, and keeps the last numbers when offline. Tap a
widget to open the app.

The widget code is `android/app/src/main/java/io/ghero/app/GHeroWidget.java`. Its colours follow
the system light or dark theme (`res/values*/ghero_colors.xml`).

## Not built yet

- iOS WidgetKit: needs a Mac, plus an App Group shared between the app and the widget.
- Windows 11 widget (PWA widgets are still experimental).
- Organizations with more than 100 repositories: total PRs and languages count the first 100.
