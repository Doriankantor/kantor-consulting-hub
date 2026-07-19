/**
 * TodoStepRail.jsx — REFERENCE PROTOTYPE for the Kantor Consulting Hub /todo overhaul.
 *
 * This is a design reference, NOT production code. It uses local useState and seeded
 * data. Port the *behavior* (StepRail, urgency engine, tab logic, promotion strips,
 * completed section, assign dialog) and wire it to real IPC + theme tokens.
 *
 * See STEP_RAIL_IMPLEMENTATION_PROMPT.md for the full spec.
 */
import React, { useState, useRef, useLayoutEffect, useMemo } from "react";
import {
  Star, Bell, Calendar as CalIcon, Repeat, Paperclip, Plus, Check, X, List,
  ChevronRight, ArrowRight, Target, UserPlus,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * URGENCY ENGINE — computed off due date. Drives promotion, banding,
 * chip color, and calendar color. Single source of truth for "how hot".
 * ------------------------------------------------------------------ */
export const TODAY = new Date(2026, 6, 11); // prototype: replace with startOfDay(new Date())

export function daysUntil(due) {
  if (!due) return null;
  const d = new Date(due + "T00:00:00");
  return Math.round((d - TODAY) / 86400000);
}

export function urgency(due) {
  const n = daysUntil(due);
  if (n === null) return { k: "none",     label: "No date",       short: null };
  if (n < 0)      return { k: "pastdue",  label: "Past due",      short: "Past due" };
  if (n === 0)    return { k: "today",    label: "Due today",     short: "Today" };
  if (n === 1)    return { k: "tomorrow", label: "Due tomorrow",  short: "Tomorrow" };
  if (n === 2)    return { k: "d2",       label: "2 days to go",  short: "2 days" };
  if (n === 3)    return { k: "d3",       label: "3 days to go",  short: "3 days" };
  return { k: "later", label: "Later", short: null };
}

export const URGENCY_RANK = { pastdue: 0, today: 1, tomorrow: 2, d2: 3, d3: 4, later: 5, none: 6 };
/** Bands that get promoted to the pinned strip at the top of every tab. */
export const PROMOTED = ["pastdue", "today"];

/* ------------------------------------------------------------------ *
 * TABS — KC is a SUPERSET: firm work + what's assigned to me.
 * ------------------------------------------------------------------ */
export const TABS = [
  { id: "kc",       name: "KC tasks" },       // meetings + intel + deadlines + assigned
  { id: "assigned", name: "Assigned to me" }, // subset of KC
  { id: "my",       name: "Personal" },       // private, per user
  { id: "all",      name: "All tasks" },
];

/** source: 'personal' | 'assigned' | 'kc-meeting' | 'kc-intel' | 'kc-deadline' */
export const inTab = (t, id) =>
  id === "all" ? true
  : id === "kc" ? (t.source.startsWith("kc") || t.source === "assigned")
  : t.source === id;

/* ---- prototype data ---- */
const uid = (() => { let n = 0; return () => `id${++n}`; })();
const S = (text, done = false) => ({ id: uid(), text, done });

const seed = [
  { title: "Renew residence permit (Essen)", source: "personal", due: null, steps: [
      S("Book Ausländerbehörde slot"), S("Gather documents"), S("Passport photos"), S("Submit") ] },
  { title: "Book flights to Bogotá", source: "personal", due: "2026-07-20", steps: [
      S("Compare fares"), S("Confirm dates with Johan"), S("Book") ] },
  { title: "Grocery run", source: "personal", due: null, steps: [] },
  { title: "Call Johan re: sublease", source: "personal", due: "2026-07-11", steps: [] },
  { title: "Reply to Annegret (Preply invoice)", source: "personal", due: "2026-07-09", steps: [] },
  { title: "Fact-check Strait of Hormuz figures", source: "assigned", assignedBy: "Admin", due: "2026-07-11",
    steps: [ S("Verify shipping data"), S("Cross-check CELAC credit line") ] },
  { title: "Update Hollow Border draft", source: "assigned", assignedBy: "Leo", due: "2026-07-13", steps: [] },
  { title: "Review co-author edits", source: "assigned", assignedBy: "Daniel", due: "2026-07-10", steps: [] },
  { title: "KC partner sync (Leo, Daniel)", source: "kc-meeting", due: "2026-07-12", time: "10:00", steps: [] },
  { title: "Javeriana thesis defense — Daniela Acosta", source: "kc-meeting", due: "2026-07-14", time: "16:00", steps: [] },
  { title: "Intelligence culling — LATAM drone monitor", source: "kc-intel", assignedBy: "Admin", due: "2026-07-11", steps: [] },
  { title: "Q3 client briefing deliverable", source: "kc-deadline", due: "2026-07-13", steps: [
      S("Pull Q2 engagements", true), S("Draft narrative"), S("Add metrics"), S("Design pass"), S("Send to review") ] },
  { title: "El Espectador submission", source: "kc-deadline", due: "2026-07-14", steps: [
      S("Final edit"), S("Spanish translation"), S("Submit") ] },
  { title: "Send Q2 invoices", source: "personal", due: "2026-07-08", done: true, completedAt: Date.now() - 3.6e6,
    steps: [ S("Preply", true), S("El Espectador", true), S("Javeriana", true) ] },
  { title: "Pottery Barn op-ed final read", source: "assigned", assignedBy: "Daniel", due: "2026-07-09",
    done: true, completedAt: Date.now() - 9e6, steps: [] },
].map(t => ({ id: uid(), starred: false, done: false, completedAt: null, ...t }));

/* ------------------------------------------------------------------ *
 * STEP RAIL
 * Done steps collect LEFT (contiguous fill), pending follow — each group
 * keeps original order. Reorder is a RENDER concern; never reorder rows in
 * the DB on toggle (only explicit drag-reorder rewrites `position`).
 * ------------------------------------------------------------------ */
export const railOrder = (steps) => [...steps.filter(s => s.done), ...steps.filter(s => !s.done)];

/** labelMode: 'all' (<=4 steps) | 'truncate' (>4, 2-line clamp + tooltip) | 'none' (detail panel meter) */
export function StepRail({ steps, labelMode = "all", onToggle }) {
  const ordered = useMemo(() => railOrder(steps), [steps]);
  const doneCount = steps.filter(s => s.done).length;
  const n = ordered.length;
  const reduce = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const ref = useRef(null);
  const prev = useRef(new Map());

  // FLIP: slide dots to new positions on reorder.
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const nodes = el.querySelectorAll("[data-dot]");
    if (!reduce) {
      nodes.forEach(node => {
        const id = node.getAttribute("data-dot");
        const now = node.getBoundingClientRect();
        const was = prev.current.get(id);
        if (was) {
          const dx = was.left - now.left;
          if (Math.abs(dx) > 1) {
            node.animate([{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }],
              { duration: 420, easing: "cubic-bezier(.4,0,.2,1)" });
          }
        }
      });
    }
    const next = new Map();
    nodes.forEach(nd => next.set(nd.getAttribute("data-dot"), nd.getBoundingClientRect()));
    prev.current = next;
  });

  if (n === 0) return null;
  const fill = doneCount === 0 ? 0 : n === 1 ? 100 : ((doneCount - 1) / (n - 1)) * 100;
  const showLabel = labelMode === "all" || labelMode === "truncate";

  return (
    <div className="rail" onClick={e => e.stopPropagation()}>
      <span className="rail-count">{doneCount} of {n}</span>
      <div className="rail-track">
        <div className="rail-fill" style={{ width: `${fill}%`, transition: reduce ? "none" : "width .45s cubic-bezier(.4,0,.2,1)" }} />
        <div className="rail-dots" ref={ref}>
          {ordered.map(s => (
            <div className="dot-wrap" data-dot={s.id} key={s.id}>
              <button className={`dot${s.done ? " on" : ""}`} title={s.text}
                onClick={e => { e.stopPropagation(); onToggle(s.id); }}>
                <Check size={9} strokeWidth={3.5} className="chk" />
              </button>
              {showLabel &&
                <span title={s.text}
                  className={`dot-lbl${s.done ? " on" : ""}${labelMode === "truncate" ? " trunc" : ""}`}>
                  {s.text}
                </span>}
            </div>
          ))}
        </div>
      </div>
      <div style={{ height: labelMode === "none" ? 4 : labelMode === "truncate" ? 34 : 30 }} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * APP
 * ------------------------------------------------------------------ */
export default function TodoTab() {
  const [tasks, setTasks] = useState(seed);
  const [tab, setTab] = useState("my");           // opens on Personal (the anchor)
  const [view, setView] = useState("list");        // list | calendar
  const [selId, setSelId] = useState(seed[0].id);
  const [stepDraft, setStepDraft] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [toast, setToast] = useState(null);

  // PROTOTYPE ONLY: real app resolves this from board.assign on board_members.
  const canAssignBoards = ["Subscription Model", "LATAM drone monitor"];
  const isCaptain = canAssignBoards.length > 0;
  const MEMBERS = ["Leo", "Daniel", "Juan Diego", "Felipe", "María José"];
  const [af, setAf] = useState({ board: canAssignBoards[0], who: "Leo", title: "", due: "" });

  const sel = tasks.find(t => t.id === selId) || null;
  const patch = (id, fn) => setTasks(ts => ts.map(t => t.id === id ? fn(t) : t));
  const toggleDone = id => patch(id, x => ({ ...x, done: !x.done, completedAt: !x.done ? Date.now() : null }));
  const toggleStep = (tid, sid) => patch(tid, t => ({ ...t, steps: t.steps.map(s => s.id === sid ? { ...s, done: !s.done } : s) }));
  const addStep = (tid, txt) => { if (!txt.trim()) return; patch(tid, t => ({ ...t, steps: [...t.steps, S(txt.trim())] })); setStepDraft(""); };
  const delStep = (tid, sid) => patch(tid, t => ({ ...t, steps: t.steps.filter(s => s.id !== sid) }));
  const showToast = m => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const active     = tasks.filter(t => !t.done);
  const directives = active.filter(t => t.source === "kc-intel");
  const pastdue    = active.filter(t => t.source !== "kc-intel" && urgency(t.due).k === "pastdue");
  const dueToday   = active.filter(t => t.source !== "kc-intel" && urgency(t.due).k === "today");

  const bodyItems = active.filter(t =>
    inTab(t, tab) && t.source !== "kc-intel" && !PROMOTED.includes(urgency(t.due).k));
  const doneItems = tasks.filter(t => t.done && inTab(t, tab))
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  const bands = useMemo(() => {
    const map = {};
    bodyItems.forEach(t => { const k = urgency(t.due).k; (map[k] = map[k] || []).push(t); });
    return Object.keys(map).sort((a, b) => URGENCY_RANK[a] - URGENCY_RANK[b])
      .map(k => ({ k, label: urgency(map[k][0].due).label, items: map[k] }));
  }, [bodyItems]);

  const sourcePill = t =>
    t.source.startsWith("kc") ? <span className="pill kc">KC</span>
    : t.source === "assigned" ? <span className="pill assigned">Assigned</span>
    : <span className="pill">Personal</span>;

  const Card = ({ t, extra }) => {
    const u = urgency(t.due);
    return (
      <div className={`card${selId === t.id ? " sel" : ""}${extra || ""}`} onClick={() => setSelId(t.id)}>
        <div className="card-top">
          <div className={`tick${t.done ? " on" : ""}`} onClick={e => { e.stopPropagation(); toggleDone(t.id); }}>
            {t.done && <Check size={12} strokeWidth={3} />}
          </div>
          <div className={`card-title${t.done ? " done" : ""}`}>{t.title}</div>
          {t.source === "kc-meeting" ? <span className="meet">Meeting {t.time}</span> : sourcePill(t)}
          {u.short && !t.done && <span className={`chip ${u.k}`}>{u.short}</span>}
          <Star size={17} className={`star${t.starred ? " on" : ""}`} fill={t.starred ? "currentColor" : "none"}
            onClick={e => { e.stopPropagation(); patch(t.id, x => ({ ...x, starred: !x.starred })); }} />
        </div>
        <StepRail steps={t.steps} labelMode={t.steps.length <= 4 ? "all" : "truncate"}
          onToggle={sid => toggleStep(t.id, sid)} />
      </div>
    );
  };

  return (
    <div className="todo">
      {toast && <div className="toast">{toast}</div>}

      {/* ---- ASSIGN DIALOG — gated on board.assign ---- */}
      {assignOpen && (
        <div className="modal-bg" onClick={() => setAssignOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Assign to others</h3>
            <div className="msub">You can assign on boards where you hold the assign permission.</div>
            <div className="fld"><label>Board</label>
              <select value={af.board} onChange={e => setAf({ ...af, board: e.target.value })}>
                {canAssignBoards.map(b => <option key={b}>{b}</option>)}
              </select></div>
            <div className="fld"><label>Assignee</label>
              <select value={af.who} onChange={e => setAf({ ...af, who: e.target.value })}>
                {MEMBERS.map(m => <option key={m}>{m}</option>)}
              </select></div>
            <div className="fld"><label>Task</label>
              <input placeholder="What needs doing?" value={af.title}
                onChange={e => setAf({ ...af, title: e.target.value })} /></div>
            <div className="fld"><label>Due date (optional)</label>
              <input type="date" value={af.due} onChange={e => setAf({ ...af, due: e.target.value })} /></div>
            <div className="modal-foot">
              <button className="mf-cancel" onClick={() => setAssignOpen(false)}>Cancel</button>
              <button className="mf-go" onClick={() => {
                if (!af.title.trim()) return;
                showToast(`Assigned to ${af.who} · they'll get a notification${af.due ? " · due " + af.due : ""}`);
                setAssignOpen(false); setAf({ ...af, title: "", due: "" });
              }}>Assign</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- HEADER ---- */}
      <div className="todo-head">
        <div className="head-row">
          <div className="head-title">To-Do <span className="count-badge">{active.length}</span></div>
          <div className="head-actions">
            <div className="seg">
              <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}><List size={15} /> List</button>
              <button className={view === "calendar" ? "on" : ""} onClick={() => setView("calendar")}><CalIcon size={15} /> Calendar</button>
            </div>
            {isCaptain &&
              <button className="btn-assign" onClick={() => setAssignOpen(true)}><UserPlus size={16} /> Assign to others</button>}
            <button className="btn-add"><Plus size={16} /> Add personal</button>
          </div>
        </div>
        <div className="tabs">
          {TABS.map(tb => (
            <button key={tb.id} className={`tab${tab === tb.id ? " on" : ""}`} onClick={() => setTab(tb.id)}>
              {tb.name}<span className="tcount">{active.filter(t => inTab(t, tb.id)).length}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ---- BODY ---- */}
      <div className="body">
        {view === "calendar" ? (
          <CalendarView tasks={active} onPick={setSelId} />
        ) : (
          <>
            {/* PINNED: admin-assigned intel culling directives */}
            {directives.map(t => (
              <div className="directive" key={t.id} onClick={() => setSelId(t.id)}>
                <div className="d-t"><Target size={19} />{t.title}</div>
                <div className="d-sub">Assigned by {t.assignedBy} · {urgency(t.due).label.toLowerCase()} · manual news culling required</div>
                <button className="d-go" onClick={e => { e.stopPropagation(); showToast("→ Intelligence · News tab"); }}>
                  Go to Intelligence <ArrowRight size={14} />
                </button>
              </div>
            ))}

            {/* PINNED: cross-source urgency strips */}
            {pastdue.length > 0 && <div className="pin-h red"><Bell size={14} /> Past due · {pastdue.length}</div>}
            {pastdue.sort((a, b) => daysUntil(a.due) - daysUntil(b.due)).map(t => <Card key={t.id} t={t} extra=" l-pastdue" />)}
            {dueToday.length > 0 && <div className="pin-h amber"><Bell size={14} /> Due today · {dueToday.length}</div>}
            {dueToday.map(t => <Card key={t.id} t={t} extra=" l-today" />)}

            {/* TAB BODY — urgency bands */}
            {bands.map(b => (
              <div key={b.k}>
                <div className="grp-h">{b.label}<span className="gc">({b.items.length})</span></div>
                {b.items.map(t => <Card key={t.id} t={t} />)}
              </div>
            ))}

            {/* COMPLETED — collapsed by default, per tab */}
            {doneItems.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <button className="done-h" onClick={() => setShowDone(v => !v)}>
                  <ChevronRight size={14} style={{ transform: showDone ? "rotate(90deg)" : "none", transition: ".15s" }} />
                  Completed <span className="gc">({doneItems.length})</span>
                </button>
                {showDone && doneItems.map(t => <Card key={t.id} t={t} extra=" is-done" />)}
              </div>
            )}
          </>
        )}
      </div>

      {/* ---- DETAIL PANEL ---- */}
      {sel && (
        <aside className="dp" key={sel.id}>
          <div className="dp-scroll">
            <div className="dp-title-row">
              <div className={`tick${sel.done ? " on" : ""}`} onClick={() => toggleDone(sel.id)}>
                {sel.done && <Check size={12} strokeWidth={3} />}
              </div>
              <textarea className="dp-title" rows={2} value={sel.title}
                onChange={e => patch(sel.id, x => ({ ...x, title: e.target.value }))} />
              <Star size={18} className={`star${sel.starred ? " on" : ""}`} fill={sel.starred ? "currentColor" : "none"}
                onClick={() => patch(sel.id, x => ({ ...x, starred: !x.starred }))} />
            </div>
            {sel.assignedBy && <div className="dp-assigned">Assigned by {sel.assignedBy}</div>}

            {/* label-less meter — the list below carries the text */}
            {sel.steps.length > 0 && <StepRail steps={sel.steps} labelMode="none" onToggle={sid => toggleStep(sel.id, sid)} />}

            <div className="step-list">
              {railOrder(sel.steps).map(s => (
                <div className="step-item" key={s.id}>
                  <div className={`tick${s.done ? " on" : ""}`} style={{ width: 18, height: 18 }}
                    onClick={() => toggleStep(sel.id, s.id)}>
                    {s.done && <Check size={11} strokeWidth={3} />}
                  </div>
                  <span className={`step-txt${s.done ? " done" : ""}`}>{s.text}</span>
                  <X size={15} className="step-x" onClick={() => delStep(sel.id, s.id)} />
                </div>
              ))}
              <div className="step-add">
                <Plus size={16} />
                <input placeholder="Add step" value={stepDraft} onChange={e => setStepDraft(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addStep(sel.id, stepDraft)} />
              </div>
            </div>

            {/* NOTE: no "Add to My Day" — the urgency strips replace it. */}
            <div className="dp-opt"><Bell size={17} /> Remind me</div>
            <div className="dp-opt"><CalIcon size={17} /> {sel.due ? `Due ${urgency(sel.due).label.toLowerCase()}` : "Add due date"}</div>
            <div className="dp-opt"><Repeat size={17} /> Repeat</div>
            <div className="dp-opt"><Paperclip size={17} /> Add file</div>
            <div className="dp-opt" style={{ minHeight: 56, alignItems: "flex-start" }}>Add note</div>
          </div>
          <div className="dp-foot"><ChevronRight size={16} /><span>Created yesterday</span></div>
        </aside>
      )}
    </div>
  );
}

/* ---- Calendar: same dated items, colored by urgency ---- */
function CalendarView({ tasks, onPick }) {
  const first = new Date(2026, 6, 1);
  const startDow = (first.getDay() + 6) % 7;
  const days = new Date(2026, 7, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const key = d => `2026-07-${String(d).padStart(2, "0")}`;
  return (
    <div className="cal">
      <div className="cal-title">July 2026</div>
      <div className="cal-grid">
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(w => <div className="cal-wd" key={w}>{w}</div>)}
        {cells.map((d, i) => (
          <div key={i} className={`cal-cell${d ? "" : " out"}${d === 11 ? " today" : ""}`}>
            {d && <div className="cal-day">{d}</div>}
            {d && tasks.filter(t => t.due === key(d)).map(t => (
              <div key={t.id} className={`cal-chip ${urgency(t.due).k}`} title={t.title} onClick={() => onPick(t.id)}>
                {t.title}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
