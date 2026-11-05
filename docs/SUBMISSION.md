# Loops House submission draft (Maris submits)

- **One-liner:** Meet is a naira treasury agent for dollar-earning businesses and people. It keeps your money in dollars, buys the naira your staff and bills need before they're due, and pays on time with proof of what it saved.
- **Problem:** Nigerians who earn in dollars pay most of life in naira. They usually convert on payday, lose value before bills are due, and pay the street spread or risk P2P scams.
- **Solution:** Users sign obligations once. The agent picks the time and venue, then pays the payee in cNGN atomically from the user's wallet.
- **Tracks:** Textile FX, Build with buy
- **Architecture note:** Users sign obligations. The agent picks the time and venue, takes Textile quotes, and submits `settle()`, paying that gas. Funds never sit in a contract.
- **Custody:** Your dollars stay in your wallet until your payee is paid. Meet buys naira early with its own money and bears that risk.
- **Volume note:** TBD-post-build:volume-note (brief says all taker volume, which is only true if the maker doesn't ship)
- **Users:** TBD-post-build:user-sources
- **Services with proof:** TBD-post-build:buy-tx-hashes
- **Contracts:** 0x666792B9eF14D6Ca9AAEee598784efcfD2840591
- **Agent wallet:** 0x9155dEb21b6d7E8377C3ba2Fe9Ea6F0F5Cf0A956
- **agentId:** TBD-post-build:agent-id
- **Tag:** celo_8d6bd2780c7d
- **Repo:** https://github.com/Stella112/meet
- **App:** TBD-post-build:app-url
- **Video:** TBD-post-build:video-url
- **Disclaimer:** Prototype for a hackathon, not a licensed money service. A regulatory review is needed before launch.
