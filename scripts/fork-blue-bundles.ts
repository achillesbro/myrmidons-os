// Fork check for the Morpho Blue write path (lib/web3/blue.ts → SDK v6 →
// BlueBundlesV1). Runs the same rules the MNEMON panel and the terminal CLI
// use — buildBlueAction / runBlueAction / safeMaxBorrow /
// safeWithdrawableCollateral / shouldCloseAll — against an anvil fork of a
// wallet chain and asserts the position closes to zero. On a chain with
// Permit2 (Base, mainnet…) this exercises the signature path; on HyperEVM /
// Katana the classic-approval path.
//
//   M="$(node -e 'const {generateMnemonic,english}=require("viem/accounts");console.log(generateMnemonic(english))')"
//   anvil --fork-url <chain rpc> --chain-id <id> --port 8545 --mnemonic "$M"
//   MNEMONIC="$M" CHAIN=<id> pnpm dlx tsx scripts/fork-blue-bundles.ts <marketId>
//   (CHAIN defaults to 999 with the deepest HyperEVM market)
//
// The seam sends txs and signs typed data BY ADDRESS (json-rpc account, as
// wagmi does in the app), so anvil must hold the key: pass the same
// mnemonic to both. Use a FRESH one, never anvil's default: its #0 public
// key carries an EIP-7702 delegation on Base mainnet, so Permit2 takes the
// ERC-1271 path on it and the delegate's fallback rejects the transfer.
//
// Funding: gas via anvil_setBalance (wrapped when the collateral is the
// chain's wNative), tokens transferred out of the Morpho Blue contract
// (impersonated).
//
// Arc (5042) cannot be forked: its native-USDC ERC-20 (0x3600…) delegates
// to a precompile at 0x1800… that anvil does not implement, so every USDC
// transfer reverts on the fork (TRANSFER_FROM_FAILED) before our code runs.
import assert from "node:assert/strict";
import { createPublicClient, createWalletClient, encodeFunctionData, http, parseAbi, type Address, type Hex, type PublicClient } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { addressesRegistry } from "@morpho-org/morpho-sdk/blue/addresses";
import { fetchMarketParams } from "@morpho-org/morpho-sdk/blue/fetch";
import type { MarketId } from "@morpho-org/morpho-sdk/blue/types";
import { CHAINS } from "../lib/web3/chains";
import { ERC20_ABI } from "../lib/web3/abis/erc20";
import {
  accruedDebt,
  blueActionsSupported,
  blueMarket,
  blueSignaturesSupported,
  buildBlueAction,
  projectPosition,
  runBlueAction,
  safeMaxBorrow,
  safeWithdrawableCollateral,
  shouldCloseAll,
  type BlueMode,
} from "../lib/web3/blue";

const RPC = "http://127.0.0.1:8545";
const CHAIN_ID = Number(process.env.CHAIN ?? 999);
// Default: WHYPE / USDC @77% — the deepest investable HyperEVM market (MNEMON, 2026-09-25).
const MARKET_ID = (process.argv[2] ?? (CHAIN_ID === 999 ? "0xd7d38220652d19c87099c3b23de9a70a1893620a050c635d1a94bd947c9c59a8" : undefined)) as MarketId;
const MNEMONIC = process.env.MNEMONIC ?? assert.fail("set MNEMONIC to the phrase anvil was started with (see header)");

const chainDef = CHAINS.find((c) => c.id === CHAIN_ID) ?? assert.fail(`chain ${CHAIN_ID} is not a wallet chain (lib/web3/chains.ts)`);
assert.ok(MARKET_ID, "pass a market id for a non-HyperEVM chain");
const chain = { ...chainDef, rpcUrls: { default: { http: [RPC] } } };
// Chain-specific formatters (OP-stack tx types on Base) widen the client type; the seam takes plain viem clients.
const publicClient = createPublicClient({ chain, transport: http(RPC) }) as unknown as PublicClient;
const user = mnemonicToAccount(MNEMONIC).address; // anvil #0 of that mnemonic holds the key
const walletClient = createWalletClient({ account: user, chain, transport: http(RPC) });
const reg = addressesRegistry[CHAIN_ID];
const morpho = reg.blue as Address;
const bundles = reg.bundles!.blueBundlesV1 as Address;
const WETH_ABI = parseAbi(["function deposit() payable"]);
const TRANSFER_ABI = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

const rpc = (method: string, params: unknown[]) => publicClient.request({ method, params } as never);
const balance = (token: Address) => publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [user] }) as Promise<bigint>;

async function fundFromMorpho(token: Address, amount: bigint) {
  await rpc("anvil_impersonateAccount", [morpho]);
  await rpc("anvil_setBalance", [morpho, "0x" + (10n ** 20n).toString(16)]);
  const hash = (await rpc("eth_sendTransaction", [
    { from: morpho, to: token, data: encodeFunctionData({ abi: TRANSFER_ABI, functionName: "transfer", args: [user, amount] }) },
  ])) as Hex;
  await publicClient.waitForTransactionReceipt({ hash });
  await rpc("anvil_stopImpersonatingAccount", [morpho]);
}

