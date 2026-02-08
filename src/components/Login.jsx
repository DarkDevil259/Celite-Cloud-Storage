import { useState } from 'react'
import { supabase } from '../lib/api'
import './Login.css'

function Login({ onLogin }) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        setIsLoading(true)
        setError('')

        try {
            // Sign in with Supabase
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            })

            if (error) throw error

            // Get user data
            onLogin({
                email: data.user.email,
                name: data.user.email.split('@')[0],
                id: data.user.id
            })
        } catch (err) {
            console.error('Login error:', err)
            setError(err.message || 'Login failed')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="login-container">
            {/* Background Effects */}
            <div className="bg-gradient"></div>
            <div className="bg-orb bg-orb-1"></div>
            <div className="bg-orb bg-orb-2"></div>

            <div className="login-card glass animate-fade-in">
                {/* Logo */}
                <div className="login-header">
                    <div className="logo">
                        <div className="logo-icon">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M19.5 10C19.5 10 19.5 7 16.5 4.5C13.5 2 10 3 8.5 4.5C7 6 6 8 6 10C4 10 2 12 2 14.5C2 17 4 19 6.5 19H18C20.5 19 22 17 22 14.5C22 12 20 10 19.5 10Z" stroke="url(#cloud-gradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <defs>
                                    <linearGradient id="cloud-gradient" x1="2" y1="4" x2="22" y2="19" gradientUnits="userSpaceOnUse">
                                        <stop stopColor="#6366f1" />
                                        <stop offset="1" stopColor="#a855f7" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                        <span className="logo-text">Celite<span className="gradient-text">CloudX</span></span>
                    </div>
                    <p className="login-subtitle">Internal Team Cloud Storage</p>
                </div>

                {/* Login Form */}
                <form onSubmit={handleSubmit} className="login-form">
                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            className="input-field"
                            placeholder="you@company.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            className="input-field"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button type="submit" className="btn btn-primary login-btn" disabled={isLoading}>
                        {isLoading ? (
                            <span className="spinner"></span>
                        ) : (
                            <>
                                Sign In
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                    <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </>
                        )}
                    </button>

                    {error && (
                        <div style={{
                            color: '#ef4444',
                            fontSize: '14px',
                            textAlign: 'center',
                            marginTop: '12px',
                            padding: '8px',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            borderRadius: '6px'
                        }}>
                            {error}
                        </div>
                    )}
                </form>

                <p className="login-footer">
                    Secure access for authorized team members only
                </p>
            </div>
        </div>
    )
}

export default Login
