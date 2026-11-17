<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/b326580e-307a-4f2e-9e07-54256ae125b4

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Raspberry Pi integration

The game screen always uses the WebSocket backend as the authoritative source
of game state. For a Pi simulation without the Coordinator, start the Python
backend with `--transport simulation`, then set the dashboard WebSocket URL to
`ws://<pi-ip>:8765`. The dashboard's Simulation toggle only labels the Pi
transport; it does not switch to a separate browser game engine.

The game screen expects an MJPEG camera endpoint at
`http://<pi-ip>:8080/video`. The host is taken from the browser URL, so the
dashboard and camera service should be reached through the Pi's address.
