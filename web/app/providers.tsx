"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createConfig, http, useConnect, useConnection, WagmiProvider } from "wagmi";
import { celo } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// Setup from https://docs.minipay.xyz/getting-started/setup-react.html (injected connector, auto-connect).
const config = createConfig({ chains: [celo], connectors: [injected()], transports: { [celo.id]: http() }, ssr: true });

function AutoConnect() {
  const { isConnected } = useConnection();
  const { mutate, connectors } = useConnect();
  const tried = useRef(false);
  useEffect(() => {
    // MiniPay requires connecting on load, never a connect button.
    if (tried.current || isConnected || typeof window === "undefined" || !(window as { ethereum?: unknown }).ethereum) return;
    tried.current = true;
    mutate({ connector: connectors[0] });
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
