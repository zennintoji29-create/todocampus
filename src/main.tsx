import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import App from './App'
import './index.css'
import { supabaseConfigured } from './lib/supabase'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#0C1018', border: '1px solid #1A2230',
            color: '#E6EDF5', borderRadius: '10px', fontSize: '13px',
          },
        }}
      />
      {!supabaseConfigured && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          Supabase is not configured — copy <code className="font-mono">.env.example</code> to <code className="font-mono">.env</code>.
        </div>
      )}
    </BrowserRouter>
  </React.StrictMode>,
)
