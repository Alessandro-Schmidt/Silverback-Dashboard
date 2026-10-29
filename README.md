# Silverback

*Ship like you mean it.*

A personal productivity dashboard on top of GitHub: the PRs you opened and merged, how many were approved on
the first review, how long they waited, your 6-week trends, and your assigned issues on a board you can drag
to change their status. Plus repo and organization pulse, and Android home-screen widgets.

There is no backend and no database. The app calls the GitHub GraphQL API straight from your device with your
token (`stats.js`). It keeps the last values on the device, so the dashboard and widgets still show something
when you're offline. Nothing is collected or processed on our side.

## Silverback rate

The key metric: the share of your PRs merged into `develop` in the period that were approved on the first review
(no "changes requested" before the first approval). It comes with a tier and a crest badge:
**Code Monkey** (0–29%), **Merge Chimp** (30–59%), **Silverback** (60–89%) and **King of the Repo** (90–100%).
It's shown for you, for the repository (all authors) and for the whole organization.

The period select (this week, this month, the last 10 or 30 working days, this quarter) drives every number;
the charts follow it too, one point per day (up to 2 weeks), per week (up to 24 weeks) or per month. The **Team** tab, open to everyone, shows: the team's rate,
merged PRs, cycle time, review balance, things that need attention, and a sortable members table.

## Run it

```bash
npm install
npm run dev
```

Open the URL Vite prints and paste a personal access token on the welcome screen. A fine-grained token with
read access to *Metadata*, *Pull requests*, *Issues* and *Projects* is enough; add *Projects* write access to
move issues on the board. Then pick the organization and repository in the top bar. The token stays on the
device (Capacitor Preferences, which is `localStorage` in the browser). `npm test` checks the stats logic.

## Android widget

You need Android Studio and the Android SDK.

```bash
npm run android
```

This builds the web app, syncs it into `android/` and opens Android Studio. Run the app on a phone or emulator
and sign in once. Then long-press the home screen, open **Widgets**, find **Silverback**, and drag out
**Silverback open PRs** or **Silverback organization**. Each widget refetches on its own every 30 minutes
(Android's minimum) with the saved token, and keeps the last numbers when offline. Tap a widget to open the app.

The widget code is `android/app/src/main/java/io/silverback/app/SilverbackWidget.java`. Its colours follow the
system light or dark theme (`res/values*/silverback_colors.xml`).

## Browser extension (Edge, Chrome)

A toolbar badge and a popup with your Silverback rate and crest, your stats, and a "Side-eye" list of what's
waiting on you; the toolbar icon wears your tier's crest and counts the PRs waiting on you. It refreshes every
15 minutes in the background.

There is nothing to build. Open `edge://extensions` (or `chrome://extensions`), turn on **Developer mode**, click
**Load unpacked** and pick the `extension/` folder. Click the Silverback icon, paste your token, and pick the
organization and repository.

The stats logic (`extension/lib/stats.js`) and the crest (`extension/lib/crest.js`) live inside the extension so
it loads as-is; the web app imports them from there, so both always compute the same numbers.

## GitHub Pages

`.github/workflows/pages.yml` builds the app and publishes `dist/` on every push to `main`. In the repository's
**Settings › Pages**, the source must be **GitHub Actions**.

## Not built yet

- iOS WidgetKit: needs a Mac, plus an App Group shared between the app and the widget.
- Dragging issues on touch screens (the Android app): drag and drop is mouse-only for now.
- Organizations with more than 100 repositories, and lists over 100 PRs or issues: only the first 100 count.
