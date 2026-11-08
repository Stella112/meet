import asyncio
import json
import os

import edge_tts

# Same voice and rate as the Chogathon demo.
VOICE = "en-US-AndrewMultilingualNeural"
RATE = "-4%"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "public", "vo")

SCENES = {
    "hook": "You get paid in dollars. But your staff, your landlord and your suppliers want naira. So on payday, you convert everything. You pay the street spread, you risk a P2P scam, and then you watch the naira move before rent is even due. What if an agent held your dollars until the moment each bill needed paying, then paid it for you, and could never take more than you signed? This is Meet. And it's live on Celo mainnet.",
    "tell": "Meet is a naira treasury agent. You tell it once: who to pay, how much in naira, and when. Payroll for your staff, supplier invoices, or monthly bills. You approve only the worst-case amount, and you sign one limit per payment. Your dollars stay in your own wallet.",
    "how": "Then the agent takes over. Each payment gets a three-day window. Before it converts, Meet buys a news check, searching X and Reddit. If both report a naira shock, it converts early. If the rate beats your day-one rate, it acts sooner. Otherwise, it waits until twelve hours before the due date. Rules in code decide this, not a language model.",
    "pay": "When it's time, Meet compares Textile and Uniswap for the exact naira needed, and picks the cheaper. It buys with its own float. Then one transaction takes your dollars and delivers cNGN straight to your payee. Or it reverts, and nothing moves.",
    "trust": "Here's why you can trust it. Every payment is a signed limit: the exact naira, the most dollars you'll pay, the payee, and the deadline. We tried going past it by a single unit, and the API and the contract both refused. You can cancel any time. If a payment can't complete, the naira stays Meet's problem: it sells it back and tells you, not paid, no funds moved. Hard caps, a stop-loss and a kill switch sit on top.",
    "stack": "It's built on open rails. Textile FX and Uniswap for liquidity. Buy for paid X and Reddit searches. An x402 feed, so other agents can buy Meet's live rate board. An ERC-8004 identity, agent ten thousand and forty-four. And an attribution tag on every transaction.",
    "proof": "Everything is public. Three test payments between our own wallets have delivered two thousand seven hundred naira: one through Textile, two through Uniswap. Over those few minutes, fees left them slightly worse than the day-one rate, and the ledger shows that too. Savings here are measured, never promised.",
    "close": "It's a capped prototype, not a licensed money service. But the core works today. Stay in dollars until the day you need naira. Then get paid out, on time, with the receipts on-chain. Meet. usemeet dot website.",
}


async def main():
    os.makedirs(OUT, exist_ok=True)
    timing = {}
    for name, text in SCENES.items():
        path = os.path.join(OUT, f"{name}.mp3")
        for attempt in range(6):
            audio = bytearray()
            sentences = []
            try:
                async for chunk in edge_tts.Communicate(text, VOICE, rate=RATE, boundary="SentenceBoundary").stream():
                    if chunk["type"] == "audio":
                        audio += chunk["data"]
                    elif chunk["type"] == "SentenceBoundary":
                        sentences.append({"start": chunk["offset"] / 1e7, "end": (chunk["offset"] + chunk["duration"]) / 1e7, "text": chunk["text"]})
                break
            except Exception as e:
                print(name, "retry", attempt, type(e).__name__)
                await asyncio.sleep(3 + attempt * 2)
        else:
            raise SystemExit(f"{name} failed")
        with open(path, "wb") as f:
            f.write(audio)
        timing[name] = sentences
    with open(os.path.join(OUT, "timing.json"), "w", encoding="utf8") as f:
        json.dump(timing, f, ensure_ascii=False, indent=1)


asyncio.run(main())
