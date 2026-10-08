import {
  contactProblemsIn,
  itemComplete,
  itemUnfinished,
  longDate,
  type DeliverableConfig,
  type DeliverableItem,
} from '@ceed/shared';
import { useEffect, useRef, useState } from 'react';
import { useLang } from '../../lib/lang';
import { api } from '../../lib/api';
import { forget, remember, stranded } from './drafts';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { DeliverableItemInput } from '../../ui/DeliverableItemInput';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Overlays';

/**
 * Le temps qu'on laisse à quelqu'un de finir son mot.
 *
 * Assez long pour qu'une phrase ne parte pas en trente requêtes, assez court
 * pour que fermer l'onglet juste après avoir tapé ne perde rien — et de toute
 * façon ce qui est en attente part aussi quand la page se ferme.
 */
const PAUSE = 700;

/** Ce qui s'écrit lettre à lettre, et mérite donc d'attendre la fin du mot. */
const holds = (value: unknown): boolean => typeof value === 'string';

export interface Owed {
  block: { id: string; name: string };
  config: DeliverableConfig;
  open: boolean;
  returns: {
    itemId: string;
    value: unknown;
    state: 'received' | 'accepted' | 'rejected';
    reason: string;
    returnedAt: string | null;
  }[];
}

/**
 * What a startup still owes, on its own page.
 *
 * Saved item by item as each one is answered rather than behind a Submit at
 * the bottom. A due diligence is gathered over days — a document found this
 * morning, a figure asked of an accountant next week — and a form that only
 * counts when it is whole would have everybody waiting on their slowest piece.
 */
export function OwedItems({
  candidateId,
  orgName,
  given,
  readOnly = false,
  startOpen = false,
}: {
  candidateId: string;
  orgName: string;
  /** Already fetched — how CEED looks at somebody else's page without being them. */
  given?: Owed[];
  readOnly?: boolean;
  /* Déplié d'emblée là où la liste est la page : sur l'onglet « À faire » d'un
     programme, le pli serait un clic pour arriver là où l'on est déjà. */
  startOpen?: boolean;
}) {
  const owed = useAsync(
    async () => given ?? api.get<Owed[]>(`/api/me/deliverables/${candidateId}`),
    `${candidateId}:${given ? 'given' : 'mine'}`,
  );
  const toast = useToast();

  if (!owed.data?.length) return null;

  const save = async (blockId: string, itemId: string, value: unknown, leaving = false) => {
    /* En partant, on n'attend plus rien et on ne redessine rien : la page est
       en train de disparaître. `keepalive` demande au navigateur de laisser
       partir la requête malgré ça — c'est fait pour ce moment-là, et c'est la
       seule façon qu'une réponse tapée à la dernière seconde arrive. */
    if (leaving) {
      try {
        await fetch(`/api/me/deliverables/${candidateId}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ blockId, itemId, value }),
          keepalive: true,
        });
        forget(candidateId, blockId, itemId);
      } catch {
        /* Gardé dans le navigateur : on le remettra dans le champ au retour. */
      }
      return;
    }
    try {
      const next = await api.post<Owed[]>(`/api/me/deliverables/${candidateId}`, { blockId, itemId, value });
      forget(candidateId, blockId, itemId);
      owed.set(next);
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  return (
    <>
      {owed.data.map((ask) => (
        <OwedList
          key={ask.block.id}
          ask={ask}
          orgName={orgName}
          readOnly={readOnly}
          startOpen={startOpen}
          candidateId={candidateId}
          onSave={(itemId, value, leaving) => save(ask.block.id, itemId, value, leaving)}
        />
      ))}
    </>
  );
}

/**
 * One block's list, as the startup reads it.
 *
 * Its own component so the setup screen can show exactly this — the order of
 * the items, their labels, the instruction above them — against a config that
 * has not been saved yet. A preview that redrew the page in its own words
 * would be a preview of nothing.
 */
export function OwedList({
  ask,
  orgName,
  onSave,
  candidateId,
  startOpen = false,
  readOnly = false,
}: {
  ask: Owed;
  orgName: string;
  onSave: (itemId: string, value: unknown, leaving?: boolean) => void | Promise<void>;
  /** Ce qui nomme les brouillons gardés dans ce navigateur. Absent sur l'aperçu. */
  candidateId?: string;
  /** Open from the start, for the preview that exists to show the form. */
  startOpen?: boolean;
  /** Looked at rather than filled in: CEED reading somebody else's page. */
  readOnly?: boolean;
}) {
  const [showing, setShowing] = useState(startOpen);
  const { t } = useLang();
  /**
   * Ce qu'on vient de taper, qui gagne sur ce que le serveur renvoie.
   *
   * Chaque frappe partait en requête, et la réponse — qui porte la valeur
   * telle qu'elle était au départ de *cette* requête — réécrivait le champ.
   * Sur une connexion lente, les lettres disparaissaient à mesure et le
   * curseur sautait : « on dirait que le champ est en lecture seule ». Une
   * startup y a laissé sa dénomination sociale, pendant que d'autres, sur une
   * meilleure ligne, n'ont rien vu.
   *
   * Le texte vit donc ici pendant qu'on écrit, et ne redescend du serveur que
   * pour ce à quoi on n'a pas touché.
   */
  const [typed, setTyped] = useState<Record<string, unknown>>(() =>
    candidateId && !readOnly ? stranded(candidateId, ask.block.id) : {},
  );
  /* Dit une fois, et seulement s'il y avait vraiment quelque chose à rattraper :
     « c'est de retour » sur une page où rien n'avait été perdu inquiéterait
     pour rien. */
  const [recovered] = useState(() => Object.keys(candidateId && !readOnly ? stranded(candidateId, ask.block.id) : {}));
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  /** Les envois promis et pas encore partis, pour les lâcher en quittant. */
  const pending = useRef<Record<string, (leaving?: boolean) => void>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  /* Ce qui est en attente part quand même si la page se ferme : une réponse
     écrite puis abandonnée en fermant l'onglet serait pire que pas de champ. */
  /**
   * Partir, c'est encore écrire.
   *
   * `visibilitychange` attrape l'onglet qu'on quitte et le téléphone qu'on
   * verrouille ; `pagehide` attrape la fermeture et la navigation, là où
   * `beforeunload` n'est jamais appelé sur un mobile. Les deux peuvent tomber
   * l'un après l'autre : ce qui est déjà parti ne repart pas.
   */
  /* Repartir tout seul : ce qui a été remis dans le champ doit finir par
     arriver, sans demander à personne d'y retoucher. */
  useEffect(() => {
    if (!candidateId) return;
    for (const [itemId, value] of Object.entries(stranded(candidateId, ask.block.id))) {
      void onSave(itemId, value);
    }
    // Une seule fois, à l'ouverture de la liste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const leave = () => {
      for (const [itemId, flush] of Object.entries(pending.current)) {
        clearTimeout(timers.current[itemId]);
        flush(true);
      }
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') leave();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', leave);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, []);
  const need = ask.config.items.filter((i) => i.required);
  const mineOf = (id: string) => ask.returns.find((r) => r.itemId === id);
  /* What they have sent, over what is asked. That is the only number they can
     act on: a document waiting to be read is not their problem, and showing it
     as missing asked them to send something they had already sent. Whether
     CEED has read it is the colour. */
  const sent = need.filter((i) => itemComplete(i, mineOf(i.id)?.value)).length;
  const read = need.filter((i) => mineOf(i.id)?.state === 'accepted').length;
  /* Said in words rather than left to the count: three associés of whom one
     has no CIN is not "two associés", and a tally there would read as one. */
  const unfinished = ask.config.items
    .map((item) => ({ item, left: itemUnfinished(item, mineOf(item.id)?.value) }))
    .filter((x) => x.left > 0);
  const back = ask.returns.filter((r) => r.state === 'rejected');

  /* Ce qu'on leur demande de faire, en une phrase.
     A founder opens this page to answer one question — have I something to do
     — and the answer has to be the first line, in their own language. The form
     is one click under it rather than unrolled: three programmes with three
     lists would otherwise be a page nobody reads to the end. */
  const left = need.length - sent;
  const closing = ask.config.closesAt ? longDate(ask.config.closesAt) : '';

  /**
   * Écrire : tout de suite à l'écran, après une pause sur le serveur.
   *
   * Un fichier ou un choix n'a pas de pause à attendre — il arrive d'un coup
   * et part d'un coup. Du texte s'écrit lettre à lettre, et chaque lettre
   * n'est pas une réponse : c'est le moment où l'on s'arrête qui en est une.
   */
  const write = (item: DeliverableItem, value: unknown) => {
    const itemId = item.id;
    setTyped((x) => ({ ...x, [itemId]: value }));
    /* Dans le navigateur à la frappe, avant toute requête : c'est la copie qui
       survit à une ligne qui tombe, et elle s'efface dès que le serveur a
       répondu. Ce qui reste est donc exactement ce qui n'est jamais arrivé. */
    if (candidateId) remember(candidateId, ask.block.id, itemId, value);
    clearTimeout(timers.current[itemId]);
    /* Une adresse à moitié tapée est fautive le temps de la taper : l'envoyer
       ferait un refus rouge à chaque pause. Elle reste dans la page et dans le
       navigateur, le champ dit ce qui cloche, et ça part dès que c'en est une. */
    if (Object.keys(contactProblemsIn(item, value)).length) {
      delete pending.current[itemId];
      setSaving((x) => ({ ...x, [itemId]: false }));
      return;
    }
    const send = async (leaving = false) => {
      delete pending.current[itemId];
      /* Tenu jusqu'à ce que le serveur l'ait, pas jusqu'à ce qu'on le lui
         envoie : entre les deux il y a la seconde où l'on ferme l'ordinateur. */
      setSaving((x) => ({ ...x, [itemId]: true }));
      try {
        await onSave(itemId, value, leaving);
      } finally {
        setSaving((x) => ({ ...x, [itemId]: false }));
      }
    };
    if (!holds(value)) return void send();
    setSaving((x) => ({ ...x, [itemId]: true }));
    pending.current[itemId] = (leaving) => void send(leaving);
    timers.current[itemId] = setTimeout(() => void send(), PAUSE);
  };

  return (
    <section className="card card-pad stack" style={{ gap: 12 }}>
      <button
        className="row"
        style={{ gap: 10, width: '100%', textAlign: 'left', background: 'none', border: 0, padding: 0 }}
        aria-expanded={showing}
        onClick={() => setShowing((x) => !x)}
      >
        {/* Coché quand tout est parti : c'est ce qu'un fondateur cherche
            en revenant, et un intitulé ne le dit pas aussi vite qu'un signe. */}
        {left === 0 && need.length > 0 && back.length === 0 ? (
          <span className="done-mark" aria-hidden="true">
            <Icon name="check" size={13} />
          </span>
        ) : (
          <Icon name={showing ? 'chevronDown' : 'chevronRight'} size={15} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontSize: 15, margin: 0 }}>
            {back.length > 0
              ? t('owed.back')
              : left > 0
                ? t('owed.fill')
                : read === need.length
                  ? t('owed.done')
                  : t('owed.reading')}
          </h3>
          <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
            {[ask.block.name, left > 0 && closing ? `${t('owed.before')} ${closing}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <span
          className={read === need.length && need.length > 0 ? 'badge ok num' : 'badge num'}
          title={
            sent < need.length
              ? `${need.length - sent} still to send`
              : read === need.length
                ? 'Everything in, and read'
                : 'Everything in — CEED is reading it'
          }
        >
          {sent}/{need.length}
        </span>
      </button>

      {showing && (
        <>

      {/* Shut: what was sent stays readable, and nothing invites a change the
          server would refuse. */}
      {!ask.open && (
        <div className="callout">
          <Icon name="file" size={15} />
          <div>{t('owed.closed')}</div>
        </div>
      )}

      {ask.config.intro && (
        <div className="callout">
          <Icon name="file" size={15} />
          <div>{ask.config.intro}</div>
        </div>
      )}

      {/* Said once at the top as well as on each item: somebody coming back to
          this page wants to know whether anything is waiting on them before
          reading the whole list. */}
      {/* Said in words, because a count there would read as a tally of
          associés rather than as one associé missing a field. */}
      {unfinished.length > 0 && (
        <div className="callout">
          <Icon name="alert" size={15} />
          <div>
            <strong>Something is half filled in.</strong>{' '}
            {unfinished
              .map((x) => `${x.item.label} — ${x.left} ${x.left === 1 ? 'entry is' : 'entries are'} missing a field`)
              .join(' · ')}
            .
          </div>
        </div>
      )}

      {back.length > 0 && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <div>{t('owed.oneBack')}</div>
        </div>
      )}

      {/* Ce qui n'était jamais parti, remis dans le champ. Dit, parce qu'une
          réponse qui réapparaît sans explication fait douter de ce qu'on lit. */}
      {recovered.length > 0 && (
        <div className="callout">
          <Icon name="edit" size={15} />
          <div>{t('owed.back.unsent')}</div>
        </div>
      )}

      <div className="stack" style={{ gap: 14 }}>
        {ask.config.items.map((item) => {
          const mine = mineOf(item.id);
          return (
            <div key={item.id}>
              <DeliverableItemInput
                item={item}
                value={item.id in typed ? typed[item.id] : (mine?.value ?? null)}
                readOnly={readOnly || !ask.open}
                onChange={(v) => write(item, v)}
              />
              {/* Dit par pièce : avec une écriture différée, le silence se
                  lirait comme une perte. */}
              {saving[item.id] && (
                <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{t('owed.saving')}</div>
              )}
              {/* Said back, because the thing people want to know after sending
                  a document is what became of it. */}
              {mine?.state === 'rejected' ? (
                <div className="callout warn" style={{ marginTop: 5 }}>
                  <Icon name="alert" size={14} />
                  <div style={{ fontSize: 12.5 }}>
                    <strong>{t('owed.again')}</strong> {mine.reason}
                  </div>
                </div>
              ) : mine?.state === 'accepted' ? (
                <div style={{ fontSize: 12, marginTop: 3, color: 'var(--ok)' }}>
                  <Icon name="check" size={12} /> {t('owed.accepted')}
                </div>
              ) : mine?.returnedAt ? (
                <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>
                  {t('owed.waiting')} {formatDate(mine.returnedAt.slice(0, 10))} {t('owed.unread')}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {ask.open && !readOnly && (
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          {t('owed.kept')}
        </p>
      )}
        </>
      )}
    </section>
  );
}
