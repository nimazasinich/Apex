import { existsSync, readFileSync } from 'node:fs';
import { resolvePrivateConfigPath, writePrivateJsonFileSync } from './privateConfigFile';
import { normalizeProxyConfig } from './proxyConfig';
import { applyRuntimeProxyConfig, blockInvalidProxyConfig, getRuntimeProxyConfig } from './proxyFetch';

const configPath = resolvePrivateConfigPath('proxy.config.json');
export function loadProxySettings(): void {
  if (!existsSync(configPath)) return;
  try { applyRuntimeProxyConfig(JSON.parse(readFileSync(configPath, 'utf8'))); }
  catch { // Invalid saved routing must not silently become a direct connection.
    blockInvalidProxyConfig();
    console.error('[Proxy Settings] Saved configuration is invalid; correct it in Settings before using providers.');
  }
}
export function saveProxySettings(value: unknown): void {
  const config = normalizeProxyConfig(value);
  writePrivateJsonFileSync(configPath, config); // Persist before applying; a failed write is not success.
  applyRuntimeProxyConfig(config);
}
export { getRuntimeProxyConfig };
