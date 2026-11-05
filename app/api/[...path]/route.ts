import { handle } from '../../../lib/api.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const run = (request: Request) => handle(request, process.env);
export const GET = run;
export const POST = run;
export const DELETE = run;
