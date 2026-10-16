# vite-site-markless

This app is the Markless port of the Vite site in `../vite-site-old` (old source: read it, never edit it).
The old app is deployed at https://migrate-demo-old.vercel.app.

- Build with `npm run build`. A supervisor serves the build at http://127.0.0.1:4300 and restarts it after every build; do not start another server.
- The server has `CMS_URL` set to the same CMS the old app reads (https://migrate-demo-cms.vercel.app).
