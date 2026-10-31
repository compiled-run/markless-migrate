import { parentPort, workerData } from 'node:worker_threads';
import { workerMain, type RouteJob } from './trials.ts';

parentPort!.postMessage(await workerMain(workerData as { app: string; jobs: RouteJob[] }));
