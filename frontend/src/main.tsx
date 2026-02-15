import { Buffer } from 'buffer'
import { createRoot } from 'react-dom/client'

// Polyfill Buffer globally for near-api-js and other dependencies
window.Buffer = window.Buffer || Buffer;

import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { Landing, AppPage, Docs } from './pages'
import { Chats } from './pages/Chats'

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<AppPage />} />
      <Route path="/docs" element={<Docs />} />
      <Route path="/chats" element={<Chats />} />
    </Routes>
  </BrowserRouter>
)
