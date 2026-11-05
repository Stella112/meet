/** @type {import('next').NextConfig} */
const nextConfig = {
  // MiniPay docs recommend ngrok for phone testing; dev mode must accept its hosts.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.AGENT_URL ?? "http://127.0.0.1:8787"}/api/:path*` }];
  },
};

export default nextConfig;
