import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowUp, CalendarPlus, Dumbbell, Sparkles } from 'lucide-react'
import { askCoach, loadCoachFacts } from '@/api/coachChat'

/**
 * The chat coach.
 *
 * The model sees a facts payload built by `buildCoachFacts` and never touches the database,
 * so every number it quotes came from a tested pure function over sets the lifter actually
 * logged. It can create a template and stage exercises into a session; it cannot write a
 * weight, a rep count or an RIR, because those are the lifter's to enter.
 *
 * Facts are recomputed on every send rather than cached — someone can log a set mid
 * conversation, and an answer grounded in a stale payload is wrong in the worst way: it
 * looks right.
 */

// Two questions about their own training, two about training in general — the opening
// screen is where a lifter learns which kinds of thing this can answer.
const STARTERS = [
  'Why has my bench stalled?',
  'Am I doing enough back volume?',
  'Build me a push day',
  'How close to failure should I train?',
]

/** Height of the floating BottomNav, so the composer sits directly on top of it. */
const NAV_H = 62

function ThinkingDots() {
  return (
    <div className="flex items-center gap-[5px] px-1 py-[3px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-[6px] w-[6px] rounded-full bg-[#5F665F]"
          style={{ animation: `coachdot 1.2s ${i * 0.18}s infinite ease-in-out` }}
        />
      ))}
      <style>{`@keyframes coachdot{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}`}</style>
    </div>
  )
}

/**
 * What the coach did, rendered from the tool result rather than from its prose.
 *
 * The card states the action the server actually performed. If the model described creating
 * something the tool never created, the card is what the lifter believes — the same reason
 * the numbers come from the facts payload instead of the model's memory.
 */
function ActionCard({ toolCall, onOpen }) {
  const { name, result } = toolCall
  if (!result?.ok) {
    return (
      <div className="mt-2 flex items-start gap-2 rounded-[14px] border border-[#F2B544]/[0.32] bg-[#F2B544]/[0.06] p-3">
        <AlertTriangle className="mt-[1px] h-[15px] w-[15px] shrink-0 text-[#F2B544]" />
        <div className="text-[12.5px] leading-[1.5] text-[#C7CCC6]">
          {result?.reason ?? 'That did not save.'}
        </div>
      </div>
    )
  }

  const isTemplate = name === 'create_template'
  const Icon = isTemplate ? Dumbbell : CalendarPlus
  const count = result.variantIds?.length ?? 0

  return (
    <button
      onClick={onOpen}
      className="mt-2 flex w-full items-center gap-[10px] rounded-[14px] border border-[#A8C9A2]/[0.28] bg-[#A8C9A2]/[0.05] p-[13px] text-left"
    >
      <Icon className="h-[17px] w-[17px] shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold">
          {isTemplate ? result.template?.name : result.created ? 'Workout started' : 'Added to your workout'}
        </div>
        <div className="mt-[2px] text-[11.5px] text-muted-foreground">
          {count} exercise{count === 1 ? '' : 's'} · tap to open
        </div>
      </div>
    </button>
  )
}

export default function CoachChat() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, sending])

  const openAction = (toolCall) => {
    const { name, result } = toolCall
    if (!result?.ok) return
    if (name === 'create_template' && result.template?.id) navigate(`/template/${result.template.id}`)
    if (name === 'stage_session' && result.session?.id) navigate(`/workout/${result.session.id}`)
  }

  const send = async (text) => {
    const content = String(text ?? '').trim()
    if (!content || sending) return

    setError(null)
    setInput('')
    const history = [...messages, { role: 'user', content }]
    setMessages(history)
    setSending(true)

    try {
      const facts = await loadCoachFacts()
      // Only role/content goes to the model — the action cards are local render state.
      const reply = await askCoach(
        history.map(({ role, content }) => ({ role, content })),
        facts
      )

      if (reply.status !== 'answered') {
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: reply.reason, tone: reply.status === 'capped' ? 'capped' : 'error' },
        ])
        return
      }

      setMessages((m) => [...m, { role: 'assistant', content: reply.text, toolCall: reply.toolCall }])

      // Staging exercises is a request to go and train them, so the session is where the
      // lifter wants to be. Delayed just enough to read the reply that explains why.
      if (reply.toolCall?.name === 'stage_session' && reply.toolCall.result?.ok) {
        const id = reply.toolCall.result.session?.id
        if (id) setTimeout(() => navigate(`/workout/${id}`), 1200)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const empty = messages.length === 0

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="px-[18px] pt-[14px]">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[22px] font-bold tracking-[-0.025em]">Coach</div>
          <button
            onClick={() => navigate('/coach/insights')}
            className="shrink-0 text-[11.5px] font-semibold text-primary"
          >
            Insights
          </button>
        </div>
        <div className="mt-1 text-[12.5px] leading-[1.45] text-muted-foreground">
          Ask about your training or about lifting in general. Anything it says about you comes
          from sets you logged.
        </div>
      </div>

      {error && (
        <div className="mx-[18px] mt-3 rounded-[14px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error}
        </div>
      )}

      <div className="px-[18px] pt-[18px]" style={{ paddingBottom: `${NAV_H + 78}px` }}>
        {empty && (
          <div className="flex flex-col items-start gap-[10px]">
            <div className="flex items-center gap-[7px] text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Sparkles className="h-[15px] w-[15px] text-primary" />
              Try asking
            </div>
            {STARTERS.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="rounded-full border border-border px-[13px] py-[8px] text-left text-[12.5px] text-[#C7CCC6]"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-[14px]">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-[16px] rounded-br-[6px] bg-primary/[0.12] px-[13px] py-[10px] text-[13.5px] leading-[1.55] text-[#ECEFEA]">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex flex-col items-start">
                <div
                  className="max-w-[92%] rounded-[16px] rounded-bl-[6px] border px-[13px] py-[10px] text-[13.5px] leading-[1.6] whitespace-pre-wrap"
                  style={
                    m.tone === 'capped' || m.tone === 'error'
                      ? { borderColor: 'rgba(242,181,68,.32)', background: 'rgba(242,181,68,.06)', color: '#C7CCC6' }
                      : { borderColor: '#272C29', background: '#171A18', color: '#ECEFEA' }
                  }
                >
                  {m.content}
                </div>
                {m.toolCall && (
                  <div className="w-full max-w-[92%]">
                    <ActionCard toolCall={m.toolCall} onOpen={() => openAction(m.toolCall)} />
                  </div>
                )}
              </div>
            )
          )}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-[16px] rounded-bl-[6px] border border-border bg-card px-[11px] py-[10px]">
                <ThinkingDots />
              </div>
            </div>
          )}
        </div>

        <div ref={endRef} />
      </div>

      <div className="fixed inset-x-0 z-20 flex justify-center" style={{ bottom: `calc(var(--safe-bottom) + ${NAV_H}px)` }}>
        <div className="w-full max-w-[440px] border-t border-accent bg-background/[0.92] px-[18px] py-[10px] backdrop-blur-[16px]">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="flex items-end gap-[8px]"
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(input)
                }
              }}
              placeholder="Ask the coach…"
              className="max-h-[120px] flex-1 resize-none rounded-[11px] border border-border bg-card px-[12px] py-[10px] text-[13.5px] text-foreground outline-none placeholder:text-[#5F665F] focus:border-primary/40"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-primary text-[#12160B] disabled:opacity-35"
            >
              <ArrowUp className="h-[18px] w-[18px]" />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
