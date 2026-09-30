import { createContext, useCallback, useContext, useState } from 'react'

const ToastContext = createContext(() => {})

/** Mensajes breves ("+20 XP", "Nuevo reto desbloqueado"). */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const show = useCallback((text, { tone = 'info', ms = 3500 } = {}) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
