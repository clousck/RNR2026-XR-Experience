import { createContext, useContext } from 'react'

/**
 * Estado compartido dentro de un evento:
 * { slug, token, event, teams, home: { challenges, me }, refresh, signOut,
 *   queued, refreshQueue }
 */
export const QuestContext = createContext(null)
export const useQuest = () => useContext(QuestContext)
