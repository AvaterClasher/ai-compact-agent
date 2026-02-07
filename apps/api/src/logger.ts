import { Axiom } from "@axiomhq/js";
import { AxiomJSTransport, ConsoleTransport, Logger, type Transport } from "@axiomhq/logging";

const transports: [Transport, ...Transport[]] = [new ConsoleTransport()];

if (process.env.AXIOM_API_TOKEN) {
  const axiom = new Axiom({ token: process.env.AXIOM_API_TOKEN });
  transports.push(
    new AxiomJSTransport({
      axiom,
      dataset: process.env.AXIOM_DATASET || "backend-traces",
    }),
  );
}

export const logger = new Logger({ transports });
