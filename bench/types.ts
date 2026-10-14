import type { Cost } from './tokens.js';

/** An element described the way a person would: ARIA role(s) plus accessible name. */
export interface Target {
  /** Acceptable roles (tools label the same control differently, e.g. textbox vs searchbox). */
  roles: string[];
  /** Case-insensitive substring, or a RegExp. */
  name: string | RegExp;
  /** Which match to use, 0-based, in document order. Default 0. */
  nth?: number;
}

export type Step =
  | { kind: 'open'; url: string }
  /** The agent needs the current page content; `expect` must appear in what it gets. */
  | { kind: 'read'; expect?: RegExp }
  | { kind: 'click'; target: Target }
  | { kind: 'type'; target: Target; text: string; submit?: boolean }
  | { kind: 'select'; target: Target; option: string }
  | { kind: 'press'; key: string }
  | { kind: 'back' };

export interface Task {
  id: string;
  title: string;
  site: 'live' | 'local';
  steps: Step[];
}

export interface StepResult {
  n: number;
  label: string;
  /** null = not applicable (e.g. content check for the screenshot baseline). */
  ok: boolean | null;
  /** Why it failed / what happened, short. */
  note: string;
  /** Text (or image) the agent receives from the action call itself. */
  action: Cost;
  /** Extra observation call needed before/after (read / snapshot / screenshot). */
  observe: Cost;
  ms: number;
}

export interface TaskRun {
  taskId: string;
  tool: string;
  steps: StepResult[];
  completed: boolean;
}

export interface Elem {
  role: string;
  name: string;
  /** Tool-specific id: Mantis number, Playwright MCP ref. */
  handle: string;
}

export interface Reply {
  text: string;
  isError: boolean;
}
