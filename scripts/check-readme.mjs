import { readFileSync } from "node:fs";

const expected = [
  "# Meet",
  "## Demo",
  "## What it does",
  "## Quickstart",
  "## Built at Agents on Open Rails (Celo)",
  "## How the agent works",
  "## Prompts & safety",
  "## Run it",
  "## Tech stack",
  "## Hackathon entry data",
  "## Services used (Build with buy) and proof of payment",
  "## What is verified",
  "## Roadmap",
  "## License",
];
const text = readFileSync(new URL("../README.md", import.meta.url), "utf8").replaceAll("\r\n", "\n");
const firstLine = text.split("\n")[0];
const headings = text.replace(/```[\s\S]*?```/g, "").split("\n").filter((l) => /^#{1,2} /.test(l));
const ok =
  firstLine === "<!-- readme-schema: R5-agent-ai v1 + event-overlay -->" &&
  JSON.stringify(headings) === JSON.stringify(expected);
console.log(ok ? "PASS" : `FAIL\n${headings.join("\n")}`);
process.exit(ok ? 0 : 1);