async function main() {
  assert.equal(await publicClient.getChainId(), CHAIN_ID, `anvil must fork chain ${CHAIN_ID} with --chain-id ${CHAIN_ID}`);
  // Fresh fork state every run: the previous run's position must not leak in.
  await rpc("anvil_reset", [{ forking: { jsonRpcUrl: chainDef.rpcUrls.default.http[0] } }]);
  assert.ok(blueActionsSupported(CHAIN_ID), `BlueBundlesV1 registered on ${CHAIN_ID}`);
  console.log(`chain ${chainDef.name} (${CHAIN_ID})  signatures ${blueSignaturesSupported(CHAIN_ID) ? "ON (Permit2)" : "OFF (classic approvals)"}`);

  const params = await fetchMarketParams(MARKET_ID, publicClient);
  const market = blueMarket(publicClient, params, CHAIN_ID);
  const loanDec = Number(await publicClient.readContract({ address: params.loanToken, abi: ERC20_ABI, functionName: "decimals" }));
  const collDec = Number(await publicClient.readContract({ address: params.collateralToken, abi: ERC20_ABI, functionName: "decimals" }));
  const L = (n: number) => BigInt(n) * 10n ** BigInt(loanDec);
  const C = (n: number) => BigInt(n) * 10n ** BigInt(collDec);

  // ── fund ──
  await rpc("anvil_setBalance", [user, "0x" + (10n ** 24n).toString(16)]);
  await fundFromMorpho(params.loanToken, L(10_000));
  if (reg.wNative && params.collateralToken.toLowerCase() === reg.wNative.toLowerCase()) {
    const h = await walletClient.writeContract({ address: params.collateralToken, abi: WETH_ABI, functionName: "deposit", value: C(200) });
    await publicClient.waitForTransactionReceipt({ hash: h });
  } else {
    await fundFromMorpho(params.collateralToken, C(200));
  }
  const loan0 = await balance(params.loanToken);
  const coll0 = await balance(params.collateralToken);
  console.log(`funded  loan ${loan0}  coll ${coll0}`);

  const state = async () => {
    const [md, pos] = await Promise.all([market.getMarketData(), market.getPositionData(user)]);
    return { md, pos, wallet: await balance(params.loanToken), collWallet: await balance(params.collateralToken) };
  };

  const step = async (mode: BlueMode, loan: bigint, coll: bigint, closeAll = false) => {
    const { md, pos } = await state();
    const built = buildBlueAction(market, { mode, user, pos, marketData: md, loan, coll, closeAll, loanSymbol: "LOAN", collateralSymbol: "COLL" });
    assert.ok(built, `${mode}: nothing to do`);
    const tx = built.action.buildTx();
    assert.equal(tx.to.toLowerCase(), bundles.toLowerCase(), `${built.label}: tx must target BlueBundlesV1`);
    const hash = await runBlueAction(built.action, { account: user, walletClient, publicClient, log: (l) => console.log(`   ${l}`) });
    console.log(`${built.label.padEnd(18)} ${tx.action.type.padEnd(28)} ${hash}`);
    return state();
  };

  // 1. lend 1,000 → 2. unlend 400 (assets) → 3. unlend rest (shares)
  let s = await step("lend", L(1_000), 0n);
  assert.ok(s.pos.supplyAssets >= L(1_000) - 1n, "supplied");
  s = await step("withdraw", L(400), 0n);
  const closeSupply = shouldCloseAll("withdraw", { loan: s.pos.supplyAssets, supplied: s.pos.supplyAssets, debtNow: null, wallet: null });
  assert.ok(closeSupply, "MAX unlend closes by shares");
  s = await step("withdraw", s.pos.supplyAssets, 0n, true);
  assert.equal(s.pos.supplyShares, 0n, "supply fully closed");

  // 4. supply 50 collateral + borrow the safe max (atomic pair)
  const collBefore = s.pos.collateral;
  const borrowAmt = safeMaxBorrow(s.pos, s.md, C(50));
  assert.ok(borrowAmt > 0n, "safe max borrow > 0");
  s = await step("borrow", borrowAmt, C(50));
  assert.equal(s.pos.collateral, collBefore + C(50), "collateral posted");
  assert.ok(s.pos.borrowAssets >= borrowAmt - 1n, "borrowed");
  const debtLeft = accruedDebt(s.pos, s.md);
  console.log(`   position: coll ${s.pos.collateral}  debt ${debtLeft}  hf ${s.pos.healthFactor}`);

  // 5. repay a third (assets) + withdraw what stays safe (atomic pair)
  const partial = debtLeft / 3n;
  const after = projectPosition(s.pos, s.md, { debtDelta: -partial });
  const freeColl = safeWithdrawableCollateral(after);
  assert.ok(freeColl > 0n, "some collateral is withdrawable after a partial repay");
  const collPosted = s.pos.collateral;
  s = await step("repay", partial, freeColl);
  assert.equal(s.pos.collateral, collPosted - freeColl, "partial collateral withdrawn");

  // 6. repay all (shares) + withdraw every wei of collateral
  const debtNow = accruedDebt(s.pos, s.md);
  const closeDebt = shouldCloseAll("repay", { loan: debtNow, supplied: null, debtNow, wallet: s.wallet });
  assert.ok(closeDebt, "MAX repay closes by shares");
  const allColl = safeWithdrawableCollateral(projectPosition(s.pos, s.md, { closeDebt: true }));
  assert.equal(allColl, s.pos.collateral, "closing the debt frees all collateral");
  s = await step("repay", debtNow, allColl, true);
  assert.equal(s.pos.borrowShares, 0n, "debt closed");
  assert.equal(s.pos.collateral, 0n, "collateral fully withdrawn");

  const loan1 = await balance(params.loanToken);
  const coll1 = await balance(params.collateralToken);
  console.log(`done    loan ${loan1} (paid ${loan0 - loan1} interest)  coll ${coll1}`);
  assert.equal(coll1, coll0, "collateral round-trips exactly");
  assert.ok(loan0 - loan1 < L(1), "interest paid is dust");
  console.log(`OK — every write hit BlueBundlesV1 on ${chainDef.name} and the position closed to zero`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
