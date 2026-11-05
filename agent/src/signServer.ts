import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { toDataSuffix } from "@celo/attribution-tags";
import { domain, obligationSchema, obligationTypes, CNGN, USDT, validateObligation } from "./eip712.js";
import { loadConfig } from "./config.js";
import { textilePreviewBuy } from "./liveQuotes.js";
import type { Address, Hex } from "./types.js";

// Temporary localhost page so Maris can sign test obligations with her own wallet until the
// web app exists. Her key never reaches this process; it only receives signatures.
const cfg = loadConfig();
const settlement = process.env.MEET_SETTLEMENT_ADDRESS as Address;
const tag = toDataSuffix(process.env.ATTRIBUTION_TAG!);
const PORT = 4173;
const NAIRA = 1400n;
const COUNT = 1;
const dir = new URL("../data/", import.meta.url);
mkdirSync(dir, { recursive: true });

const page = () => `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Meet test signing</title>
<style>body{font:16px system-ui;max-width:560px;margin:24px auto;padding:0 16px}input{width:100%;padding:8px;box-sizing:border-box}button{padding:10px 14px;margin:8px 0}pre{white-space:pre-wrap;background:#f2f2f2;padding:8px}</style>
<h2>Meet: sign ${COUNT} test payments</h2>
<p>Real mainnet. Each pays ₦${NAIRA} in cNGN to the payee. You approve USDT only up to the total worst case, and sign ${COUNT} obligations. Signing moves nothing; funds move only when the agent settles.</p>
<label>Payee address<input id=payee placeholder=0x...></label>
<button id=go>Connect, approve, sign</button><pre id=out></pre>
<script>
const log=m=>out.textContent+=m+"\\n";
const hex=n=>"0x"+BigInt(n).toString(16);
go.onclick=async()=>{try{
 if(!window.ethereum) throw new Error("No wallet found in this browser");
 const [owner]=await ethereum.request({method:"eth_requestAccounts"});
 await ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:"0xa4ec"}]});
 const plan=await (await fetch("/plan?owner="+owner+"&payee="+payee.value)).json();
 if(plan.error) throw new Error(plan.error);
 log("Worst case per payment: "+Number(plan.items[0].message.maxSellAmount)/1e6+" USDT");
 const data="0x095ea7b3"+"${settlement.slice(2).toLowerCase().padStart(64, "0")}"+BigInt(plan.total).toString(16).padStart(64,"0")+"${tag.slice(2)}";
 const tx=await ethereum.request({method:"eth_sendTransaction",params:[{from:owner,to:"${USDT}",data}]});
 log("Approve sent: "+tx);
 for(;;){const r=await ethereum.request({method:"eth_getTransactionReceipt",params:[tx]});if(r){if(r.status!=="0x1")throw new Error("approve failed");break}await new Promise(r=>setTimeout(r,2000))}
 for(const it of plan.items){
  const typed={types:{EIP712Domain:[{name:"name",type:"string"},{name:"version",type:"string"},{name:"chainId",type:"uint256"},{name:"verifyingContract",type:"address"}],...plan.types},primaryType:"Obligation",domain:plan.domain,message:it.message};
  const sig=await ethereum.request({method:"eth_signTypedData_v4",params:[owner,JSON.stringify(typed)]});
  const res=await (await fetch("/save",{method:"POST",body:JSON.stringify({...it,sig})})).json();
  log(it.id+": "+(res.error||"saved"));
 }
 log("Done. Tell Claude.");
}catch(e){log("ERROR: "+e.message)}};
</script>`;

const send = (res: import("node:http").ServerResponse, code: number, body: string, type = "application/json") => {
  res.writeHead(code, { "content-type": type });
  res.end(body);
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, `http://localhost:${PORT}`);
    if (url.pathname === "/") return send(res, 200, page(), "text/html");
    if (url.pathname === "/plan") {
      const owner = url.searchParams.get("owner")!;
      const payee = url.searchParams.get("payee")!;
      if (!/^0x[0-9a-fA-F]{40}$/.test(payee)) return send(res, 200, JSON.stringify({ error: "Payee address is not valid" }));
      if (payee.toLowerCase() === owner.toLowerCase()) return send(res, 200, JSON.stringify({ error: "Payee must differ from your wallet" }));
      const now = Math.floor(Date.now() / 1000);
      const buyAmount = NAIRA * 1_000_000n;
      const day1 = await textilePreviewBuy(buyAmount, now);
      if (!day1) return send(res, 200, JSON.stringify({ error: "No Textile rate right now" }));
      const maxSellAmount = (day1.usdtIn * 103n) / 100n;
      const items = Array.from({ length: COUNT }, (_, i) => ({
        id: `test-${now}-${i}`,
        day1: { usdt: day1.usdtIn.toString(), cngn: buyAmount.toString(), source: "textile preview", at: now },
        message: {
          owner, recipient: payee, sellToken: USDT, buyToken: CNGN,
          buyAmount: buyAmount.toString(), maxSellAmount: maxSellAmount.toString(),
          validAfter: String(now - 60), expiry: String(now + 6 * 3600), nonce: String(now * 10 + i),
        },
      }));
      return send(res, 200, JSON.stringify({ items, total: (maxSellAmount * BigInt(COUNT)).toString(), types: obligationTypes, domain: domain(settlement) }));
    }
    if (url.pathname === "/save" && req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      const o = obligationSchema.parse(body.message);
      const rejected = await validateObligation(o, body.sig as Hex, {
        settlement,
        now: Math.floor(Date.now() / 1000),
        maxUsd: cfg.MAX_OBLIGATION_USD,
      });
      if (rejected) return send(res, 200, JSON.stringify({ error: rejected }));
      writeFileSync(new URL(`${body.id}.json`, dir), JSON.stringify(body, null, 2));
      return send(res, 200, JSON.stringify({ ok: true }));
    }
    send(res, 404, "{}");
  } catch (e) {
    send(res, 500, JSON.stringify({ error: String(e) }));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Open http://localhost:${PORT}`));
