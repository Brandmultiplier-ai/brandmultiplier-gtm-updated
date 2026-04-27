import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = new URL("..", import.meta.url).pathname;
const envPath = join(ROOT, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^(\w+)=(.+)$/);
    if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const unipile = await import("../src/lib/unipile");
  const store = await import("../src/lib/store");

  const lucaMsg = `Ciao Luca, bellissimo messaggio! Hai centrato il punto, la combo ElevenLabs + N8N + Heygen è potente ma richiede comunque qualcuno che la orchestri e monitori. Quello che sto costruendo è esattamente questo: un operatore AI che gestisce il marketing operativo in autonomia, ads, social, report, tutto controllabile da Telegram. Zero dashboard, ti manda lui un report ogni mattina con cosa funziona e cosa no. Molto figo che stai lavorando a un CRM con AI, potrebbe integrarsi bene. Ti va di fare una call veloce questa settimana? Ti faccio vedere una demo live, 15 minuti e ti fai un'idea concreta.`;

  const carloMsg = `Ciao Carlo, grazie! Sto lavorando a un operatore AI per il marketing, gestisce campagne, ads e report in autonomia via Telegram. Niente dashboard complesse, ti arriva un update ogni mattina con i numeri e le azioni fatte. Se ti incuriosisce ti faccio vedere una demo veloce, 15 minuti e ti mostro come funziona. Fammi sapere!`;

  // Send to Luca Deiana
  console.log("Sending to Luca Deiana...");
  const lucaRes = await unipile.sendMessage("mUnJfnQoWWu2XyOIldCI_w", lucaMsg);
  console.log("Luca result:", lucaRes._httpStatus, lucaRes.type || "ok");

  // Send to Carlo Andreoli
  console.log("Sending to Carlo Andreoli...");
  const carloRes = await unipile.sendMessage("CyY0qTvwVA2s3I2qZRHh2A", carloMsg);
  console.log("Carlo result:", carloRes._httpStatus, carloRes.type || "ok");

  // Update Luca Deiana lead
  const lucaLead = store.getLead("cmp_c4g_freelancer", "led_3565niks");
  if (lucaLead) {
    lucaLead.status = "replied";
    lucaLead.events.push({ ts: new Date().toISOString(), type: "replied", message: "Lead replied with interest in AI marketing" });
    lucaLead.events.push({ ts: new Date().toISOString(), type: "message_sent", step: 2, message: lucaMsg });
    store.saveLead(lucaLead);
    console.log("Updated Luca Deiana -> replied + message_sent");
  }

  // Update Carlo Andreoli lead
  const allLeads = store.getAllLeads({});
  const carloLead = allLeads.find(l => l.providerId === "ACoAABwTUzYBYAH1uDl5vm3uZajCs8KdT6m9bVo");
  if (carloLead) {
    carloLead.status = "replied";
    carloLead.events.push({ ts: new Date().toISOString(), type: "accepted", message: "Synced from Unipile" });
    carloLead.events.push({ ts: new Date().toISOString(), type: "replied", message: "Piacere di averti nella rete" });
    carloLead.events.push({ ts: new Date().toISOString(), type: "message_sent", step: 2, message: carloMsg });
    store.saveLead(carloLead);
    console.log("Updated Carlo Andreoli -> replied + message_sent");
  } else {
    console.log("Carlo lead not found in store!");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
