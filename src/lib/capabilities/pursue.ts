/**
 * Capability: Pursue. Get a thing from a person — multi-channel,
 * multi-turn, escalating on a clock, using learned facts about that
 * person (e.g. "sales submits incentive inputs three days late").
 *
 * NOT WIRED YET. The real channel is the WhatsApp Business Platform API
 * through an Indian BSP (Gupshup / Interakt / Wati) — see the "open
 * source" section of the Muster doc for why not a self-hosted WhatsApp
 * library. Until a BSP account exists, this logs the intent to pursue
 * so the Input agent's shape is correct and it's a one-function swap
 * once a channel is wired in.
 */
export async function pursue(args: {
  personName: string;
  channel: "whatsapp" | "email";
  message: string;
}): Promise<{ sent: boolean; note: string }> {
  console.log(`[pursue:stub] would message ${args.personName} via ${args.channel}: ${args.message}`);
  return { sent: false, note: "Pursue is not wired to a real channel yet — logged only." };
}
