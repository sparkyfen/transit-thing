# Transit Thing

Next bus, train, and ferry arrivals on a Spotify Car Thing running
[bridgething](https://bridgething.com). An arrivals board for your desk that
also works in the car.

| Board | Ambient | Nearby stops |
| --- | --- | --- |
| ![Arrivals board](apps/transit-thing/screenshots/1-board.png) | ![Ambient clock](apps/transit-thing/screenshots/2-ambient.png) | ![Stop picker](apps/transit-thing/screenshots/3-picker.png) |

## What it does

- Shows the next arrivals for the stops you save, with a countdown, the
  scheduled time, and a live marker when the agency sends real-time data.
- Marks a live arrival that is running late (`+N min`) or early (`-N min`).
  Servers on the `delaySeconds` fork of Transit Tracker report this directly;
  elsewhere the app compares each prediction with the first one it saw.
- Turn the dial to move between stops. Presets 1 to 4 jump to your first four.
- Press the dial or tap **Add a stop** to pick a stop, then choose which
  routes to show. Tap **Use my location** to put the closest stops first.
- Shows a clock after a minute without input. Press any button to get back to
  the board.

Data comes from a [Transit Tracker API](https://github.com/tjhorner/transit-tracker-api)
server. The default is TJ Horner's public instance at `tt.horner.tj`, which
serves dozens of agencies across North America and Europe, including Puget
Sound. You can point the app at your own server in its settings.

## Install

1. In the bridgething companion app, open the store and add this source:

   ```
   https://sparkyfen.github.io/transit-thing/catalog.v1.json
   ```

2. Install **Transit Thing**.
3. Open its settings to pick a feed and a server, or pick stops on the device.

The app uses this device's location once to find nearby stops, and only when
you ask. It sends an area around you to the transit server in settings
(`tt.horner.tj` by default), which sees the request like any web request.
Transit Thing does not store it, collects nothing else, and has no analytics.

## Develop

```sh
bun install
bun run dev            # against a connected bridgething instance
bun run dev:device     # the same, shown on the Car Thing screen
bun run test           # unit tests
bun run check          # typecheck, build, and validate the catalog
```

The app lives in `apps/transit-thing`. Pushing to `main` publishes the catalog
to GitHub Pages.

## Credits

- [Transit Tracker](https://transit-tracker.eastsideurbanism.org/) and its API
  by TJ Horner and Eastside Urbanism.
- [bridgething](https://bridgething.com) by Joey Eamigh.

## License

MIT. See [LICENSE](LICENSE).
