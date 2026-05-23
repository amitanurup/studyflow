# StudyFlow

Modern daily study and homework dashboard with:

- homework entries that can be submitted only with an uploaded proof file
- focus timer with automatic credited study-time totals and history
- compulsory daily study proof upload after completing a study session
- optional webcam focus mode using local-only presence/activity detection
- mobile camera pairing over a direct WebRTC video connection
- phone note-photo capture that automatically saves files on the PC
- a 16-hour verified study milestone that unlocks one gift up to Rs 50
- browser `localStorage` persistence for tasks, daily goal and sessions

## Start the app

On any laptop, copy this full project folder, then install the dependency and start StudyFlow:

```powershell
npm.cmd install
npm.cmd start
```

Then open `http://localhost:4173` on that laptop.

For another phone on the same Wi-Fi, use the printed LAN address, for example:

```text
http://192.168.1.8:4173
```

To pair a phone, select **Connect mobile camera** on the dashboard and open the generated mobile link on the phone. The generated link uses the current laptop/server address, so the same copied app works on any laptop.

## Public launch on Render

This project is ready for a public HTTPS launch on Render using `render.yaml`.

1. Create a GitHub repository and push this project folder.
2. Open Render and choose **New > Blueprint**.
3. Connect the GitHub repository.
4. Render will read `render.yaml` and create a web service with:
   - `npm ci` build
   - `npm start` run command
   - `/var/data` persistent disk for uploads
5. Set the environment variable:

```text
APP_PASSWORD=choose-a-strong-password
```

6. Deploy. Render will give you an HTTPS URL like:

```text
https://studyflow.onrender.com
```

Use that URL on laptop and mobile. Camera permission works on public HTTPS. WebRTC phone pairing uses the same public URL.

Important: public cloud uploads are saved on the Render persistent disk, not on your laptop. Keep `APP_PASSWORD` enabled because homework/study proof files are private.

## Public launch with Docker/VPS

Build and run:

```powershell
docker build -t studyflow .
docker run -p 4173:4173 -e APP_PASSWORD="choose-a-password" -e DATA_DIR="/data" -v studyflow-data:/data studyflow
```

Put the app behind HTTPS using a reverse proxy such as Caddy, Nginx, or your hosting provider's HTTPS load balancer.

## Use a mobile camera

Mobile browsers require an HTTPS page before they allow camera access. Run this app with a trusted HTTPS certificate, with both devices on the same Wi-Fi:

```powershell
$env:SSL_KEY="C:\path\to\trusted-local-key.pem"
$env:SSL_CERT="C:\path\to\trusted-local-cert.pem"
npm.cmd start
```

Open the printed HTTPS laptop address on the laptop, press **Connect mobile camera**, and open the generated HTTPS link on the phone. On the phone, choose front/back camera and tap **Share camera with laptop**.

A certificate must be trusted by the phone. A trusted local certificate generated for the laptop's LAN address, or hosting the app behind HTTPS, is required for real phone camera permission.

## Capture notes to the PC

After the phone camera is connected, tap **Capture note photo** on the phone. Each selected capture is automatically written to the local folder:

```text
saved-notes\
```

The saved photos also appear in the dashboard under **Saved note photos**, where they can be opened from the laptop.

## Strict daily submission

- A homework card cannot be marked submitted without uploading an image, PDF or Word proof file.
- Today's study proof can be uploaded after a finished study session has recorded study time.
- Proof files are stored locally on the PC in:

```text
submitted-files\homework\
submitted-files\study\
```

## 16-hour gift reward

The reward card counts cumulative credited study sessions only when that session's date has a submitted daily study proof. After `16` verified hours, the dashboard unlocks a one-time gift claim capped at `Rs 50`.

## Camera privacy

Camera mode is off by default and starts only after user permission. Live frames are processed in the laptop browser to estimate presence/activity and are not stored. Mobile camera video travels directly from phone to paired laptop using an encrypted WebRTC connection. Only photos explicitly taken with **Capture note photo** are stored in the PC `saved-notes` folder.
