"use client";

import { useEffect, useState } from "react";

type Step = {
  step: number;
  type: string;
  delay_days: number;
  trigger?: string;
  note?: string;
  text?: string;
};

type Sequence = {
  project: string;
  segment: string;
  description: string;
  sequence: Step[];
};

const SEQUENCES: { file: string; data: Sequence }[] = [];

export default function SequencesPage() {
  const [sequences, setSequences] = useState<{ file: string; data: Sequence }[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    // Load sequences from the sequences/ directory via API
    fetch("/api/sequences")
      .then((r) => r.json())
      .then((data) => setSequences(data.sequences || []))
      .catch(() => setSequences([]));
  }, []);

  return (
    <div className="mx-auto w-full max-w-screen-2xl">
      <h2 className="text-2xl font-bold mb-6">Sequenze Outreach</h2>

      {sequences.length === 0 ? (
        <p className="text-zinc-500 text-sm">
          Caricamento sequenze da sequences/...
        </p>
      ) : (
        <div className="space-y-3">
          {sequences.map(({ file, data }) => (
            <div
              key={file}
              className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden"
            >
              <button
                onClick={() =>
                  setExpanded(expanded === file ? null : file)
                }
                className="w-full p-4 text-left flex justify-between items-center hover:bg-zinc-800/50 transition-colors"
              >
                <div>
                  <span className="font-semibold">{data.segment}</span>
                  <span className="text-zinc-500 text-sm ml-2">
                    {data.project}
                  </span>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {data.description}
                  </p>
                </div>
                <span className="text-zinc-600 text-sm">
                  {data.sequence?.length || 0} step
                </span>
              </button>
              {expanded === file && data.sequence && (
                <div className="border-t border-zinc-800 p-4 space-y-3">
                  {data.sequence.map((step) => (
                    <div
                      key={step.step}
                      className="flex gap-3 items-start"
                    >
                      <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-mono shrink-0">
                        {step.step}
                      </div>
                      <div>
                        <div className="flex gap-2 items-center text-xs">
                          <span className="bg-zinc-800 px-2 py-0.5 rounded">
                            {step.type}
                          </span>
                          <span className="text-zinc-600">
                            giorno {step.delay_days}
                          </span>
                          {step.trigger && (
                            <span className="text-zinc-600">
                              ({step.trigger})
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-400 mt-1">
                          {step.note || step.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
