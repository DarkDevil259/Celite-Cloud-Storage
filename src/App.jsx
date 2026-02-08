import { useState, useEffect } from 'react'
import { supabase } from './lib/api'
import Login from './components/Login'
import Dashboard from './components/Dashboard'

function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    // Check for existing session on mount
    useEffect(() => {
        // Check if supabase is properly configured
        if (!supabase) {
            setError('Supabase is not configured. Please check your .env file has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
            setLoading(false)
            return
        }

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setUser({
                    email: session.user.email,
                    name: session.user.email.split('@')[0],
                    id: session.user.id
                })
                setIsLoggedIn(true)
            }
            setLoading(false)
        }).catch(err => {
            console.error('Session error:', err)
            setError('Failed to connect to authentication service.')
            setLoading(false)
        })

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session) {
                setUser({
                    email: session.user.email,
                    name: session.user.email.split('@')[0],
                    id: session.user.id
                })
                setIsLoggedIn(true)
            } else {
                setUser(null)
                setIsLoggedIn(false)
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    const handleLogin = (userData) => {
        setUser(userData)
        setIsLoggedIn(true)
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        setUser(null)
        setIsLoggedIn(false)
    }

    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <div className="spinner"></div>
        </div>
    }

    if (error) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                backgroundColor: '#f8fafc',
                padding: '20px'
            }}>
                <div style={{
                    backgroundColor: '#fff',
                    borderRadius: '16px',
                    padding: '40px',
                    maxWidth: '500px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    textAlign: 'center'
                }}>
                    <h1 style={{ color: '#ef4444', marginBottom: '16px', fontSize: '1.5rem' }}>
                        Configuration Error
                    </h1>
                    <p style={{ color: '#64748b', marginBottom: '24px', lineHeight: '1.6' }}>
                        {error}
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
                            color: 'white',
                            border: 'none',
                            padding: '12px 24px',
                            borderRadius: '8px',
                            fontWeight: '600',
                            cursor: 'pointer'
                        }}
                    >
                        Retry
                    </button>
                </div>
            </div>
        )
    }



    return (
        <>
            {isLoggedIn ? (
                <Dashboard user={user} onLogout={handleLogout} />
            ) : (
                <Login onLogin={handleLogin} />
            )}
        </>
    )
}

export default App
