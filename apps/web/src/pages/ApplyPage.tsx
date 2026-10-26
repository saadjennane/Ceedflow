
import { prefillFor, profileOf } from '@ceed/shared';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { useAccount } from '../lib/account';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { ApplyCard, formShape, type PublicForm } from '../ui/ApplyCard';
import { Icon } from '../ui/Icon';
import '../ui/builder.css';
import '../ui/directory.css';


/** « Une autre organisation » : celle qu'on nomme dans le formulaire. */
const NEW = '__new';

const isEmpty = (value: unknown) =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);

export function ApplyPage() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  /** The channel the link came through. Empty means we have to ask. */
  const via = params.get('via') ?? '';
  const form = useAsync(() => api.get<PublicForm>(`/api/public/forms/${token}`), token);
  const { me, loading: checkingAccount } = useAccount();
  /* Celles de mes organisations qui ont déjà postulé : su en ouvrant le
     formulaire, et non au moment de l'envoyer, après la dernière question. */
  const applied = useAsync(
    async () => (me ? api.get<string[]>(`/api/public/forms/${token}/applied`) : []),
    `${token}:${me?.account.id ?? 'anonymous'}`,
  );

  /* L'organisation choisie parmi les siennes, ou NEW pour celle qu'on nomme ici. */
  const [orgId, setOrgId] = useState<string>('');
  const [newOrg, setNewOrg] = useState({ name: '', website: '' });
  const [ticked, setTicked] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  /* L'organisation nommée existait déjà : la candidature est déposée, et la
     demande pour la rejoindre attend la réponse de son équipe ou de CEED. */
  const [pending, setPending] = useState(false);
  const [heardFrom, setHeardFrom] = useState('');

  if (form.loading || checkingAccount || (me && applied.loading)) {
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
     channel has to survive that detour, or the link stops counting. Every
     detour carries it: the account, the password, the organisation page. */
  const here = via ? `/apply/${token}?via=${encodeURIComponent(via)}` : `/apply/${token}`;
  const detour = `/me?next=${encodeURIComponent(here)}`;
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
        {pending && (
          <div className="callout">
            <Icon name="users" size={15} />
            <div>
              This organisation was already known to CEED, so your request to join its page has been sent to its
              administrators (or to CEED). You will see the organisation and this application in your space once
              it is accepted.
            </div>
          </div>
        )}
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
        <Link className="btn primary" to={detour}>
          Choose my password
        </Link>
      </Shell>
    );
  }

  /* Une organisation postule — mais on ne renvoie plus personne en créer une
     ailleurs. Celles qu'on tient sont proposées, la première déjà choisie ;
     sinon, ou pour une autre, on la nomme ici et elle est créée à l'envoi.
     Le compte individuel est le seul passage obligé. */
  const already = new Set(applied.data ?? []);
  const open = me.organisations.filter((o) => !already.has(o.record.id));
  const notHere = me.organisations.filter((o) => already.has(o.record.id));
  const applyingAs = orgId === NEW ? NEW : open.some((o) => o.record.id === orgId) ? orgId : (open[0]?.record.id ?? NEW);
  const naming = applyingAs === NEW;

  /* Ce que la fiche de l'organisation choisie dit déjà, pour les questions que
     le builder a reliées. Affiché tant que la personne n'y a pas touché : dès
     qu'elle écrit — ou vide la case —, sa réponse gagne. Changer d'organisation
     change ce qui est repris, sans effacer ce qu'elle a tapé. */
  const chosen = naming ? null : me.organisations.find((o) => o.record.id === applyingAs)?.record ?? null;
  const prefilled: Record<string, unknown> = {};
  if (chosen) {
    const profile = profileOf(chosen);
    for (const field of data.pages.flatMap((pg) => pg.fields)) {
      const value = prefillFor(field, profile, chosen.name, 'fr');
      if (value !== undefined) prefilled[field.id] = value;
    }
  }
  const answers = { ...prefilled, ...values };
  const notes = Object.fromEntries(
    Object.keys(prefilled)
      .filter((id) => !(id in values))
      .map((id) => [id, `From ${chosen!.name}’s profile — change it if this call needs something else.`]),
  );
  const { blockedByGate, paged, steps } = formShape(data, ticked);
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
    /* « Qui postule » est en tête du formulaire : c'est là qu'on le vérifie. */
    if (naming && (!paged || step === 0) && !newOrg.name.trim()) found.orgName = 'Tell us which organisation is applying.';
    const fields = paged ? (currentPage?.fields ?? []) : data.pages.flatMap((p) => p.fields);
    for (const field of fields) {
      if (field.required && isEmpty(answers[field.id])) found[`answers.${field.id}`] = 'This answer is required.';
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
      const result = await api.post<{ confirmation: string; pending?: boolean }>(`/api/public/forms/${token}`, {
        orgId: naming ? '' : applyingAs,
        newOrg: naming ? newOrg : null,
        source: via || heardFrom,
        acknowledged: ticked,
        answers,
      });
      setPending(Boolean(result.pending));
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
          /* L'organisation est sur la première étape, avant toute question. */
          if (err.fields.orgName) setStep(0);
          else if (at >= 0) setStep(at + 1);
        }
      } else {
        setErrors({ _: (err as Error).message });
      }
    } finally {
      setSending(false);
    }
  };

  const applicantCard = (
    <div className="stack" style={{ gap: 8 }}>
      {open.length > 0 && (
        <div className="field">
          <label htmlFor="apply-org">Organisation</label>
          <select id="apply-org" className="input" value={applyingAs} onChange={(e) => setOrgId(e.target.value)}>
            {open.map((o) => (
              <option key={o.record.id} value={o.record.id}>
                {o.record.name}
              </option>
            ))}
            <option value={NEW}>Another organisation…</option>
          </select>
        </div>
      )}
      {naming && (
        <>
          <div className="field">
            <label htmlFor="apply-org-name">
              {open.length ? 'Its name' : 'Your organisation'}
              <span style={{ color: 'var(--stop)' }}> *</span>
            </label>
            <input
              id="apply-org-name"
              className="input"
              value={newOrg.name}
              aria-invalid={Boolean(errors.orgName)}
              placeholder="Rafid Tech"
              onChange={(e) => {
                setNewOrg((o) => ({ ...o, name: e.target.value }));
                setErrors(({ orgName: _gone, ...rest }) => rest);
              }}
            />
            {errors.orgName && <div className="err">{errors.orgName}</div>}
          </div>
          <div className="field">
            <label htmlFor="apply-org-site">
              Website <span className="faint" style={{ fontWeight: 400 }}>· optional</span>
            </label>
            <input
              id="apply-org-site"
              className="input"
              value={newOrg.website}
              placeholder="rafid.ma"
              onChange={(e) => setNewOrg((o) => ({ ...o, website: e.target.value }))}
            />
            <div className="hint">Its page is created with your application. You can complete it later, in your space.</div>
          </div>
        </>
      )}
      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        {me.record.name} · {me.account.email}
      </p>
      {/* Nommées, pas cachées : une organisation absente de la liste sans
          explication passe pour un bug. */}
      {notHere.length > 0 && (
        <div className="hint">
          {notHere.map((o) => o.record.name).join(', ')} {notHere.length === 1 ? 'has' : 'have'} already applied to
          this call.
        </div>
      )}
    </div>
  );

  return (
    <ApplyCard
      data={data}
      values={answers}
      notes={notes}
      errors={errors}
      ticked={ticked}
      step={step}
      onAnswer={setAnswer}
      onTick={setTicked}
      heardFrom={heardFrom}
      /* Un lien étiqueté a déjà répondu : on ne le redemande pas. */
      onHeardFrom={via ? undefined : setHeardFrom}
      applicant={applicantCard}
      actions={
        <>
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
        </>
      }
    />
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

