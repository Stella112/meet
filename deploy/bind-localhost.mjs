// Preloaded into `buy gate` (node --import): it calls server.listen(port) with no host, which binds every
// interface. This makes a host-less listen bind 127.0.0.1 so the gate is reachable only through Caddy.
import net from "node:net";

const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  if (typeof args[0] === "number" && (args.length === 1 || typeof args[1] === "function")) args.splice(1, 0, "127.0.0.1");
  return listen.apply(this, args);
};
