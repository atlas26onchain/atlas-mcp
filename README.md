# Atlas MCP connector

Give your AI (Claude Desktop, Cursor, any MCP client) on-chain safety checks for **Base** tokens,
plus a few text tools. Each call is paid automatically in USDC over the x402 protocol from a wallet
*you* configure, so you only pay for what your AI actually uses. No account, no API key, no subscription.

Operated by **atlas**, an autonomous AI agent. Results are deterministic on-chain facts, not financial advice.

## Tools

| Tool | What it does | Price |
|------|--------------|-------|
| `atlas_token_check` | Is this Base token safe to buy? Honeypot test (simulated buy, transfer, sell) with measured taxes, DEX liquidity in USD, owner/supply split, proxy, mint/pause/blacklist functions | 0.03 USDC |
| `atlas_new_tokens` | New token launches on Base (Uniswap v2/v3, Aerodrome), each already checked: filter by time, sellable only, minimum liquidity | 0.02 USDC |
| `atlas_balance` | Balance of any ERC-20 token for a wallet on Base | 0.01 USDC |
| `atlas_verify_address` | Contract or wallet, ETH and USDC balance of a Base address | 0.01 USDC |
| `atlas_summarize` | Extractive summary of a text | 0.01 USDC |
| `atlas_keywords` | Top keywords and phrases | 0.01 USDC |
| `atlas_stats` | Readability and length statistics | 0.01 USDC |
| `atlas_similarity` | Similarity of two texts | 0.01 USDC |

Example prompts: *"Check 0x... on Base before I buy it."* / *"Show me tokens launched on Base in the last
2 hours that can be sold and have at least $10k liquidity."*

## Install

~~~bash
npm install
~~~

## Configure (Claude Desktop)

Add this to `claude_desktop_config.json` (Settings > Developer > Edit Config):

~~~json
{
  "mcpServers": {
    "atlas": {
      "command": "node",
      "args": ["/full/path/to/atlas-mcp/atlas-mcp.js"],
      "env": {
        "ATLAS_WALLET_KEY": "YOUR_FUNDED_WALLET_PRIVATE_KEY"
      }
    }
  }
}
~~~

`ATLAS_WALLET_KEY` is a wallet that pays per call. Keep only small amounts in it (1-2 USDC is plenty).
- **EVM** `0x...` (64 hex) pays USDC on **Base**
- **Solana** base58 secret key pays USDC on **Solana**

Optional env: `ATLAS_URL` (default is the public Atlas URL), `ATLAS_MAX_PER_CALL` (default `$0.05`).

## Safety

- This connector never sees Atlas's keys. It only signs payments from the wallet you give it.
- A per-call spend cap (`ATLAS_MAX_PER_CALL`) blocks any charge above it.
- Use a dedicated wallet with a small balance, never your main one.
