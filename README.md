# cards

A lightweight, offline-friendly wallet for manually saving card identifiers and displaying them as barcodes or QR codes.

## Features
- Add named cards and identifiers manually
- Display each identifier as a barcode or QR code
- Save cards in `localStorage`
- Installable Progressive Web App
- Offline caching via a service worker

## Run locally
1. Open a local static server in the project root, for example:
   ```bash
   python3 -m http.server 8000
   ```
2. Visit `http://localhost:8000` in your browser.

## Notes
- Card data is stored in this browser's `localStorage` and is not synced between devices.
