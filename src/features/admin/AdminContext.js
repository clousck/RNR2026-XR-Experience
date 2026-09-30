import { createContext, useContext } from 'react'

/** { admin, isAdmin, logout } */
export const AdminContext = createContext(null)
export const useAdmin = () => useContext(AdminContext)

/** { event, setEvent, reloadEvent, pending, setPending } del evento abierto en el panel. */
export const EventAdminContext = createContext(null)
export const useEventAdmin = () => useContext(EventAdminContext)
