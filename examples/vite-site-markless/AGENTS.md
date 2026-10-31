# vite-site-markless

This app is the Markless port of the Vite site in `../vite-site-old` (old source: read it, never edit it).
The old app is not hosted any more; run it locally with `npm start` in `../vite-site-old`.

- Build with `npm run build`. A supervisor serves the build at http://127.0.0.1:4300 and restarts it after every build; do not start another server.
- The server has `CMS_URL` set to the same CMS the old app reads (https://migrate-demo-cms.vercel.app).
