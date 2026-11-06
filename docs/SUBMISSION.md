# Loops House submission draft (Maris submits)

- **One-liner:** Meet is a naira treasury agent for dollar-earning businesses and people. It keeps your money in dollars, buys the naira your staff and bills need before they're due, and pays on time with proof of what it saved.
- **Problem:** Nigerians who earn in dollars pay most of life in naira. They usually convert on payday, lose value before bills are due, and pay the street spread or risk P2P scams.
- **Solution:** Users sign obligations once. The agent picks the time and venue, then pays the payee in cNGN atomically from the user's wallet.
- **Tracks:** Textile FX, Build with buy
- **Architecture note:** Users sign obligations. The agent picks the time and venue, takes Textile quotes, and submits `settle()`, paying that gas. Funds never sit in a contract.
- **Custody:** Your dollars stay in your wallet until your payee is paid. Meet buys naira early with its own money and bears that risk.
- **Volume note:** TBD-post-build:volume-note (brief says all taker volume, which is only true if the maker doesn't ship)
- **Users:** TBD-post-build:user-sources
- **Services with proof:** buy `x.posts.search` as the news sense, paid in USD₮ from 0x134ee545D978Ad5e7a5aF2f082fa336C4589A018: 0xabc1479292edf6b2f3445f2ba864d00f24464b80cd5fc5879f90711e832986bc, 0xd92b50c77f0a5ed1232d3524f5b5a8dc98c8aacc3b1381477243d6dbbf3b293a. A Cencori call (0xce8b943c6e6ccad542c4d45c0b8d06307a78d6d0089f6035f01f6b42e78b7806) was paid but failed upstream (model retired), so news is classified by a fixed rule.
- **Contracts:** 0x666792B9eF14D6Ca9AAEee598784efcfD2840591
- **Agent wallet:** 0x9155dEb21b6d7E8377C3ba2Fe9Ea6F0F5Cf0A956
- **agentId:** 10044 (ERC-8004 Identity Registry on Celo, register tx 0x33c720a99de8c9b793748e7b3497383a4f638efa2c5cadefe99b5901b5a20a17)
- **Tag:** celo_8d6bd2780c7d
- **Repo:** https://github.com/Stella112/meet
- **App:** https://usemeet.website
- **Video:** TBD-post-build:video-url
- **Disclaimer:** Prototype for a hackathon, not a licensed money service. A regulatory review is needed before launch.
