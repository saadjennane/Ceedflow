import { type Eligibility, type FormField } from '@ceed/shared';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { useAccount } from '../lib/account';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { FormFieldInput } from '../ui/FormField';
import { Icon } from '../ui/Icon';
import '../ui/builder.css';
import '../ui/directory.css';

interface PublicPage {
  id: string;
  name: string;
  intro: string;
  fields: FormField[];
}

interface PublicForm {
  programName: string;
  editionName: string;
  colour: string;
  blockName: string;
  intro: string;
  eligibility: Eligibility;
  channels: { id: string; label: string }[];
  layout: 'single' | 'paged';
  pages: PublicPage[];
  opensAt: string | null;
  closesAt: string | null;
  /** What a latecomer is told, when the team wrote something. */
  closedMessage: string;
  state: 'open' | 'closed' | 'not_open';
}

const isEmpty = (value: unknown) =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);

export function ApplyPage() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  /** The channel the link came through. Empty means we have to ask. */
  const via = params.get('via') ?? '';
  const form = useAsync(() => api.get<PublicForm>(`/api/public/forms/${token}`), token);
  const { me, loading: checkingAccount } = useAccount();

  const [orgId, setOrgId] = useState<string>('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [heardFrom, setHeardFrom] = useState('');

  if (form.loading || checkingAccount) {
    return (
      <div className="public">
        <div className="public-card">
          <div className="public-body">Loading…</div>
        </div>
      </div>
    );
  }

  if (form.error || !form.data) {
    return (
      <Shell>
        <h1>This form is not available</h1>
        <p className="public-intro">{form.error ?? 'The link may be wrong, or the call may have closed.'}</p>
      </Shell>
    );
  }

  const data = form.data;

  /* A call that is shut says so here rather than at the end of a form somebody
     has already filled in. The state was being sent and never read: the page
     rendered the questions, and the refusal only arrived on submit. */
  if (data.state !== 'open') {
    return (
      <Shell colour={data.colour}>
        <h1>{data.programName}</h1>
        <p className="public-intro">
          {data.state === 'not_open'
            ? data.opensAt
              ? `Applications open on ${formatDate(data.opensAt)}.`
              : 'Applications are not open yet.'
            : data.closedMessage ||
              (data.closesAt
                ? `Applications closed on ${formatDate(data.closesAt)}.`
                : 'Applications are closed.')}
        </p>
        <div className="callout">
          <Icon name="clock" size={15} />
          <div>
            {data.state === 'not_open'
              ? data.opensAt
                ? 'Come back on that date — the form will be here.'
                : 'The team has not opened this call yet. It will be here when they do.'
              : 'If you were meant to apply and arrived late, get in touch with the team.'}
          </div>
        </div>
      </Shell>
    );
  }

  /* Applying is done signed in, so the form knows who is filling it — and the
     channel has to survive that detour, or the link stops counting. */
  const here = via ? `/apply/${token}?via=${encodeURIComponent(via)}` : `/apply/${token}`;
  if (!me) {
    return (
      <Shell colour={data.colour}>
        <h1>{data.programName}</h1>
        <p className="public-intro">{data.intro}</p>
        <div className="callout">
          <Icon name="alert" size={15} />
          <div>
            <strong>You apply with an account.</strong> It is what lets you pick up an unfinished form, see where your
            application stands, and apply again next year without retyping anything.
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn primary" to={`/signup?next=${encodeURIComponent(here)}`}>
            Create an account
          </Link>
          <Link className="btn" to={`/login?next=${encodeURIComponent(here)}`}>
            I already have one
          </Link>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell colour={data.colour}>
        <span className="badge ok">
          <Icon name="check" size={13} /> Application received
        </span>
        <h1>{data.programName}</h1>
        <p className="public-intro">{done}</p>
        <Link className="btn" to="/me">
          Back to my space
        </Link>
      </Shell>
    );
  }

  /* A provisional password has to be replaced before anything is sent. */
  if (me.account.mustChangePassword) {
    return (
      <Shell colour={data.colour}>
        <h1>{data.programName}</h1>
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <div>
            <strong>Choose your own password first.</strong> The one you signed in with was set by CEED.
            Replace it and you will come straight back here.
          </div>
        </div>
        <Link className="btn primary" to="/me">
          Choose my password
        </Link>
      </Shell>
    );
  }

  /* An organisation applies, and you may only apply for one you belong to. */
  if (!me.organisations.length) {
    return (
      <Shell colour={data.colour}>
        <h1>{data.programName}</h1>
        <div className="callout">
          <Icon name="alert" size={15} />
          <div>
            <strong>An organisation applies, not a person.</strong> Create your organisation page first — it takes a
            minute, and it is yours from one edition to the next.
          </div>
        </div>
        <Link className="btn primary" to="/me">
          Create my organisation page
        </Link>
      </Shell>
    );
  }

  const applyingAs = orgId || me.organisations[0].record.id;
  const gate = data.eligibility.mode === 'gate';
  const allTicked = data.eligibility.criteria.every((c) => ticked.includes(c.id));
  const blockedByGate = gate && !allTicked;

  const hasEligibility = data.eligibility.criteria.length > 0;
  const paged = data.layout === 'paged' && data.pages.length > 0;
  // Step 0 is who is applying, plus the eligibility list when there is one.
  const steps = paged ? ['Before you start', ...data.pages.map((p) => p.name)] : [];
  const currentPage = paged ? (step === 0 ? null : data.pages[step - 1]) : null;
  const last = !paged || step === steps.length - 1;

  const setAnswer = (id: string, value: unknown) => {
    setValues((v) => ({ ...v, [id]: value }));
    setErrors((e) => {
      if (!e[`answers.${id}`]) return e;
      const { [`answers.${id}`]: _removed, ...rest } = e;
      return rest;
    });
  };

  const checkStep = (): Record<string, string> => {
    const found: Record<string, string> = {};
    const fields = paged ? (currentPage?.fields ?? []) : data.pages.flatMap((p) => p.fields);
    for (const field of fields) {
      if (field.required && isEmpty(values[field.id])) found[`answers.${field.id}`] = 'This answer is required.';
    }
    return found;
  };

  const next = () => {
    const found = checkStep();
    setErrors(found);
    if (Object.keys(found).length) return;
    setStep((s) => s + 1);
    window.scrollTo({ top: 0 });
  };

  const submit = async () => {
    const found = checkStep();
    setErrors(found);
    if (Object.keys(found).length) return;
    setSending(true);
    try {
      const result = await api.post<{ confirmation: string }>(`/api/public/forms/${token}`, {
        orgId: applyingAs,
        source: via || heardFrom,
        acknowledged: ticked,
        answers: values,
      });
      setDone(result.confirmation);
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setErrors(err.fields);
        if (paged) {
          const bad = Object.keys(err.fields)
            .filter((k) => k.startsWith('answers.'))
            .map((k) => k.slice('answers.'.length));
          const at = data.pages.findIndex((p) => p.fields.some((f) => bad.includes(f.id)));
          if (at >= 0) setStep(at + 1);
        }
      } else {
        setErrors({ _: (err as Error).message });
      }
    } finally {
      setSending(false);
    }
  };

  const start = (
    <>
      <h3 className="section-title">Who is applying</h3>
      {me.organisations.length > 1 ? (
        <div className="field">
          <label>Organisation</label>
          <select className="input" value={applyingAs} onChange={(e) => setOrgId(e.target.value)}>
            {me.organisations.map((o) => (
              <option key={o.record.id} value={o.record.id}>
                {o.record.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="rowcard link-row">
          <span className="rec-mark">
            {me.organisations[0].record.name
              .split(/\s+/)
              .map((w) => w[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </span>
          <span style={{ flex: 1 }}>
            <strong style={{ fontSize: 13 }}>{me.organisations[0].record.name}</strong>
            <span className="faint" style={{ display: 'block', fontSize: 12 }}>
              {me.record.name} · {me.account.email}
            </span>
          </span>
        </div>
      )}

      {/* A tagged link already answered this. Only the bare one has to ask. */}
      {!via && data.channels.length > 0 && (
        <div className="field">
          <label>How did you hear about {data.programName}?</label>
          <div className="pick-list">
            {data.channels.map((channel) => (
              <button
                type="button"
                key={channel.id}
                className={heardFrom === channel.id ? 'pick on' : 'pick'}
                onClick={() => setHeardFrom(heardFrom === channel.id ? '' : channel.id)}
              >
                <Icon name={heardFrom === channel.id ? 'check' : 'square'} />
                <div>
                  <strong>{channel.label}</strong>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {hasEligibility && (
        <>
          <h3 className="section-title">Before you start</h3>
          <p className="faint" style={{ margin: '0 0 8px', fontSize: 12.5 }}>
            {gate
              ? 'Every line has to be true to apply to this call.'
              : 'What this call is looking for. Tick what applies to you.'}
          </p>
          <div className="rows">
            {data.eligibility.criteria.map((c) => (
              <label className="check rowcard" style={{ padding: '10px 12px' }} key={c.id}>
                <input
                  type="checkbox"
                  checked={ticked.includes(c.id)}
                  onChange={(e) => setTicked((t) => (e.target.checked ? [...t, c.id] : t.filter((x) => x !== c.id)))}
                />
                <span style={{ fontSize: 13 }}>{c.label}</span>
              </label>
            ))}
          </div>
          {blockedByGate && (
            <div className="callout warn">
              <Icon name="alert" size={15} />
              This call is only open to organisations that meet every criterion above.
            </div>
          )}
        </>
      )}
    </>
  );

  const fieldsOf = (page: PublicPage) =>
    page.fields.map((field) => (
      <FormFieldInput
        key={field.id}
        field={field}
        value={values[field.id]}
        onChange={(v) => setAnswer(field.id, v)}
        error={errors[`answers.${field.id}`]}
      />
    ));

  return (
    <div className="public">
      <div className="public-card">
        <div className="public-top" style={{ background: `linear-gradient(90deg, ${data.colour}, ${data.colour}55)` }} />
        <div className="public-body">
          <div className="eyebrow">{data.editionName}</div>
          <h1>{data.programName}</h1>
          {data.intro && <p className="public-intro">{data.intro}</p>}

          {data.closesAt && (
            <span className="badge warn">
              <Icon name="clock" size={13} /> Closes {formatDate(data.closesAt)}
            </span>
          )}

          {paged && (
            <div className="steps">
              {steps.map((name, i) => (
                <span className={i === step ? 'step on' : i < step ? 'step done' : 'step'} key={name}>
                  <span className="step-n">{i + 1}</span>
                  {name}
                </span>
              ))}
            </div>
          )}

          {errors._ && (
            <div className="callout warn">
              <Icon name="alert" size={15} /> {errors._}
            </div>
          )}

          {paged ? (
            step === 0 ? (
              start
            ) : (
              <>
                <h3 className="section-title">{currentPage!.name}</h3>
                {currentPage!.intro && (
                  <p className="faint" style={{ margin: '0 0 10px', fontSize: 12.5 }}>
                    {currentPage!.intro}
                  </p>
                )}
                {fieldsOf(currentPage!)}
              </>
            )
          ) : (
            <>
              {start}
              {data.pages.map((page) => (
                <div key={page.id}>
                  {page.intro && (
                    <p className="faint" style={{ margin: '0 0 10px', fontSize: 12.5 }}>
                      {page.intro}
                    </p>
                  )}
                  {fieldsOf(page)}
                </div>
              ))}
            </>
          )}

          <div className="row" style={{ marginTop: 16 }}>
            {paged && step > 0 && (
              <button className="btn" onClick={() => setStep((s) => s - 1)}>
                Back
              </button>
            )}
            <div className="spacer" />
            {last ? (
              <button className="btn primary" disabled={sending || blockedByGate} onClick={submit}>
                {sending ? 'Sending…' : 'Send my application'}
              </button>
            ) : (
              /* A gate holds the form shut: there is no way past this step. */
              !blockedByGate && (
                <button className="btn primary" onClick={next}>
                  Continue <Icon name="arrowRight" size={14} />
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Shell({ children, colour }: { children: React.ReactNode; colour?: string }) {
  return (
    <div className="public">
      <div className="public-card">
        <div className="public-top" style={colour ? { background: colour } : undefined} />
        <div className="public-body stack" style={{ gap: 14 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

