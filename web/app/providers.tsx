"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createConfig, http, useConnect, useConnection, WagmiProvider } from "wagmi";
import { celo } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// Setup from https://docs.minipay.xyz/getting-started/setup-react.html (injected connector, auto-connect).
// EIP-6963 discovery lists every installed wallet, so desktop users can pick instead of getting whichever grabbed window.ethereum.
const config = createConfig({
  chains: [celo],
  connectors: [injected()],
  multiInjectedProviderDiscovery: true,
  transports: { [celo.id]: http() },
  ssr: true,
});

function AutoConnect() {
  const { isConnected } = useConnection();
  const { mutate, connectors } = useConnect();
  const tried = useRef(false);
  useEffect(() => {
    // MiniPay requires connecting on load, never a connect button. Elsewhere the user picks a wallet.
    const eth = typeof window === "undefined" ? undefined : (window as { ethereum?: { isMiniPay?: boolean } }).ethereum;
    if (tried.current || isConnected || !eth?.isMiniPay) return;
    tried.current = true;
    mutate({ connector: connectors.find((c) => c.id === "injected") ?? connectors[0] });
  }, [isConnected, mutate, connectors]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={client}>
        <AutoConnect />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
