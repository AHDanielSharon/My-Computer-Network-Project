# Lantern

Lantern is a local-first chat, file-sharing, and calling app for devices on the same Wi-Fi network. One laptop runs the server; phones, tablets, and other laptops join from a browser. Nothing leaves your LAN — no accounts, no cloud, no external STUN/TURN servers, and no internet connection required.

## What it does

- **People** — join with a display name, edit your profile and picture, see who is online or busy.
- **Chats** — direct messages and groups, create groups and add people, reply, forward, edit, delete, pin, react, search messages, typing indicators, delivery and read receipts.
- **Files** — images, video, audio, voice notes, PDFs, and documents with previews, upload progress and speed, downloads, and interrupted-transfer recovery.
- **Calls** — real peer-to-peer WebRTC voice and video for 1:1 and small groups (up to 6), incoming-call dialogs, mute, camera toggle, front/rear camera switch, screen sharing on desktop browsers, call timer and call history.
- **Extras** — location sharing, pinned messages, group announcements, notification and sound settings, recently shared files, light and dark themes.
- **Local by design** — SQLite database and uploaded files stay in `data/` on the host machine.

## Requirements

- **Node.js 22.13 or newer** (Node 24 LTS recommended) — the server uses the built-in `node:sqlite` module.
- All devices on the **same Wi-Fi/LAN**. The host laptop must stay awake and running.
- A modern browser (Chrome, Edge, Safari, Firefox). Camera, microphone, and notifications need a secure context, which Lantern provides with local HTTPS.

## Quick start

On the host laptop:

```bash
npm install
npm run build
npm start
```

The terminal prints the LAN URL, a QR code, and the actual port (default `8443`). It looks like:

```
LANTERN  v1.0.0 · local-first chat for your Wi-Fi
  Server ready on HTTPS
  → https://localhost:8443
  → https://192.168.1.24:8443

  Invite someone: open the URL above on their phone (same Wi-Fi).
```

On each phone/tablet/laptop:

1. Connect to the **same Wi-Fi** as the host.
2. Open `https://<host-lan-ip>:8443` (or scan the QR code from the server terminal, or use **Invite** inside the app).
3. Accept the certificate warning (see below), then enter a display name.

Everyone who joins is added to the default **General** group. There are no pre-seeded users or messages.

### Development mode

```bash
npm run dev
```

Runs the API server on `https://localhost:8443` and Vite on `https://localhost:5173` with hot reload. Use the production build (`npm run build && npm start`) when testing on phones.

## HTTPS and camera/microphone permissions

Lantern generates a self-signed certificate covering the host's current LAN IPs on first start. Browsers will warn once because the certificate is not from a public authority.

**Accept the warning (fastest):**

- **Chrome / Edge (desktop or Android):** *Advanced* → *Proceed to <ip> (unsafe)*.
- **Safari (iOS/macOS):** *Show Details* → *visit this website* → *Visit Website*.

After accepting, the page is a secure context and camera/microphone prompts work.

**Trust the certificate properly (recommended for phones):**

1. On the phone, open `https://<host-lan-ip>:8443/lantern-cert.pem` (accept the warning first) to download the certificate.
2. Install and trust it:
   - **iOS/iPadOS:** open the downloaded file → *Profile Downloaded* → *Settings → General → VPN & Device Management* → install the profile → *Settings → General → About → Certificate Trust Settings* → enable full trust for **Lantern LAN Chat**.
   - **Android:** *Settings → Security → Encryption & credentials → Install a certificate → CA certificate* → choose the downloaded file.
   - **Windows:** double-click the `.pem`, *Install Certificate* → *Local Machine* → *Trusted Root Certification Authorities*.
   - **macOS:** open in *Keychain Access*, add to *System*, then set *Trust → Always Trust*.
3. Reload the app. The warning disappears and calls can use the camera and microphone.

> If camera/mic still fails on a phone: confirm the URL starts with `https://`, the certificate is trusted, and the browser has permission for the site. `HTTPS=0` is only intended for testing on the host machine — other devices will not get camera/mic access over plain HTTP.

## Using Lantern without internet

