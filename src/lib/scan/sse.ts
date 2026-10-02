/**
 * Server-Sent Events, both halves, pure.
 *
 * `encodeSse` writes one frame: `event: <name>\ndata: <json>\n\n` (JSON never
 * carries a raw newline, so one data line is always enough).
 *
 * `createSseParser` is the legacy scanner's block splitter (fork-app
 * static/js/api.js 166–217): chunks accumulate; a blank line ends a block;
 * partial data waits for the next chunk; `:` lines are comments (the 1 KB
 * padding and the 15 s pings) and are skipped; `data:` lines join with `\n`;
 * a block whose JSON does not parse is dropped, never thrown. An event name
 * outside the scan vocabulary is dropped too (forward compatibility — the
 * legacy client ignored unknown events the same way).
 */
import { SCAN_EVENT_NAMES, type ScanEvent, type ScanEventName } from "./events";

export function encodeSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const KNOWN = new Set<string>(SCAN_EVENT_NAMES);

function parseBlock(block: string): ScanEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const raw of block.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^\s/, ""));
  }
  if (dataLines.length === 0 || !KNOWN.has(event)) return null;
  try {
    const data: unknown = JSON.parse(dataLines.join("\n"));
    if (typeof data !== "object" || data === null) return null;
    return { event: event as ScanEventName, data } as ScanEvent;
  } catch {
    return null;
  }
}

export function createSseParser(): { push(chunk: string): ScanEvent[] } {
  let buffer = "";
  return {
    push(chunk: string): ScanEvent[] {
      buffer += chunk;
      const out: ScanEvent[] = [];
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (!block.trim()) continue;
        const parsed = parseBlock(block);
        if (parsed) out.push(parsed);
      }
      return out;
    },
  };
}
