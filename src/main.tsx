import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import ConsentGate from './components/legal/ConsentGate.tsx'
import HealthConsentPrompt from './components/legal/HealthConsentPrompt.tsx'
import './index.css'
import './styles/screens.css' 
import { startRangeFill } from './utils/rangeFill.ts'

startRangeFill()

// DEV only: ?devices=1 shows the site at phone / tablet / laptop sizes.
// (import.meta.env.DEV is false in production builds, so this is dropped.)
const showDevices = import.meta.env.DEV && new URLSearchParams(window.location.search).has('devices')

async function start() {
  const root = ReactDOM.createRoot(document.getElementById('root')!)
  if (showDevices) {
    const { default: DeviceCheck } = await import('./dev/DeviceCheck.tsx')
    root.render(<DeviceCheck />)
    return
  }
  root.render(
    <React.StrictMode>
      <App />
      <ConsentGate />
      <HealthConsentPrompt />
    </React.StrictMode>,
  )
}
void start()
