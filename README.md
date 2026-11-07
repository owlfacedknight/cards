# cards

A lightweight, offline-friendly wallet app for storing card identifiers and scanning barcodes or QR codes with the device camera.

## Features
- Save named passes in `localStorage`
- Toggle between barcode and QR code displays
- Scan 1D and QR codes using the device camera
- Works as a simple Progressive Web App
- Offline caching via a service worker

## Run locally
1. Open a local static server in the project root, for example:
   ```bash
   python3 -m http.server 8000
   ```
2. Visit `http://localhost:8000` in your browser.

## Notes
- Camera access requires a secure context or localhost.
- Browsers may restrict camera functionality in non-HTTPS environments.
