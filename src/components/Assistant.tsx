import { useEffect, useRef, useState } from "react";
import { Mic, Send, Sparkles, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, isOffice, refreshAll, useAuth } from "@/lib/app";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; text: string };

const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export default function Assistant() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakOn, setSpeakOn] = useState(true);
  const rec = useRef<any>(null);
  const end = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<Msg[]>([]);
  msgsRef.current = msgs;
  const speakRef = useRef(speakOn);
  speakRef.current = speakOn;

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const unlockSpeech = () => {
    try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; window.speechSynthesis.speak(u); } catch { /* ignore */ }
  };
  const speak = (t: string) => {
    if (!speakRef.current || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.rate = 1.02;
    window.speechSynthesis.speak(u);
  };

  const send = async (t: string) => {
    const clean = t.trim();
    if (!clean || busy) return;
    const next = [...msgsRef.current, { role: "user" as const, text: clean }];
    setMsgs(next); setText(""); setBusy(true);
    try {
      const r = await api<{ reply: string }>("/assistant", { body: { messages: next } });
      setMsgs([...next, { role: "assistant", text: r.reply }]);
      speak(r.reply);
      refreshAll();
    } catch (e: any) {
      setMsgs([...next, { role: "assistant", text: "Sorry, I couldn't do that: " + e.message }]);
    } finally { setBusy(false); }
  };

  const toggleMic = () => {
    unlockSpeech();
    if (!SR) { setMsgs((m) => [...m, { role: "assistant", text: "Voice input isn't supported in this browser. Type your command instead." }]); return; }
    if (listening) { rec.current?.stop(); return; }
    window.speechSynthesis?.cancel();
    const r = new SR();
    r.lang = "en-US"; r.interimResults = true; r.continuous = false;
    r.onresult = (ev: any) => {
      const t = Array.from(ev.results).map((x: any) => x[0].transcript).join("");
      setText(t);
      if (ev.results[ev.results.length - 1].isFinal) send(t);
    };
    r.onerror = (ev: any) => {
      setListening(false);
      if (ev.error === "not-allowed") setMsgs((m) => [...m, { role: "assistant", text: "Microphone permission was denied. Enable it in browser settings." }]);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  };

  const hints = isOffice(user)
    ? ["Show today's jobs", "Add customer John Smith 555-1234", "Create estimate for Tom Alvarez water heater replacement $1200", "What invoices are unpaid?"]
    : ["Show today's jobs", "Mark job 1 on site"];

  return (
    <>
      <button
        onClick={() => { unlockSpeech(); setOpen(true); }}
        aria-label="Open assistant"
        className="no-print fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6 md:right-6 z-40 h-16 w-16 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center active:scale-95 transition"
      >
        <Sparkles className="h-7 w-7" />
      </button>
      <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) { rec.current?.stop(); window.speechSynthesis?.cancel(); } }}>
        <SheetContent side="bottom" className="h-[88vh] md:max-w-xl md:mx-auto rounded-t-3xl flex flex-col p-0 gap-0">
          <SheetHeader className="px-5 pt-5 pb-3 border-b text-left flex-row items-center justify-between space-y-0">
            <SheetTitle className="text-xl flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />Assistant</SheetTitle>
            <Button variant="ghost" size="icon" className="mr-8 h-10 w-10" onClick={() => { setSpeakOn(!speakOn); window.speechSynthesis?.cancel(); }} aria-label="Toggle voice replies">
              {speakOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5 text-muted-foreground" />}
            </Button>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {msgs.length === 0 && (
              <div className="space-y-2">
                <p className="text-muted-foreground px-1">Tap the mic and speak, or type. Try:</p>
                {hints.map((h) => (
                  <button key={h} onClick={() => send(h)} className="block w-full text-left bg-muted rounded-2xl px-4 py-3 text-base active:bg-muted/60">“{h}”</button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-base whitespace-pre-wrap", m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted")}>{m.text}</div>
            ))}
            {busy && <div className="bg-muted rounded-2xl px-4 py-2.5 w-fit text-muted-foreground">Thinking…</div>}
            <div ref={end} />
          </div>
          <div className="p-3 border-t flex items-center gap-2 safe-bottom">
            <Button onClick={toggleMic} size="icon" aria-label="Voice input"
              className={cn("h-14 w-14 rounded-full shrink-0", listening ? "bg-red-600 hover:bg-red-600 animate-pulse" : "")}>
              <Mic className="h-6 w-6" />
            </Button>
            <Input className="h-14 rounded-full px-5 text-base" placeholder={listening ? "Listening…" : "Type a command"} value={text}
              onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (unlockSpeech(), send(text))} />
            <Button size="icon" variant="secondary" className="h-14 w-14 rounded-full shrink-0" disabled={!text.trim() || busy} onClick={() => { unlockSpeech(); send(text); }}><Send className="h-5 w-5" /></Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
