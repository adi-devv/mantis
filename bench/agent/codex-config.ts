/** Isolated Codex CLI invocation for the real-agent benchmark. */
export interface CodexServerConfig {
  name: string;
  command: string;
  args: string[];
  enabledTools?: string[];
  disabledTools?: string[];
}

export interface CodexInvocation {
  model: string;
  reasoning: string;
  prompt: string;
  cwd: string;
  server: CodexServerConfig;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

/** Convert existing Claude MCP tool identifiers to Codex MCP's raw tool names. */
export function rawMcpToolName(server: string, identifier: string): string | null {
  const prefix = `mcp__${server}__`;
  if (identifier === `mcp__${server}`) return null;
  return identifier.startsWith(prefix) ? identifier.slice(prefix.length) : null;
}

export function codexArgs(input: CodexInvocation): string[] {
  const { server } = input;
  const key = `mcp_servers.${server.name}`;
  const args = [
    'exec', '--json', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules',
    '-s', 'read-only', '-m', input.model,
    '-c', 'approval_policy="never"', '-c', `model_reasoning_effort=${tomlString(input.reasoning)}`,
    '--cd', input.cwd,
    '-c', `${key}.command=${tomlString(server.command)}`,
    '-c', `${key}.args=${JSON.stringify(server.args)}`,
    '-c', `${key}.required=true`,
    '-c', `${key}.startup_timeout_sec=60`,
    '-c', `${key}.default_tools_approval_mode="approve"`,
    '-c', 'project_doc_max_bytes=0',
    '-c', 'suppress_unstable_features_warning=true',
    // Disable every non-MCP tool family so only the single warmed browser server is usable.
    '-c', 'features.shell_tool=false',
    '-c', 'features.apps=false',
    '-c', 'features.plugins=false',
    '-c', 'features.multi_agent=false',
    '-c', 'features.goals=false',
    '-c', 'features.sleep_tool=false',
    '-c', 'features.code_mode_host=true',
    '-c', 'features.shell_snapshot=false',
    '-c', 'features.skip_host_skill_discovery=true',
    '-c', 'features.skill_search=false',
    '-c', 'features.view_image=false',
    '-c', 'features.browser_use=false',
    '-c', 'features.browser_use_external=false',
    '-c', 'features.computer_use=false',
    '-c', 'features.in_app_browser=false',
    '-c', 'web_search="disabled"',
  ];
  if (server.enabledTools?.length) args.push('-c', `${key}.enabled_tools=${JSON.stringify(server.enabledTools)}`);
  if (server.disabledTools?.length) args.push('-c', `${key}.disabled_tools=${JSON.stringify(server.disabledTools)}`);
  args.push(input.prompt);
  return args;
}
