/**
 * MCP Server settings API.
 *
 * Manages the opt-in MCP server feature: enable/disable toggle with
 * automatic bearer token generation and revocation.
 */

import { Hono } from 'hono';
import { query } from '../../lib/db';
import { generateToken, revokeToken } from '../../lib/auth';

const mcpSettings = new Hono();

// --- Helpers ---

async function getSetting(key: string): Promise<string | null> {
  const result = await query(
    `SELECT value FROM settings WHERE key = $1`,
    [key],
  );
  return result.rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value],
  );
}

async function deleteSetting(key: string): Promise<void> {
  await query(`DELETE FROM settings WHERE key = $1`, [key]);
}

// --- Routes ---

/**
 * GET /api/mcp/status
 * Returns whether MCP is enabled and the token hint if so.
 */
mcpSettings.get('/status', async (c) => {
  const enabled = (await getSetting('mcp_enabled')) === 'true';

  if (!enabled) {
    return c.json({ enabled: false });
  }

  const tokenIdStr = await getSetting('mcp_token_id');
  const tokenId = tokenIdStr ? parseInt(tokenIdStr, 10) : null;

  let tokenHint: string | undefined;
  if (tokenId) {
    const result = await query(
      `SELECT hint FROM auth_tokens WHERE id = $1 AND active = true`,
      [tokenId],
    );
    tokenHint = result.rows[0]?.hint;
  }

  return c.json({ enabled: true, tokenHint, tokenId });
});

/**
 * POST /api/mcp/enable
 * Enables the MCP server and generates a dedicated bearer token.
 * Returns the raw token (shown once).
 */
mcpSettings.post('/enable', async (c) => {
  const alreadyEnabled = (await getSetting('mcp_enabled')) === 'true';
  if (alreadyEnabled) {
    return c.json({ error: 'MCP server is already enabled' }, 400);
  }

  // Generate a dedicated MCP token
  const token = await generateToken('MCP Server');

  // Look up the token ID (most recent token with this name)
  const result = await query(
    `SELECT id FROM auth_tokens WHERE name = $1 AND active = true ORDER BY created_at DESC LIMIT 1`,
    ['MCP Server'],
  );
  const tokenId = result.rows[0]?.id;

  // Store settings
  await setSetting('mcp_enabled', 'true');
  if (tokenId) {
    await setSetting('mcp_token_id', String(tokenId));
  }

  return c.json({ success: true, token });
});

/**
 * POST /api/mcp/disable
 * Disables the MCP server and revokes the dedicated token.
 */
mcpSettings.post('/disable', async (c) => {
  const tokenIdStr = await getSetting('mcp_token_id');
  if (tokenIdStr) {
    await revokeToken(parseInt(tokenIdStr, 10));
  }

  await deleteSetting('mcp_enabled');
  await deleteSetting('mcp_token_id');

  return c.json({ success: true });
});

export { mcpSettings };
