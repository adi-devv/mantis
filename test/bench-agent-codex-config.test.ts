import { describe, expect, it } from 'vitest';
import { codexArgs, rawMcpToolName } from '../bench/agent/codex-config.js';

describe('Codex benchmark isolation config', () => {
  it('maps only the selected MCP approach tools and turns off other tool families', () => {
    const args = codexArgs({
      model: 'gpt-6.1-sol', reasoning: 'medium', prompt: 'Open the page and answer.', cwd: 'C:/temp/run',
      server: {
        name: 'playwright', command: 'node.exe', args: ['C:/repo/bench/agent/bridge.mjs', '1234'],
        enabledTools: ['browser_navigate', 'browser_click'], disabledTools: ['browser_evaluate'],
      },
    });
    expect(args.slice(0, 9)).toEqual([
      'exec', '--json', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '-s', 'read-only', '-m',
    ]);
    expect(args).toContain('gpt-6.1-sol');
    expect(args).toContain('approval_policy="never"');
    expect(args).toContain('model_reasoning_effort="medium"');
    expect(args).toContain('mcp_servers.playwright.command="node.exe"');
    expect(args).toContain('mcp_servers.playwright.args=["C:/repo/bench/agent/bridge.mjs","1234"]');
    expect(args).toContain('mcp_servers.playwright.required=true');
    expect(args).toContain('mcp_servers.playwright.startup_timeout_sec=60');
    expect(args).toContain('mcp_servers.playwright.default_tools_approval_mode="approve"');
    expect(args).toContain('mcp_servers.playwright.enabled_tools=["browser_navigate","browser_click"]');
    expect(args).toContain('mcp_servers.playwright.disabled_tools=["browser_evaluate"]');
    for (const disabled of [
      'features.shell_tool=false', 'features.apps=false', 'features.plugins=false', 'features.browser_use=false',
      'features.computer_use=false', 'features.in_app_browser=false', 'features.view_image=false', 'web_search="disabled"',
    ]) expect(args).toContain(disabled);
    expect(args).toContain('features.code_mode_host=true');
    expect(args.at(-1)).toBe('Open the page and answer.');
  });

  it('maps approach-prefixed Claude identifiers to Codex raw MCP names', () => {
    expect(rawMcpToolName('playwright', 'mcp__playwright__browser_navigate')).toBe('browser_navigate');
    expect(rawMcpToolName('playwright', 'mcp__other__browser_navigate')).toBeNull();
    expect(rawMcpToolName('mantis', 'mcp__mantis')).toBeNull();
  });
});
