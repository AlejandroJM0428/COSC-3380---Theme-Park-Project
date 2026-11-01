
import { useEffect } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { formatDate } from '../utils/portalFormat.js'
import { BRAND } from '../config/brand.js'

export default function Tickets() {
  const [params] = useSearchParams()
  const location = useLocation()

useEffect(() => {
  if (location.hash === '#ticket-checkout') {
    requestAnimationFrame(() => {
      document.getElementById('ticket-checkout')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    })
  }
}, [location.hash])
  const { user, ready } = useAuth()
  const date = params.get('date')
  const express = params.get('express') === '1'

  if (user?.role === 'Customer') {
    const next = new URLSearchParams({ tab: 'tickets' })
    if (date) next.set('date', date)
    if (express) next.set('express', '1')
    return <Navigate to={`/member?${next.toString()}`} replace />
  }

  if (!ready) return <div className="pub-page" aria-busy="true" />

  const features = [
    {
      icon: '🎢',
      title: 'Park Admission',
      description: 'Discover thrilling rides, family attractions, and unforgettable adventures.',
    },
    {
      icon: '⚡',
      title: 'Express Experience',
      description: 'Explore Express options for eligible attractions.',
    },
    {
      icon: '🎡',
      title: 'Games & Shows',
      description: 'Try carnival midway games, catch a live show, and explore our themed zones.',
    },
  ]

  return (
    <main className="tv-ticket-page">
      <section className="tv-ticket-hero">
        <div className="tv-ticket-hero-content">
          <span className="tv-ticket-eyebrow">{BRAND.name} Tickets</span>
          <h1>YOUR ADVENTURE STARTS HERE!</h1>
          <p>
            Big thrills. Amazing memories. Endless fun.
            Get ready for an unforgettable day at Beltway Park!
          </p>
          <a href="#ticket-options" className="tv-ticket-hero-btn">
            Explore Tickets ↓
          </a>
        </div>
      </section>

      <section id="ticket-options" className="tv-ticket-container">
        <div className="tv-ticket-heading">
          <h2>Plan Your Perfect Adventure</h2>
          <p>Everything you need for an exciting day at the park.</p>
        </div>

        <div className="tv-ticket-grid">
          {features.map((feature) => (
            <article className="tv-ticket-card" key={feature.title}>
              <div className="tv-ticket-icon">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>

        <div id="ticket-checkout" className="tv-ticket-checkout">
          <span className="tv-ticket-eyebrow">READY FOR THE FUN?</span>
          <h2>Get Your Tickets Today!</h2>

          {date && (
            <p>
              Selected date: <strong>{formatDate(date)}</strong>
              {express ? ' · Express selected' : ''}
            </p>
          )}

          <p>
            Sign in to your member account to purchase tickets.
            Guest checkout is coming soon!
          </p>

          <div className="tv-ticket-actions">
            <Link
              to="/member/login"
              className="tv-ticket-signin"
            >
              Sign In to Buy Tickets
            </Link>
            <Link to="/" className="tv-ticket-back">
              Back to Home
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
