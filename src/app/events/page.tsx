"use client";

import { startTransition, useEffect, useState } from "react";

type Event = {
  ts: string;
  source?: string;
  user_full_name?: string;
  user_public_identifier?: string;
  sender?: { name?: string } | string;
  message?: { text?: string } | string;
  [key: string]: unknown;
};

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadEvents() {
    const res = await fetch("/api/webhooks");
    const data = await res.json();
    startTransition(() => {
      setEvents(data.events || []);
      setLoading(false);
    });
  }

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void loadEvents();
    }, 0);
    const interval = setInterval(loadEvents, 5000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-screen-2xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-medium tracking-[-0.04em] text-gradient">Eventi</h2>
          <p className="text-sm text-stone mt-1">Real-time webhook events</p>
        </div>
        <button
          onClick={loadEvents}
          className="text-[10px] uppercase tracking-[0.2em] text-stone hover:text-terracotta transition-colors"
        >
          Aggiorna
        </button>
      </div>

      {loading ? (
        <p className="text-stone text-sm">Caricamento...</p>
      ) : events.length === 0 ? (
        <div className="clean-card p-8 text-center">
          <p className="text-muted-foreground">Nessun evento ancora</p>
          <p className="text-stone text-xs mt-1">
            Gli eventi appariranno quando qualcuno accetta una connessione o
            risponde a un messaggio
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((ev, i) => (
            <div
              key={i}
              className="clean-card p-4 flex items-start gap-3"
            >
              <span className="text-lg mt-0.5">
                {ev.user_full_name ? "\u{1F91D}" : "\u{1F4AC}"}
              </span>
              <div className="flex-1 min-w-0">
                {ev.user_full_name ? (
                  <p className="text-sm">
                    <span className="font-medium text-foreground">{ev.user_full_name}</span>
                    <span className="text-stone ml-1">
                      ha accettato la connessione
                    </span>
                  </p>
                ) : (
                  <p className="text-sm">
                    <span className="font-medium text-foreground">
                      {typeof ev.sender === "object"
                        ? ev.sender?.name
                        : ev.sender || "?"}
                    </span>
                    <span className="text-stone ml-1">
                      :{" "}
                      {typeof ev.message === "object"
                        ? ev.message?.text
                        : String(ev.message || "").slice(0, 200)}
                    </span>
                  </p>
                )}
                <p className="text-xs text-stone mt-0.5">
                  {new Date(ev.ts).toLocaleString("it-IT")}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
