/**
 * « Show only if » : la règle d'une question, réglée dans son éditeur.
 *
 * Une seule règle, sur une question placée avant — on ne dépend jamais d'une
 * réponse pas encore donnée. La valeur se choisit dans les options de cette
 * question : rien à taper, rien à mal orthographier.
 */
import { liveRule, ruleSaid, type FormField, type ShowIf, type ShowIfOp } from '@ceed/shared';

type Parent = Pick<FormField, 'id' | 'label' | 'type' | 'options'>;

const OPS_FOR = (parent: Parent | undefined): { op: ShowIfOp; label: string }[] =>
  parent?.type === 'select'
    ? [{ op: 'is', label: 'is' }, { op: 'is_not', label: 'is not' }, { op: 'answered', label: 'is answered' }, { op: 'empty', label: 'is empty' }]
    : parent?.type === 'multiselect'
      ? [{ op: 'includes', label: 'includes' }, { op: 'is_not', label: 'does not include' }, { op: 'answered', label: 'is answered' }, { op: 'empty', label: 'is empty' }]
      : [{ op: 'answered', label: 'is answered' }, { op: 'empty', label: 'is empty' }];

const needsValue = (op: ShowIfOp) => op === 'is' || op === 'is_not' || op === 'includes';

export function ShowIfSetting({
  field,
  all,
  onChange,
}: {
  field: Pick<FormField, 'id' | 'showIf'>;
  /** Le formulaire entier, dans son ordre : la règle ne vise que ce qui est avant. */
  all: Parent[];
  onChange: (partial: { showIf?: ShowIf }) => void;
}) {
  const at = all.findIndex((f) => f.id === field.id);
  const before = (at < 0 ? all : all.slice(0, at)).filter((f) => f.id !== field.id && f.label.trim());
  const rule = field.showIf;
  const parent = rule ? all.find((f) => f.id === rule.fieldId) : undefined;
  const broken = Boolean(rule) && !liveRule(field, all);
  const ops = OPS_FOR(parent);

  const pickParent = (id: string) => {
    if (!id) return onChange({ showIf: undefined });
    const p = all.find((f) => f.id === id);
    const op = OPS_FOR(p)[0]!.op;
    onChange({ showIf: { fieldId: id, op, value: needsValue(op) ? (p?.options[0] ?? '') : '' } });
  };

  return (
    <div className="field">
      <label>Show only if</label>
      {!before.length && !rule ? (
        <div className="help">The first question always shows — a rule looks at a question before it.</div>
      ) : (
        <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
          <select className="input" style={{ flex: '2 1 180px' }} value={rule?.fieldId ?? ''} onChange={(e) => pickParent(e.target.value)}>
            <option value="">Always show</option>
            {before.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
            {rule && !before.some((f) => f.id === rule.fieldId) && <option value={rule.fieldId}>{parent?.label ?? '(removed question)'}</option>}
          </select>
          {rule && (
            <select
              className="input"
              style={{ flex: '1 1 120px' }}
              value={rule.op}
              onChange={(e) => {
                const op = e.target.value as ShowIfOp;
                onChange({ showIf: { ...rule, op, value: needsValue(op) ? rule.value || (parent?.options[0] ?? '') : '' } });
              }}
            >
              {ops.map((o) => (
                <option key={o.op} value={o.op}>{o.label}</option>
              ))}
            </select>
          )}
          {rule && needsValue(rule.op) && (
            <select className="input" style={{ flex: '1 1 140px' }} value={rule.value} onChange={(e) => onChange({ showIf: { ...rule, value: e.target.value } })}>
              {(parent?.options ?? []).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
              {!parent?.options.includes(rule.value) && <option value={rule.value}>{rule.value || '—'}</option>}
            </select>
          )}
        </div>
      )}
      {broken && (
        <p className="warnline" style={{ margin: '4px 0 0', fontSize: 12 }}>
          This rule no longer holds — the question it looks at was removed, moved after this one, or lost that option. This
          question always shows until you fix it.
        </p>
      )}
    </div>
  );
}

/** Le badge d'une question fermée : sa règle, lue d'un coup d'œil. */
export function ShowIfBadge({ field, all }: { field: Pick<FormField, 'id' | 'showIf'>; all: Parent[] }) {
  if (!field.showIf) return null;
  const broken = !liveRule(field, all);
  return (
    <span className={broken ? 'badge warn' : 'badge info'} title={broken ? 'This rule no longer holds — the question always shows' : 'Shown only when this holds'}>
      {broken ? 'Rule to fix' : ruleSaid(field.showIf, all)}
    </span>
  );
}
