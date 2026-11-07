# Acme Invoices

Acme Invoices is the dashboard our finance team uses to send invoices and track payments. It is built with [Next.js](https://nextjs.org) and Tailwind CSS, and was bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

![Dashboard screenshot](./docs/screenshot.png)

## Tech stack

- [Next.js 15](https://nextjs.org) (App Router)
- React 19
- React Hook Form for the invoice editor
- Tailwind CSS
- Prisma and PostgreSQL
- Auth.js for sign-in

## Getting started

You need Node 20+ and a PostgreSQL database. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL`.

```bash
npm install
npx prisma migrate dev
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Scripts

- `npm run build` builds the app for production.
- `npm start` serves the production build.
- `npm run lint` runs ESLint.
- `npm test` runs the unit tests with Jest.
- `npm run storybook` opens the component library.

## Environment variables

| Name | What it is |
| --- | --- |
| `DATABASE_URL` | The PostgreSQL connection string |
| `AUTH_SECRET` | The secret Auth.js signs sessions with |

## Deploy on Vercel

Push to `main` and Vercel deploys it. Preview deployments are made for every pull request.

## License

MIT, see [LICENSE](./LICENSE).
