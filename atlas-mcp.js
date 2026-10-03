#!/usr/bin/env node
// Atlas MCP connector — lets any MCP client (Claude Desktop, Cursor, …) call the
// Atlas on-chain + text API as normal tools. Each call is paid in USDC over x402
// from a wallet YOU configure here, so Atlas earns and you get the result.
//
// Configure in your MCP client with env vars:
//   ATLAS_WALLET_KEY   (required) a funded wallet private key that pays per call:
//                        EVM: 0x-hex (pays USDC on Base)   Solana: base58 secret key (pays USDC on Solana)
//   ATLAS_URL          (optional) default https://backpedal-discourse-easeful.ngrok-free.dev
//   ATLAS_MAX_PER_CALL (optional) spend cap per call, default "$0.05"
//
// Keep only small amounts in that wallet. This process never sees Atlas's keys.
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const ATLAS_URL = (process.env.ATLAS_URL || 'https://backpedal-discourse-easeful.ngrok-free.dev').replace(/\/$/, '');
const KEY = process.env.ATLAS_WALLET_KEY || '';
const MAX = process.env.ATLAS_MAX_PER_CALL || '$0.05';

async function makePaidFetch() {
  const { wrapFetchWithPayment } = require('@x402/fetch');
  const { x402Client } = require('@x402/core/client');
  let scheme;
  if (/^0x[0-9a-fA-F]{64}$/.test(KEY)) {
    const { privateKeyToAccount } = require('viem/accounts');
    const { ExactEvmScheme } = require('@x402/evm');
    scheme = { network: 'eip155:8453', client: new ExactEvmScheme(privateKeyToAccount(KEY)) };
  } else if (KEY) {
    const { createKeyPairSignerFromBytes } = require('@solana/kit');
    const { ExactSvmScheme } = require('@x402/svm/exact/client');
    const bs = require('@scure/base').base58;
    const signer = await createKeyPairSignerFromBytes(bs.decode(KEY));
    scheme = { network: 'solana:*', client: new ExactSvmScheme(signer) };
  } else {
    throw new Error('ATLAS_WALLET_KEY is not set.');
  }
  const client = x402Client.fromConfig({ schemes: [scheme], spendControls: { maxAmountPerPayment: MAX } });
  return wrapFetchWithPayment(fetch, client);
}

let paidFetchPromise;
async function call(path, body) {
  paidFetchPromise = paidFetchPromise || makePaidFetch();
  const payFetch = await paidFetchPromise;
  const res = await payFetch(`${ATLAS_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status !== 200) throw new Error(`Atlas ${path} HTTP ${res.status}: ${text.slice(0, 200)}`);
  let tx = '';
  const h = res.headers.get('payment-response');
  if (h) { try { tx = JSON.parse(Buffer.from(h, 'base64').toString()).transaction || ''; } catch {} }
  return { text, tx };
}

function paid(price, path) {
  return async (args) => {
    const { text, tx } = await call(path, args);
    const suffix = tx ? `\n\n(paid ${price} USDC, tx ${tx})` : '';
    return { content: [{ type: 'text', text: text + suffix }] };
  };
}

const ADDR = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'a 0x Base address');
const server = new McpServer({ name: 'atlas', version: '1.1.0' });

// --- On-chain (Base) ---
server.tool('atlas_token_check',
  'Safety check for an ERC-20 token on Base before buying it: honeypot test (simulated buy, transfer and sell with measured buy/sell/transfer tax), DEX liquidity in USD on Uniswap and Aerodrome, owner and supply split, upgradeable proxy, mint/pause/blacklist functions, plus a one-line summary. Deterministic on-chain facts, not financial advice. Costs 0.03 USDC.',
  { address: ADDR.describe('Token contract address on Base') },
  paid('0.03', '/token-check'));

server.tool('atlas_new_tokens',
  'Fresh token launches on Base with automatic safety checks: new pools on Uniswap v2/v3 and Aerodrome paired with WETH or USDC, each token checked about 3 minutes after launch (honeypot/tax simulation, liquidity, privileged functions). Filter by time window, sellable only and minimum liquidity. Not financial advice. Costs 0.02 USDC.',
  {
    minutes: z.number().int().min(1).max(1440).optional().describe('Look-back window in minutes (default 60)'),
    only_sellable: z.boolean().optional().describe('Only tokens whose simulated sell succeeded'),
    min_liquidity_usd: z.number().min(0).optional().describe('Minimum WETH/USDC liquidity in USD'),
    limit: z.number().int().min(1).max(200).optional().describe('Max results (default 50)'),
  },
  paid('0.02', '/new-tokens'));

server.tool('atlas_balance',
  'Balance of any ERC-20 token held by a wallet on Base, with the token name, symbol and decimals. Live from Base. Costs 0.01 USDC.',
  { owner: ADDR.describe('Wallet address'), token: ADDR.describe('ERC-20 token contract address') },
  paid('0.01', '/balance'));

server.tool('atlas_verify_address',
  'On-chain facts for a Base address: contract or wallet, ETH and USDC balance, read live from Base. Costs 0.01 USDC.',
  { address: ADDR },
  paid('0.01', '/verify'));

// --- Text ---
server.tool('atlas_summarize', 'Extractive summary of an English text (most important sentences). Costs 0.01 USDC.',
  { text: z.string().describe('Text to summarize'), ratio: z.number().min(0.1).max(0.9).optional().describe('Fraction of sentences to keep (default 0.3)') },
  paid('0.01', '/summarize'));

server.tool('atlas_keywords', 'Top keywords and key phrases of a text. Costs 0.01 USDC.',
  { text: z.string(), limit: z.number().int().positive().optional().describe('Max keywords (default 10)') },
  paid('0.01', '/keywords'));

server.tool('atlas_stats', 'Readability and length statistics of a text (words, sentences, Flesch reading ease). Costs 0.01 USDC.',
  { text: z.string() },
  paid('0.01', '/stats'));

server.tool('atlas_similarity', 'Similarity of two texts (cosine, Jaccard, Levenshtein). Costs 0.01 USDC.',
  { a: z.string(), b: z.string() },
  paid('0.01', '/similarity'));

(async () => {
  await server.connect(new StdioServerTransport());
  process.stderr.write(`atlas-mcp 1.1.0 connected. Target ${ATLAS_URL}. Wallet ${KEY ? 'set' : 'MISSING'}. Cap ${MAX}/call.\n`);
})().catch((e) => { process.stderr.write('atlas-mcp fatal: ' + e.message + '\n'); process.exit(1); });
