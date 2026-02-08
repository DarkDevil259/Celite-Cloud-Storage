import React from 'react'

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null }
    }

    static getDerivedStateFromError(error) {
        return { hasError: true }
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo })
        console.error('ErrorBoundary caught an error:', error, errorInfo)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f8fafc',
                    padding: '20px'
                }}>
                    <div style={{
                        backgroundColor: '#fff',
                        borderRadius: '16px',
                        padding: '40px',
                        maxWidth: '600px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                        textAlign: 'center'
                    }}>
                        <h1 style={{
                            color: '#ef4444',
                            marginBottom: '16px',
                            fontSize: '1.5rem',
                            fontWeight: '600'
                        }}>
                            Something went wrong
                        </h1>
                        <p style={{
                            color: '#64748b',
                            marginBottom: '24px',
                            lineHeight: '1.6'
                        }}>
                            The application encountered an error. Please try refreshing the page.
                        </p>
                        {this.state.error && (
                            <details style={{
                                textAlign: 'left',
                                backgroundColor: '#fef2f2',
                                padding: '16px',
                                borderRadius: '8px',
                                marginBottom: '24px'
                            }}>
                                <summary style={{
                                    cursor: 'pointer',
                                    fontWeight: '500',
                                    color: '#dc2626',
                                    marginBottom: '8px'
                                }}>
                                    Error Details
                                </summary>
                                <pre style={{
                                    overflow: 'auto',
                                    fontSize: '12px',
                                    color: '#7f1d1d',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word'
                                }}>
                                    {this.state.error.toString()}
                                    {this.state.errorInfo?.componentStack}
                                </pre>
                            </details>
                        )}
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
                            Refresh Page
                        </button>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary
