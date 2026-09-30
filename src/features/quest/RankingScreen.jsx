import { useState } from 'react'
import { getRanking } from '../../api/quest'
import { useAsync } from '../../shared/useAsync'
import { useQuest } from './QuestContext'
import { ErrorBox, Screen, Spinner } from './ui'

const MEDAL = ['🥇', '🥈', '🥉']

export default function RankingScreen() {
  const { slug, token, event } = useQuest()
  const [tab, setTab] = useState('people')
  const { data, error, loading, reload } = useAsync(() => getRanking(slug, token), [slug, token])
  const teamLabel = event.settings.teamLabel

  return (
    <Screen title="Ranking">
      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={tab === 'people'} className={tab === 'people' ? 'on' : ''} onClick={() => setTab('people')}>
          Personas
        </button>
        <button role="tab" aria-selected={tab === 'teams'} className={tab === 'teams' ? 'on' : ''} onClick={() => setTab('teams')}>
          Por {teamLabel}
        </button>
      </div>

      <ErrorBox error={error} retry={reload} />
      {loading && !data && <Spinner />}

      {data && tab === 'people' && (
        <>
          <ol className="ranking">
            {data.participants.map((p) => (
              <li key={p.id} className={p.id === data.me?.id ? 'me' : ''}>
                <span className="pos">{MEDAL[p.rank - 1] ?? p.rank}</span>
                <span className="who">
                  {p.alias}
                  {p.team && <small>{p.team.shortName || p.team.name}</small>}
                </span>
                <span className="score">{p.xp} XP</span>
              </li>
            ))}
          </ol>
          {data.me && data.me.rank > data.participants.length && (
            <ol className="ranking pinned">
              <li className="me">
                <span className="pos">{data.me.rank}</span>
                <span className="who">{data.me.alias} (tú)</span>
                <span className="score">{data.me.xp} XP</span>
              </li>
            </ol>
          )}
          {!data.participants.length && <p className="empty">Todavía no hay puntos. ¡Sé el primero!</p>}
        </>
      )}

      {data && tab === 'teams' && (
        <>
          <ol className="ranking">
            {data.teams.map((t) => (
              <li key={t.id} className={t.id === data.me?.team?.id ? 'me' : ''}>
                <span className="pos">{MEDAL[t.rank - 1] ?? t.rank}</span>
                <span className="who">
                  {t.name}
                  <small>
                    {t.members} {t.members === 1 ? 'persona' : 'personas'} · {t.completed} retos
                  </small>
                </span>
                <span className="score">{t.xp} XP</span>
              </li>
            ))}
          </ol>
          <p className="muted small center-text">El puntaje de cada {teamLabel} es la suma del XP de sus integrantes.</p>
        </>
      )}
    </Screen>
  )
}
