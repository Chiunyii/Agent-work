// Client-side tools the agent can call. Every path is confined to the workspace folder.
import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { exec } from 'node:child_process';

const MAX_OUTPUT = 20000; // characters of tool output sent back to the model
const COMMAND_TIMEOUT_MS = 120000;

export const TOOL_DEFINITIONS = [
  {
    name: 'list_files',
    description:
      'List files and folders in the workspace. Use it to explore before reading or editing. ' +
      'Paths are relative to the workspace root; "." is the root.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Folder to list, relative to the workspace. Defaults to ".".' },
      },
      required: [],
    },
  },
  {
    name: 'read_file',
    description: 'Read a UTF-8 text file from the workspace. Long files are cut off after about 20,000 characters.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the workspace.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Create or overwrite a text file in the workspace with the full new content. ' +
      'Parent folders are created as needed.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the workspace.' },
        content: { type: 'string', description: 'The complete file content.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'run_command',
    description:
      'Run a shell command inside the workspace folder and return its exit code, stdout and stderr. ' +
      'Use it to run programs, tests or scripts. Commands time out after 120 seconds. ' +
      'The user may be asked to approve each command, and may decline.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to run.' },
      },
      required: ['command'],
    },
  },
];

// Tools that need the user's OK before they run (unless auto-approve is on).
export const NEEDS_APPROVAL = new Set(['run_command']);

// With eager input streaming the API no longer validates tool input, so check it here.
export function validateInput(name, input) {
  const def = TOOL_DEFINITIONS.find((t) => t.name === name);
  if (!def) return `unknown tool: ${name}`;
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return 'input must be an object';
  for (const key of def.input_schema.required) {
    if (!(key in input)) return `missing required field: ${key}`;
  }
  for (const [key, value] of Object.entries(input)) {
    const prop = def.input_schema.properties[key];
    if (!prop) return `unexpected field: ${key}`;
    if (typeof value !== prop.type) return `field ${key} must be a ${prop.type}`;
  }
  return null;
}

// Resolve a model-supplied path and refuse anything that escapes the workspace,
// including through symlinks.
async function resolveInside(root, relPath = '.') {
  const realRoot = await fs.realpath(root);
  const target = nodePath.resolve(realRoot, relPath);
  let probe = target;
  // Walk up to the nearest existing ancestor so new files can be checked too.
  while (true) {
    try {
      probe = await fs.realpath(probe);
      break;
    } catch {
      const parent = nodePath.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
  }
  for (const p of [target, probe]) {
    const rel = nodePath.relative(realRoot, p);
    if (rel === '..' || rel.startsWith('..' + nodePath.sep) || nodePath.isAbsolute(rel)) {
      throw new Error(`path is outside the workspace: ${relPath}`);
    }
  }
  return target;
}

function clip(text) {
  if (text.length <= MAX_OUTPUT) return text;
  return text.slice(0, MAX_OUTPUT) + `\n…[cut off: ${text.length - MAX_OUTPUT} more characters]`;
}

export async function runTool(name, input, { workspace, signal }) {
  switch (name) {
    case 'list_files': {
      const dir = await resolveInside(workspace, input.path ?? '.');
      const entries = await fs.readdir(dir, { withFileTypes: true });
      if (entries.length === 0) return '(empty folder)';
      return entries
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
        .join('\n');
    }
    case 'read_file': {
      const file = await resolveInside(workspace, input.path);
      return clip(await fs.readFile(file, 'utf8'));
    }
    case 'write_file': {
      const file = await resolveInside(workspace, input.path);
      await fs.mkdir(nodePath.dirname(file), { recursive: true });
      await fs.writeFile(file, input.content, 'utf8');
      return `wrote ${Buffer.byteLength(input.content)} bytes to ${input.path}`;
    }
    case 'run_command': {
      const cwd = await fs.realpath(workspace);
      return await new Promise((resolve) => {
        exec(
          input.command,
          { cwd, timeout: COMMAND_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, signal },
          (error, stdout, stderr) => {
            const code = error ? (error.code ?? 1) : 0;
            const note = error?.killed ? ' (killed: timed out or stopped)' : '';
            resolve(clip(`exit code: ${code}${note}\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`));
          },
        );
      });
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
