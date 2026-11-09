'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ConferenceAnswer, SessionDetails } from './conference-answer';
import { runDiscovery } from '@/app/discover/actions';
import type { DiscoveryResult, DiscoverySource } from '@/lib/discovery';
import { TAXONOMY, label } from '@/lib/taxonomy';

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
const subscribeVoice = (): (() => void) => () => {};
const getVoiceSupport = (): boolean => {
  const w = window as SpeechWindow;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
};
const EXAMPLES = [
  'I want to build AI systems that perform tasks independently',
  'Who works on computer vision?',
  'Which speakers have startup experience?',
  'What are people interested in robotics attending?',
];
const SIGNAL_LABELS: Record<keyof DiscoverySource['signals'], string> = {
  keyword: 'Keyword', semantic: 'Semantic', interests: 'Shared interests', popularity: 'Attendance popularity', social: 'Similar people / shared sessions',
};

export function Discovery({ events }: { events: { id: string; name: string }[] }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'talks' | 'people'>('all');
  const [eventId, setEventId] = useState(events[0]?.id ?? '');
  const [tag, setTag] = useState('');
  const [assistant, setAssistant] = useState(true);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const voiceSupported = useSyncExternalStore(subscribeVoice, getVoiceSupport, () => false);
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const requestPending = useRef(false);

  useEffect(() => {
    return () => recognition.current?.abort();
  }, []);

  async function search(text = query): Promise<void> {
    if (requestPending.current) return;
    requestPending.current = true;
    recognition.current?.abort();
    setBusy(true); setError(''); setResult(null); setSelected(null);
    try {
      const response = await runDiscovery({ query: text, kind, eventId, tag, assistant });
      if (response.error) setError(response.error);
      if (response.result) { setResult(response.result); setTimeout(() => resultsRef.current?.focus(), 0); }
    } catch { setError('Search could not finish. Please try again.'); }
    finally { setBusy(false); requestPending.current = false; }
  }

  function toggleVoice(): void {
    if (listening) { recognition.current?.stop(); return; }
    const speechWindow = window as SpeechWindow;
    const Constructor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Constructor) return;
    const instance = new Constructor();
    recognition.current = instance;
    instance.lang = 'en-US'; instance.continuous = false; instance.interimResults = false;
    instance.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      setQuery(transcript); setVoiceStatus('Voice captured. Review your words, then select Search.');
      inputRef.current?.focus();
    };
    instance.onerror = (event) => {
      setListening(false);
      setVoiceStatus(event.error === 'not-allowed'
        ? 'Microphone access was denied. You can type your search instead.'
        : 'Voice search could not capture speech. Try again or type your search.');
    };
    instance.onend = () => { setListening(false); };
    try { instance.start(); setListening(true); setVoiceStatus('Listening. Select Stop listening when finished.'); }
    catch { setVoiceStatus('Voice search is unavailable. Please type your search.'); }
  }

  const active = result?.sources.find((source) => source.citation === selected);
  return (
    <div className="py-12 space-y-8">
      <div>
        <p className="text-accent text-sm mb-3">Conference discovery</p>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Find your next conversation.</h1>
        <p className="text-muted mt-4 max-w-2xl">Search talks and people in your own words, or ask the conference assistant. Every answer comes with evidence you can explore.</p>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void search(); }} className="card p-5 space-y-5" aria-label="Conference search">
        <div>
          <label htmlFor="discovery-query" className="block font-medium mb-2">What would you like to discover?</label>
          <div className="flex flex-wrap gap-2">
            <input ref={inputRef} id="discovery-query" type="search" className="input flex-1 min-w-48" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Talks about autonomous AI agents…" minLength={2} maxLength={1000} required aria-describedby="voice-help" />
            {voiceSupported && <button type="button" className="btn" aria-pressed={listening} onClick={toggleVoice} disabled={busy}>{listening ? '■ Stop listening' : '◉ Talk to search'}</button>}
            <button className="btn btn-primary" disabled={busy || !eventId}>{busy ? 'Searching…' : 'Search'}</button>
          </div>
          <p id="voice-help" className="text-sm text-muted mt-2">{voiceSupported ? 'Voice input uses your browser’s speech service. Review the transcript before searching.' : 'Type to search. Voice input is available in browsers that support speech recognition on HTTPS or localhost.'}</p>
          <p role="status" className="text-sm text-accent mt-1">{voiceStatus}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">Conference<select className="input mt-2" value={eventId} onChange={(event) => setEventId(event.target.value)} required>{!events.length && <option value="">No conference indexed</option>}{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
          <label className="text-sm">Discover<select className="input mt-2" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="all">Talks and people</option><option value="talks">Talks</option><option value="people">People who opted in</option></select></label>
          <label className="text-sm">Interest or skill<select className="input mt-2" value={tag} onChange={(event) => setTag(event.target.value)}><option value="">All interests and skills</option>{TAXONOMY.map((tag) => <option key={tag} value={tag}>{label(tag)}</option>)}</select></label>
        </div>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={assistant} onChange={(event) => setAssistant(event.target.checked)} className="size-4 accent-blue-400" />Ask the assistant to answer using retrieved sources</label>
        <p className="text-xs text-muted">People results include only profiles that opted into discovery for the selected conference. Demo profiles, resumes and social bios are synthetic.</p>
      </form>
      <div className="flex flex-wrap gap-2" aria-label="Example questions">{EXAMPLES.map((example) => <button key={example} className="btn text-left" disabled={busy || !eventId} onClick={() => { setQuery(example); void search(example); }}>{example}</button>)}</div>
      {error && <p role="alert" className="card p-5 text-warn">{error}</p>}
      {busy && <p role="status">Retrieving conference sources{assistant ? ' and preparing a grounded answer' : ''}…</p>}
      {result && <section aria-labelledby="discovery-results" className="space-y-6">
        <h2 ref={resultsRef} tabIndex={-1} id="discovery-results" className="text-xl font-semibold">{result.sources.length} sources for “{result.query}”</h2>
        <p className="text-sm text-muted">{result.semantic ? 'Hybrid keyword + semantic retrieval' : 'Keyword retrieval'} · {result.retrieved} candidates · {(result.elapsedMs / 1000).toFixed(1)}s retrieval</p>
        {result.warnings.map((warning) => <p key={warning} role="status" className="text-warn text-sm">{warning}</p>)}
        {result.answer && <article className="card p-6 border-accent-dim" aria-label="Conference assistant answer">
          <h3 className="font-semibold mb-3">{(result.generation === 'elastic' || result.generation === 'openai') ? 'Conference assistant' : 'Retrieved evidence · generation unavailable'}</h3>
          <ConferenceAnswer answer={result.answer} sources={result.sources} />
        </article>}
        <div className="card p-5 space-y-5">
          <h3 className="font-semibold">Explore how this answer was found</h3>
          <ol className="grid sm:grid-cols-4 gap-3 text-sm" aria-label="Retrieval and answer flow">
            {[['1. Question', result.query], ['2. Retrieve', result.semantic ? 'BM25 + semantic embeddings' : 'BM25 keyword search'], ['3. Rank', 'Fuse relevance, interests and attendance'], ['4. Answer', (result.generation === 'elastic' || result.generation === 'openai') ? 'Generate from cited evidence' : result.generation === 'extractive' ? 'Show source excerpts' : 'Browse ranked sources']].map(([title, detail]) => <li key={title} className="rounded-xl bg-surface-2 p-4"><strong className="block text-accent mb-2">{title}</strong>{detail}</li>)}
          </ol>
          <p className="text-sm text-muted">Select a source to inspect its ranking. Bars show each signal’s share of the ranking score, not a confidence or probability.</p>
          <div className="flex flex-wrap gap-2">{result.sources.map((source) => <button key={source.citation} type="button" className="btn" aria-pressed={selected === source.citation} onClick={() => setSelected(source.citation)}>{source.citation} · {source.kind === 'talk' ? 'Talk' : 'Person'}</button>)}</div>
          {active && <div className="space-y-3" aria-live="polite"><h4 className="font-medium">{active.title}</h4>{(Object.entries(active.signals) as [keyof DiscoverySource['signals'], number][]).map(([key, value]) => {
            const total = Object.values(active.signals).reduce((sum, v) => sum + v, 0);
            const percent = total ? Math.round(value / total * 100) : 0;
            return <div key={key} className="grid grid-cols-[minmax(120px,1fr)_2fr_3rem] items-center gap-3 text-sm"><span>{SIGNAL_LABELS[key]}</span><meter min={0} max={100} value={percent} className="w-full" aria-label={`${SIGNAL_LABELS[key]} contribution`}>{percent}%</meter><span>{percent}%</span></div>;
          })}</div>}
        </div>
        {!result.sources.length && <p className="card p-5">No matching sources. Try a broader question or remove the skill filter.</p>}
        {(['talk', 'person'] as const).map((kind) => {
          const group = result.sources.filter((source) => source.kind === kind);
          if (!group.length) return null;
          return <section key={kind} aria-label={kind === 'talk' ? 'Talk sources' : 'People sources'} className="space-y-4">
          <h3 className="text-xl font-semibold">{kind === 'talk' ? 'Talks' : 'People'} <span className="text-sm text-muted">({group.length})</span></h3>
          <div className="grid md:grid-cols-2 gap-4">{group.map((source) => <article id={`source-${source.citation}`} key={source.citation} className="card p-5 scroll-mt-6">
          <p className="text-accent text-xs mb-2">[{source.citation}] · {source.kind === 'talk' ? 'Talk' : 'Opted-in attendee'}</p>
          <h3 className="font-semibold">{source.kind === 'talk' ? <Link href={source.href} className="hover:underline">{source.title}</Link> : source.title}</h3>
          <SessionDetails source={source} />
          <p className="text-sm text-muted mt-3 leading-relaxed">{source.excerpt}</p>
          <div className="flex flex-wrap gap-1 mt-4">{source.tags.map((tag) => <span className="pill" key={tag}>{label(tag)}</span>)}</div>
          <p className="text-xs text-accent mt-3">{Object.entries(source.signals).filter(([, value]) => value > 0).map(([key]) => SIGNAL_LABELS[key as keyof typeof SIGNAL_LABELS]).join(' · ')}</p>
        </article>)}</div></section>;
        })}
      </section>}
    </div>
  );
}
