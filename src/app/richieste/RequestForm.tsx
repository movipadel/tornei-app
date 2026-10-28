"use client";

import { Check, Clock3, Dumbbell, ListChecks, Send, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PublicModal } from "@/components/public/PublicModal";
import { PublicButton } from "@/components/public/PublicPrimitives";
import {
  goals,
  levels,
  matchTypes,
  requestClubs,
  trainingTypes,
  windows,
  type RequestInput,
} from "@/lib/moviRequests";
import styles from "./RequestForm.module.css";
import { playingSideLabels, playingSides, type PlayingSide } from "@/lib/playingSide";

type RequestType = "gioca" | "allenati";
type Choice = { value: string; label: string };

function ChoiceGroup({ label, name, value, options, required = false, onChange }: {
  label: string;
  name: string;
  value: string;
  options: Choice[];
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return <fieldset className={styles.fieldset} aria-required={required || undefined}>
    <legend>{label}</legend>
    <div className={styles.choiceGrid}>
      {options.map((option) => {
        const selected = option.value === value;
        return <label className={styles.choice} data-selected={selected || undefined} key={option.value}>
          <input className={styles.choiceInput} type="radio" name={name} value={option.value} checked={selected} required={required} onChange={() => onChange(option.value)} />
          <span>{option.label}</span>
          {selected ? <Check className={styles.selectedIcon} size={17} aria-hidden /> : null}
        </label>;
      })}
    </div>
  </fieldset>;
}

function MultiChoiceGroup({ label, name, value, options, exclusiveValue, onChange }: {
  label: string;
  name: string;
  value: string[];
  options: Choice[];
  exclusiveValue?: string;
  onChange: (value: string[]) => void;
}) {
  return <fieldset className={styles.fieldset} aria-required="true">
    <legend>{label}</legend>
    <div className={styles.choiceGrid}>
      {options.map((option) => {
        const selected = value.includes(option.value);
        return <label className={styles.choice} data-selected={selected || undefined} key={option.value}>
          <input
            className={styles.choiceInput}
            type="checkbox"
            name={name}
            value={option.value}
            checked={selected}
            required={value.length === 0}
            onChange={(event) => {
              if (event.target.checked) {
                onChange(option.value === exclusiveValue ? [option.value] : [...value.filter((item) => item !== exclusiveValue), option.value]);
              } else {
                onChange(value.filter((item) => item !== option.value));
              }
            }}
          />
          <span>{option.label}</span>
          {selected ? <Check className={styles.selectedIcon} size={17} aria-hidden /> : null}
        </label>;
      })}
    </div>
  </fieldset>;
}

function ClubChoices({ value, onChange }: { value: string[]; onChange: (clubs: string[]) => void }) {
  const choices = [{ value: "", label: "Indifferente" }, ...requestClubs.map((club) => ({ value: club, label: club }))];
  return <fieldset className={styles.fieldset}>
    <legend>Dove vuoi giocare?</legend>
    <div className={styles.choiceGrid}>
      {choices.map((choice) => {
        const selected = choice.value ? value.includes(choice.value) : value.length === 0;
        return <label className={styles.choice} data-selected={selected || undefined} key={choice.value || "any"}>
          <input
            className={styles.choiceInput}
            type="checkbox"
            value={choice.value || "any"}
            checked={selected}
            onChange={(event) => {
              if (!choice.value) {
                if (event.target.checked) onChange([]);
                return;
              }
              onChange(event.target.checked ? [...value, choice.value] : value.filter((club) => club !== choice.value));
            }}
          />
          <span>{choice.label}</span>
          {selected ? <Check className={styles.selectedIcon} size={17} aria-hidden /> : null}
        </label>;
      })}
    </div>
  </fieldset>;
}

function SuccessState({ type, onClose }: { type: RequestType; onClose: () => void }) {
  const subject = type === "gioca" ? "la partita giusta" : "la soluzione di allenamento giusta";
  return <section className={styles.success} role="status" aria-live="polite">
    <span className={styles.successIcon}><Send size={38} aria-hidden /></span>
    <div className={styles.successIntro}>
      <h2>Richiesta inviata!</h2>
      <strong>Ci pensiamo noi.</strong>
      <p>Ti ricontattiamo appena troviamo la soluzione giusta per te.</p>
    </div>
    <div className={styles.nextSteps}>
      <div className={styles.nextStepsTitle}><Clock3 size={22} aria-hidden /><h3>Cosa succede ora?</h3></div>
      <ol>
        <li><span>1</span>Abbiamo ricevuto la tua richiesta</li>
        <li><span>2</span>Il team MOVI sta cercando {subject}</li>
        <li><span>3</span>Ti ricontatteremo quando avremo una proposta</li>
      </ol>
    </div>
    <div className={styles.successActions}>
      <PublicButton type="button" onClick={onClose}>Ok, perfetto!</PublicButton>
      <Link className={styles.activitiesLink} href="/le-mie-attivita"><ListChecks size={19} aria-hidden />Vai alle mie attività</Link>
    </div>
    <p className={styles.signature}>Qualcosa trovi.<span aria-hidden>•</span></p>
  </section>;
}

export default function RequestForm({ type }: { type: RequestType }) {
  const router = useRouter();
  const [data, setData] = useState<RequestInput>({
    request_type: type,
    clubs: [],
    date_mode: "flexible",
    requested_date: null,
    time_window: "any",
    preferred_time_text: "",
    level: "unknown",
    playing_side: null,
    match_type: type === "gioca" ? ["any"] : null,
    group_size: type === "gioca" ? 1 : null,
    required_player_side: null,
    training_type: type === "allenati" ? ["advice"] : null,
    training_goal: type === "allenati" ? ["learn"] : null,
    notes: "",
    client_request_id: "",
  });
  const [key] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [login, setLogin] = useState(false);
  const [done, setDone] = useState(false);
  const sideTouched = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/user/profile", { cache: "no-store", signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(payload => {
        const preferred = payload?.data?.profile?.shared?.preferred_side;
        if (!controller.signal.aborted && !sideTouched.current && playingSides.includes(preferred)) {
          setData(current => current.playing_side === null ? { ...current, playing_side: preferred } : current);
        }
      })
      .catch(cause => { if (cause?.name !== "AbortError") return; });
    return () => controller.abort();
  }, []);

  function set<K extends keyof RequestInput>(field: K, value: RequestInput[K]) {
    setData((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setLogin(false);
    try {
      const response = await fetch("/api/user/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, client_request_id: key }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLogin(response.status === 401);
        throw new Error(typeof payload.error === "string" ? payload.error : "Richiesta non inviata, riprova");
      }
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Richiesta non inviata, riprova");
    } finally {
      setBusy(false);
    }
  }

  const isPlay = type === "gioca";
  const title = isPlay ? "Gioca" : "Allenati";
  const description = isPlay
    ? "Compila la richiesta e pensiamo noi a trovare la tua partita."
    : "Compila la richiesta e pensiamo noi a organizzare il tuo allenamento.";
  const close = () => router.push("/");

  return <main className={styles.page}>
    <PublicModal
      open
      onOpenChange={(open) => { if (!open) close(); }}
      contentClassName={styles.requestDialog}
      title={<span className={styles.dialogTitle}>{isPlay ? <UsersRound size={26} aria-hidden /> : <Dumbbell size={26} aria-hidden />}{title}</span>}
      description={done ? undefined : <span className={styles.intro}>{description}</span>}
    >
      {done ? <SuccessState type={type} onClose={close} /> : <form className={styles.form} onSubmit={submit}>
        <ClubChoices value={data.clubs} onChange={(clubs) => set("clubs", clubs)} />

        <ChoiceGroup
          label="Quando?"
          name="date_mode"
          value={data.date_mode}
          options={[{ value: "today", label: "Oggi" }, { value: "tomorrow", label: "Domani" }, { value: "specific", label: "Scegli giorno" }, { value: "flexible", label: "Sono flessibile" }]}
          onChange={(value) => set("date_mode", value as RequestInput["date_mode"])}
        />
        {data.date_mode === "specific" ? <label className={styles.textField}><span>Giorno</span><input type="date" required value={data.requested_date ?? ""} onChange={(event) => set("requested_date", event.target.value)} /></label> : null}

        <ChoiceGroup label="In che momento?" name="time_window" value={data.time_window} options={Object.entries(windows).map(([value, label]) => ({ value, label }))} onChange={(value) => set("time_window", value as RequestInput["time_window"])} />
        <label className={styles.textField}><span>Orario preferito <small>(facoltativo)</small></span><input maxLength={100} placeholder="Verso le 20:00" value={data.preferred_time_text} onChange={(event) => set("preferred_time_text", event.target.value)} /></label>

        <ChoiceGroup label="Che livello?" name="level" value={data.level} options={Object.entries(levels).map(([value, label]) => ({ value, label }))} onChange={(value) => set("level", value as RequestInput["level"])} />

        {isPlay ? <>
          <MultiChoiceGroup label="Che tipo di partita?" name="match_type" value={data.match_type ?? []} options={Object.entries(matchTypes).map(([value, label]) => ({ value, label }))} exclusiveValue="any" onChange={(value) => set("match_type", value as RequestInput["match_type"])} />
          <ChoiceGroup label="Con chi cerchi la partita?" name="group_size" value={String(data.group_size)} options={[{ value: "1", label: "Sono da solo" }, { value: "2", label: "Siamo in 2" }, { value: "3", label: "Siamo in 3" }]} required onChange={(value) => { const size=Number(value) as 1|2|3; setData(current=>({...current,group_size:size,required_player_side:size===3?current.required_player_side:null})); }} />
          {data.group_size===3?<ChoiceGroup label="Che giocatore vi manca?" name="required_player_side" value={data.required_player_side??""} options={playingSides.map(value=>({value,label:playingSideLabels[value]}))} required onChange={(value)=>set("required_player_side",value as PlayingSide)}/>:null}
          <ChoiceGroup label="Lato di gioco" name="playing_side" value={data.playing_side ?? ""} options={playingSides.map(value => ({ value, label: playingSideLabels[value] }))} required onChange={(value) => { sideTouched.current = true; set("playing_side", value as PlayingSide); }} />
        </> : <>
          <ChoiceGroup label="Lato di gioco" name="playing_side" value={data.playing_side ?? ""} options={playingSides.map(value => ({ value, label: playingSideLabels[value] }))} required onChange={(value) => { sideTouched.current = true; set("playing_side", value as PlayingSide); }} />
          <MultiChoiceGroup label="Che tipo di allenamento?" name="training_type" value={data.training_type ?? []} options={Object.entries(trainingTypes).map(([value, label]) => ({ value, label }))} exclusiveValue="advice" onChange={(value) => set("training_type", value as RequestInput["training_type"])} />
          <MultiChoiceGroup label="Quali sono i tuoi obiettivi?" name="training_goal" value={data.training_goal ?? []} options={Object.entries(goals).map(([value, label]) => ({ value, label }))} onChange={(value) => set("training_goal", value as RequestInput["training_goal"])} />
        </>}

        <label className={styles.notesField}>
          <span>Note <small>(facoltative)</small></span>
          <textarea rows={4} maxLength={1000} placeholder="Preferenze, disponibilità o indicazioni particolari…" value={data.notes} onChange={(event) => set("notes", event.target.value)} />
          <small className={styles.counter}>{data.notes.length}/1000</small>
        </label>

        {error ? <div className={styles.error} role="alert"><span>{error}</span>{login ? <Link href="/accedi">Accedi a MOVI</Link> : null}</div> : null}
        <PublicButton className={`${styles.submit} ${isPlay ? styles.submitPlay : styles.submitTrain}`} type="submit" loading={busy}>{isPlay ? "Trova la mia partita" : "Trova il mio allenamento"}</PublicButton>
      </form>}
    </PublicModal>
  </main>;
}
