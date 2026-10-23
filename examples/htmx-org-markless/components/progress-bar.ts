// The progress-bar demo's fake server and request log, as htmx.org's demo page shows them (its sinon server, the page's
// own job manager and templates, and demo.js's activity entries).
export interface Job {
  readonly complete: boolean;
  readonly percentComplete: number;
}

export interface Entry {
  readonly id: string;
  readonly label: string;
  readonly method: string;
  readonly url: string;
  readonly params: string;
  readonly headers: string;
  readonly code: string;
}

// The page's jobManager: start() begins at 0; each currentProcess() (GET /job and GET /job/progress) adds up to 32.
export const startJob = (): Job => ({ complete: false, percentComplete: 0 });

export function advance(job: Job): Job {
  const percentComplete = job.percentComplete + Math.min(100, Math.floor(33 * Math.random()));
  return { complete: percentComplete >= 100, percentComplete };
}

// The page's templates.
function startButton(message: string): string {
  return `<div hx-target="this" hx-swap="outerHTML">
  <h3>${message}</h3>
  <button class="btn primary" hx-post="/start">
            Start Job
  </button>
</div>`;
}

export function jobProgressTemplate(job: Job): string {
  return `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${job.percentComplete}" aria-labelledby="pblabel">
      <div id="pb" class="progress-bar" style="width:${job.percentComplete}%">
    </div>
  </div>`;
}

function restartButton(job: Job): string {
  if (!job.complete) return "";
  return `
<button id="restart-btn" class="btn primary" hx-post="/start" classes="add show:600ms">
  Restart Job
</button>`;
}

export function jobStatusTemplate(job: Job): string {
  return `<div hx-trigger="done" hx-get="/job" hx-swap="outerHTML" hx-target="this">
  <h3 role="status" id="pblabel" tabindex="-1" autofocus>${job.complete ? "Complete" : "Running"}</h3>

  <div
    hx-get="/job/progress"
    hx-trigger="${job.complete ? "none" : "every 600ms"}"
    hx-target="this"
    hx-swap="innerHTML">
    ${jobProgressTemplate(job)}
  </div>
  ${restartButton(job)}`;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");
const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', nbsp: " " };
// What the browser makes of escaped text cut short: whole entities, and lt, gt and amp without their semicolon at the cut.
const decodeHtml = (html: string) =>
  html.replace(/&(lt|gt|amp|quot|nbsp)(;|$)/g, (whole, name: string, end: string) =>
    end || name !== "quot" ? ENTITIES[name]! : whole,
  );

// demo.js keeps the first 750 characters of an entry's HTML and adds "..."; returns the code the entry then shows.
function shownCode(before: string, code: string, after: string): string {
  const escaped = escapeHtml(code);
  if (before.length + escaped.length + after.length <= 750) return code;
  return `${decodeHtml(escaped.slice(0, Math.max(0, 750 - before.length)))}...`;
}

export const INITIAL_CODE = shownCode(
  `<span class="activity initial">
  <b>HTML</b>
  <pre class="language-html"><code class="language-html">`,
  startButton("Start Progress"),
  "</code></pre>\n</span>",
);

// demo.js's entry for each answer htmx swaps in; headers are the answer's hx- headers (HX-Trigger: done at the end).
export function responseEntry(n: number, method: string, url: string, headers: Record<string, string>, response: string): Entry {
  const json = JSON.stringify(headers);
  const before = `<span class="activity response">
  <div>
  <b>${method}</b> ${url}
  </div>
  <div>
    parameters: {}
  </div>
  <div>
    headers: ${json}
  </div>
  <div>
  <b>Response</b>
  <pre class="language-html"><code class="language-html">`;
  return {
    id: `req-${n}`,
    label: `${method} ${url}`,
    method,
    url,
    params: "{}",
    headers: json,
    code: shownCode(before, response, "</code> </pre>\n  </div>\n</span>"),
  };
}
