// TEMPORARY — Replace with real Clerk later
import { createContext, useContext } from 'react'

const MockClerkContext = createContext()

export function MockClerkProvider({ children }) {
  const mockUser = {
    id: 'guest_123',
    username: 'guest_user',
    isSignedIn: false
  }

  return (
    <MockClerkContext.Provider value={{ user: mockUser, isSignedIn: false }}>
      {children}
    </MockClerkContext.Provider>
  )
}

export const useMockClerk = () => useContext(MockClerkContext)