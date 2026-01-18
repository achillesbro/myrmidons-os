# Myrmidons OS

A decentralized operating system built with Next.js, TypeScript, and Tailwind CSS.

## Getting Started

Install dependencies:

```bash
pnpm install
```

Run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Vault Configuration

The USDT0 Morpho Vault is deployed at:
- **Address**: `0x4DC97f968B0Ba4Edd32D1b9B8Aaf54776c134d42`
- **Chain**: HyperEVM (Chain ID: 999)

API endpoints can be tested with:
```bash
# Vault metadata
curl "http://localhost:3000/api/morpho/vault/metadata?address=0x4DC97f968B0Ba4Edd32D1b9B8Aaf54776c134d42&chainId=999"

# Vault allocations
curl "http://localhost:3000/api/morpho/vault/allocations?address=0x4DC97f968B0Ba4Edd32D1b9B8Aaf54776c134d42&chainId=999"

# Vault APY
curl "http://localhost:3000/api/morpho/vault/apy?address=0x4DC97f968B0Ba4Edd32D1b9B8Aaf54776c134d42&chainId=999"
```

## Environment Variables

### Log Streaming

**HEGEMON Bot (Reallocator):**
- `LOG_STREAM_URL` - Upstream SSE endpoint for HEGEMON logs
- `LOG_STREAM_TOKEN` - Bearer token for authentication (required)

**EREBUS Bot (Liquidation):**
- `EREBUS_LOG_STREAM_URL` - Upstream SSE endpoint for EREBUS logs (defaults to `https://logs.myrmidons-strategies.com/erebus/sse`)
- `EREBUS_LOG_STREAM_TOKEN` - Bearer token for authentication (optional)
