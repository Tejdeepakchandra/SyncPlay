import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import { ThemeProvider } from './context/ThemeContext'
import { AppRouter } from './router/AppRouter'

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Optional: Add debug to verify key is loaded
console.log('Clerk Key loaded:', clerkPubKey ? '✅ Present' : '❌ Missing')

function App() {
  return (
    <ClerkProvider publishableKey={clerkPubKey}>
      <BrowserRouter>
        <ThemeProvider>
          <AppRouter />
        </ThemeProvider>
      </BrowserRouter>
    </ClerkProvider>
  )
}

export default App