1. Connect all devices to a Wi-Fi router that does **not** need internet access (or disconnect the router's WAN uplink).
2. Start Lantern on the host laptop with `npm start`.
3. Join from the other devices using the LAN IP.

Messages, files, and calls all work because signalling and media stay on the local network. No DNS or external service is used.

## Troubleshooting

- **Phone can't open the page** — check that both devices are on the same network, the host firewall allows inbound TCP `8443`, and the router does not have "AP/client isolation" enabled. Corporate and guest Wi-Fi networks often block device-to-device traffic; use a normal home router or a phone hotspot.
- **The invite QR points at the wrong address** — laptops with a mobile hotspot, VPN, or virtual adapters expose several addresses. Open **Invite** and choose the network your phone is actually connected to; the QR code and invite link follow the selected chip.
- **Windows Firewall** — allow Node.js when prompted, or add a rule:
  `netsh advfirewall firewall add rule name="Lantern" dir=in action=allow protocol=TCP localport=8443`
- **Port already in use** — Lantern automatically tries the next port (`8444`, `8445`, …) and prints the URL it actually uses. You can also set `PORT=9000`.
- **Calls connect but there is no audio/video** — make sure the certificate is accepted/trusted, the browser has camera and microphone permission, and no other app is holding the camera. A VPN on either device can also break LAN peer-to-peer media.
- **Screen sharing is missing** — browsers only expose `getDisplayMedia` on desktop; the button is hidden where it is unsupported.
- **Uploads fail** — default limit is 2 GB per file. Increase it with `MAX_UPLOAD_MB`.
- **Lost your session** — join again with a new name; sessions expire after 90 days of inactivity.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8443` | HTTPS/HTTP port |
| `HTTPS` | `1` | Set `0` to run plain HTTP (testing only) |
| `DATA_DIR` | `./data` | Database, uploads, avatars, certificates |
| `MAX_UPLOAD_MB` | `2048` | Maximum file size per upload |
| `KEY_FILE` / `CERT_FILE` | generated | Use your own TLS key/certificate instead of the self-signed pair |

Example: `PORT=9000 MAX_UPLOAD_MB=4096 npm start`

## Your data

Everything is stored on the host:

```
data/
  lantern.db      SQLite database (users, chats, messages, calls)
  files/          Uploaded images, videos, audio, documents
  avatars/        Profile pictures
  certs/          Generated TLS certificate and key
  tmp/            In-progress uploads (cleaned automatically)
```

- **Back up:** stop the server and copy the whole `data/` directory.
- **Reset everything:** stop the server and delete `data/` (or just `data/lantern.db*` and `data/files/*`). The next start recreates an empty server with the General group.

## How it works

- **Server** — Node.js + Express serves the built React app, a REST API, and Socket.IO for realtime events. SQLite (WAL mode) stores everything. A random 256-bit session token is issued at join and stored hashed; every API request and socket connection is authenticated with it.
- **Client** — React 19 + TypeScript + Tailwind CSS v4. Socket.IO pushes messages, presence, typing, read receipts, and call signalling. Uploads use XHR for progress and speed; downloads support HTTP Range requests so large media can stream and resume.
- **Calls** — WebRTC with an empty `iceServers` list, so no external STUN/TURN is contacted. Peers exchange SDP/ICE through the local Socket.IO server and connect directly using LAN host candidates. Group calls use a full mesh (capped at 6 participants). The server handles ringing, timeouts, and call history only; media never passes through it.
- **Security** — files are stored under random names and served only to members of the conversation with `Content-Disposition` and `nosniff` headers; only raster images and audio/video are previewed inline. Names are unique per network, uploads are size-limited, and join attempts are rate-limited. Messages are **not** end-to-end encrypted — traffic is protected by the local HTTPS connection, and the host can read stored data.

## Project structure

```
server/        Express API, Socket.IO, SQLite, WebRTC signalling, TLS
client/        React + TypeScript + Tailwind interface
  src/views/       Home, People, Files, Calls
  src/components/  Chat, calls, modals, sidebar, uploads
  src/context/     App data/socket, call state, UI modals
scripts/dev.js Runs server + Vite together
data/          Runtime data (created automatically)
```

## Limitations

- Devices must be on the same LAN; there is no remote access by design.
- The host laptop is the server — if it sleeps or exits, the network goes offline.
- Self-signed certificates require a one-time trust step.
- Screen sharing is available on desktop browsers only; mobile browsers do not support it.
- Group calls are limited to 6 participants to keep the peer-to-peer mesh reliable on Wi-Fi.
