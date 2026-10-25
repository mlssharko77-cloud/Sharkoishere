# Malabar Life RP — Proximity Voice Chat build

## Run locally
1. Install Node.js 18 or newer.
2. In this folder, run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000` on the same device. For another device, use the host computer's LAN IP and ensure port 3000 is reachable.

## Voice chat
- Tap **🎙 VC: off** and allow microphone permission to enable voice.
- Voice volume fades with distance (full volume nearby, silent at about 35 in-game units).
- Requires HTTPS on public hosting; `localhost` is allowed for local testing.
- WebRTC uses Google's public STUN server only. Some carrier/mobile/Wi-Fi NATs require a TURN relay; in those networks voice may fail until a TURN service is configured.
- Browsers may require a user tap before playing incoming audio.

## Test status
JavaScript syntax checks and ZIP integrity can be run locally. This package has not been verified in a live two-device voice call or a 30-player load test. Do not treat the signaling code alone as proof that all networks will connect.

## Important
This is the existing prototype/server project, not a finished production GTA-style game. Use HTTPS for public hosting and configure persistent storage/backups before production use.
