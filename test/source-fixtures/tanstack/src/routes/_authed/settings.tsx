import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/settings')({ component: () => <h1>Settings</h1> });
