import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './HelpPage.css';
import {
  ArrowUpRight,
  CreditCard,
  MessageSquareText,
  Search,
  Server,
  ShieldCheck,
  TrendingUp,
  UserRound,
  Zap,
  X,
  Copy,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { SystemHealthDrawer } from '../../components/workspace/SystemHealthDrawer';
import { Panel, PanelHeader, WorkspacePageFrame } from '../../components/ui/WorkspacePrimitives';
import type { SystemHealthReport } from '../../types';
import { fetchJsonWithTimeout } from '../../services/apiQuery';
import { notifyWorkspace } from '../../lib/workspaceFeedback';
import { useDialogA11y } from '../../lib/useDialogA11y';

type TopicId = 'getting-started' | 'account-profile' | 'deposits-withdrawals' | 'trading-guide' | 'security';

const TOPICS: Array<{
  id: TopicId;
  title: string;
  description: string;
  hint: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Learn the basics and get set up in minutes.',
    hint: 'Open guide',
    icon: Zap,
  },
  {
    id: 'account-profile',
    title: 'Account & Profile',
    description: 'Manage account settings, verification, and preferences.',
    hint: 'Open guide',
    icon: UserRound,
  },
  {
    id: 'deposits-withdrawals',
    title: 'Deposits & Withdrawals',
    description: 'Understand funding methods and processing.',
    hint: 'Open guide',
    icon: CreditCard,
  },
  {
    id: 'trading-guide',
    title: 'Trading Guide',
    description: 'Learn markets, orders, leverage, and risk.',
    hint: 'Open guide',
    icon: TrendingUp,
  },
  {
    id: 'security',
    title: 'Security',
    description: 'Protect your account and funds.',
    hint: 'Open guide',
    icon: ShieldCheck,
  },
];

const FAQS: Array<{ question: string; answer: string; topic: TopicId }> = [
  {
    topic: 'getting-started',
    question: 'How do I create an account on APEX?',
    answer: 'Open Getting Started, complete the onboarding checklist, and verify the account profile before switching to live trading.',
  },
  {
    topic: 'deposits-withdrawals',
    question: 'How do I deposit funds into my account?',
    answer: 'Use the wallet funding route exposed by your connected exchange. Demo balances remain virtual and can be reset from Settings.',
  },
  {
    topic: 'trading-guide',
    question: 'How do I place my first trade?',
    answer: 'Select a market, review the candidate context, then submit a previewed order from the trading or orders workspace with the required confirmation step.',
  },
  {
    topic: 'trading-guide',
    question: 'What are market orders and limit orders?',
    answer: 'Market orders execute against the best available price, while limit orders wait for your specified price before filling.',
  },
  {
    topic: 'security',
    question: 'How do I enable two-factor authentication?',
    answer: 'Open Security and follow the protected verification flow. Credentials stay server-side and are never exposed in the browser.',
  },
];

const TUTORIALS = [
  {
    title: 'Getting Started with APEX',
    description: 'Create your account and set up your profile.',
    duration: '02:45',
    thumbnail: '/tutorial-thumbnails/getting-started.png',
  },
  {
    title: 'How to Place Your First Trade',
    description: 'Step-by-step guide to placing orders.',
    duration: '04:12',
    thumbnail: '/tutorial-thumbnails/first-trade.png',
  },
  {
    title: 'Understanding Your Portfolio',
    description: 'Track performance and balances.',
    duration: '03:18',
    thumbnail: '/tutorial-thumbnails/portfolio.png',
  },
  {
    title: 'Secure Your Account',
    description: 'Enable 2FA and follow best practices.',
    duration: '02:30',
    thumbnail: '/tutorial-thumbnails/security.png',
  },
] as const;

const TUTORIAL_STEPS: Record<(typeof TUTORIALS)[number]['title'], string[]> = {
  'Getting Started with APEX': ['Open Settings and choose Demo mode.', 'Verify the market-data status.', 'Add markets to your Watchlist.', 'Review Strategy and Backtesting before Trading.'],
  'How to Place Your First Trade': ['Select a live market.', 'Review the data-driven setup and risk plan.', 'Preview the order with the configured risk and leverage.', 'Confirm only after reviewing notional and margin.'],
  'Understanding Your Portfolio': ['Connect Demo or verified Live account data.', 'Review equity, available balance, exposure, and open positions.', 'Use History and Analytics for attribution.', 'Reconcile unexpected values before execution.'],
  'Secure Your Account': ['Keep API credentials server-side.', 'Use trade-only keys with withdrawals disabled.', 'Verify origin and session security in Settings.', 'Rotate keys immediately after any suspected exposure.'],
};

const ANNOUNCEMENTS = [
  {
    title: 'Market data monitoring active',
    description: 'Provider health is checked continuously.',
    tone: 'positive',
  },
  {
    title: 'Use Demo before Live',
    description: 'Validate order behavior with virtual funds.',
    tone: 'warning',
  },
  {
    title: 'API security model',
    description: 'Credentials remain in server memory only.',
    tone: 'info',
  },
] as const;

export function HelpPage() {
  const [query, setQuery] = useState('');
  const [healthOpen, setHealthOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<TopicId>('getting-started');
  const [showAllFaqs, setShowAllFaqs] = useState(true);
  const [showAllTutorials, setShowAllTutorials] = useState(true);
  const [activeTutorial, setActiveTutorial] = useState<(typeof TUTORIALS)[number] | null>(null);
  const [supportMode, setSupportMode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [health, setHealth] = useState<SystemHealthReport | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const tutorialCloseRef = useRef<HTMLButtonElement>(null);
  const supportCloseRef = useRef<HTMLButtonElement>(null);
  const closeTutorial = useCallback(() => setActiveTutorial(null), []);
  const closeSupport = useCallback(() => setSupportMode(null), []);
  const tutorialDialogRef = useDialogA11y<HTMLElement>({
    isOpen: Boolean(activeTutorial),
    onClose: closeTutorial,
    initialFocusRef: tutorialCloseRef,
  });
  const supportDialogRef = useDialogA11y<HTMLElement>({
    isOpen: Boolean(supportMode),
    onClose: closeSupport,
    initialFocusRef: supportCloseRef,
  });

  const normalized = query.trim().toLowerCase();
  const visibleTopics = useMemo(() => TOPICS.filter((topic) => {
    if (!normalized) return true;
    return `${topic.title} ${topic.description}`.toLowerCase().includes(normalized);
  }), [normalized]);

  const visibleFaqs = useMemo(() => FAQS.filter((faq) => {
    const topicMatches = showAllFaqs || faq.topic === selectedTopic || normalized.length > 0;
    if (!topicMatches) return false;
    if (!normalized) return true;
    return `${faq.question} ${faq.answer}`.toLowerCase().includes(normalized);
  }), [normalized, selectedTopic, showAllFaqs]);

  const loadHealth = useCallback(async (signal?: AbortSignal, announce = false) => {
    if (announce) {
      setHealthLoading(true);
      notifyWorkspace({ title: 'System health refresh requested', detail: 'Checking market data and sentiment providers.', tone: 'info' });
    }
    try {
      const report = await fetchJsonWithTimeout<SystemHealthReport>('/api/system/health', { signal, timeoutMs: 10_000 });
      setHealth(report);
      setHealthError(null);
      if (announce) notifyWorkspace({ title: 'System health updated', detail: 'The latest provider status is now visible.', tone: 'success' });
    } catch (caught) {
      if (!signal?.aborted) {
        const detail = caught instanceof Error ? caught.message : 'System health is unavailable.';
        setHealthError(detail);
        if (announce) notifyWorkspace({ title: 'System health unavailable', detail, tone: 'error', durationMs: 6500 });
      }
    } finally {
      if (announce) setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadHealth(controller.signal);
    const timer = window.setInterval(() => void loadHealth(controller.signal), 45_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [loadHealth]);

  const tutorials = showAllTutorials ? TUTORIALS : TUTORIALS.slice(0, 2);
  const supportTemplate = `APEX support request\nChannel: ${supportMode || 'General'}\nTime: ${new Date().toISOString()}\nPage: Help Center\nSystem health: ${health ? JSON.stringify({ kucoin: health.kucoinStatus, binance: health.binanceStatus, sentiment: health.sentimentStatus, uptimeSeconds: health.uptimeSeconds }) : healthError || 'unavailable'}\nIssue: `;

  async function copySupportTemplate() {
    try {
      await navigator.clipboard.writeText(supportTemplate);
      setCopied(true);
      notifyWorkspace({ title: 'Support template copied', detail: `${supportMode || 'General'} diagnostic context is ready to paste.`, tone: 'success' });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
      notifyWorkspace({ title: 'Clipboard unavailable', detail: 'Copy the diagnostic template manually from the support panel.', tone: 'warning' });
    }
  }

  const main = (
    <div className="apex-v3-help-main">
      <header className="apex-v3-help-title">
        <span>Help center</span>
        <h1>Hi there! How can we help you?</h1>
        <p>Find answers, learn the platform, and get the most out of APEX.</p>
      </header>

      <label className="apex-v3-help-search">
        <Search size={15} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for help articles, topics, or keywords..."
          aria-label="Search help articles"
        />
      </label>

      <Panel className="apex-v3-topics-card">
        <PanelHeader title="Browse Help Topics" subtitle="Choose a topic to narrow the FAQ list" />
        <div className="apex-v3-help-topics">
          {visibleTopics.map((topic) => {
            const Icon = topic.icon;
            return (
              <button
                key={topic.id}
                type="button"
                className={`apex-v3-topic-card ${selectedTopic === topic.id ? 'active' : ''}`}
                onClick={() => { setSelectedTopic(topic.id); setShowAllFaqs(false); }}
              >
                <i aria-hidden="true"><Icon size={16} /></i>
                <strong>{topic.title}</strong>
                <span>{topic.description}</span>
                <small><ArrowUpRight size={12} /> {topic.hint}</small>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel className="apex-v3-faq-card">
        <PanelHeader title="Frequently Asked Questions" subtitle="Answers aligned to the active workspace and support model" action={<button type="button" className="apex-v3-button" aria-pressed={showAllFaqs} onClick={() => setShowAllFaqs((value) => !value)}>{showAllFaqs ? 'Show topic FAQs' : 'View all FAQs'}</button>} />
        <div className="apex-v3-faq-list">
          {visibleFaqs.map((faq, index) => (
            <details key={faq.question} open={index === 0 && !normalized}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
          {!visibleFaqs.length && <p>No FAQ articles match the current search.</p>}
        </div>
      </Panel>

      <Panel className="apex-v3-tutorials-card">
        <PanelHeader title="Featured Tutorials" subtitle="Quick walkthroughs for the core APEX workflows" action={<button type="button" className="apex-v3-button" aria-pressed={showAllTutorials} onClick={() => setShowAllTutorials((value) => !value)}>{showAllTutorials ? 'Show featured' : 'View all tutorials'}</button>} />
        <div className="apex-v3-tutorial-grid">
          {tutorials.map((tutorial) => (
            <button
              type="button"
              className="apex-v3-tutorial-card"
              key={tutorial.title}
              aria-label={`${tutorial.title}, ${tutorial.duration}`}
              onClick={() => setActiveTutorial(tutorial)}
            >
              <div
                className="apex-v3-tutorial-thumb"
                aria-hidden="true"
                style={{ backgroundImage: `url("${tutorial.thumbnail}")` }}
              >
                <img src={tutorial.thumbnail} alt="" loading="eager" />
                <span>{tutorial.duration}</span>
              </div>
              <strong>{tutorial.title}</strong>
              <p>{tutorial.description}</p>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );

  const context = (
    <div className="apex-v3-context-stack help-context">
      <Panel className="contact-support-card">
        <PanelHeader title="Contact Support" subtitle="Deployment support handoff" />
        <div className="apex-v3-contact-list">
          {[
            { title: 'Live Chat', detail: 'Prepare a real-time diagnostic request' },
            { title: 'Email Support', detail: 'Copy a complete support template' },
            { title: 'Submit a Ticket', detail: 'Create a traceable request template' },
          ].map((item) => (
            <button type="button" key={item.title} onClick={() => { setSupportMode(item.title); setCopied(false); notifyWorkspace({ title: `${item.title} prepared`, detail: 'A deployment-ready diagnostic template is ready to review.', tone: 'info' }); }}>
              <MessageSquareText size={15} />
              <span><strong>{item.title}</strong><small>{item.detail}</small></span>
              <ArrowUpRight size={14} />
            </button>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="System Status" subtitle="Current workspace health" action={<div className="apex-v3-panel-actions"><button type="button" className="apex-v3-icon-button" aria-label="Refresh system health" title="Refresh system health" onClick={() => void loadHealth(undefined, true)} disabled={healthLoading}><RefreshCw size={14} className={healthLoading ? 'spin' : ''} /></button><button type="button" className="apex-v3-button" onClick={() => setHealthOpen(true)}>View Status</button></div>} />
        <div className="apex-v3-announcement-list">
          <article>
            <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Server size={14} /> System health endpoint connected</strong>
            <p>Market Data <b style={{ float: 'right', color: 'var(--apex-ink-900)' }}>{health ? `${health.kucoinStatus} / ${health.binanceStatus}` : healthError ? 'unavailable' : 'checking'}</b></p>
            <p>Sentiment <b style={{ float: 'right', color: 'var(--apex-ink-900)' }}>{health?.sentimentStatus || (healthError ? 'unavailable' : 'checking')}</b></p>
            <p>Uptime <b style={{ float: 'right', color: 'var(--apex-ink-900)' }}>{health ? `${Math.floor(health.uptimeSeconds / 60)} min` : '—'}</b></p>
            <p>Active Candidates <b style={{ float: 'right', color: 'var(--apex-ink-900)' }}>{health?.activeCandidateCount ?? '—'}</b></p>
          </article>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Latest Announcements" subtitle="Operational notes and release reminders" action={<button type="button" className="apex-v3-button" onClick={() => { setQuery(''); setShowAllFaqs(true); }}>Open all help</button>} />
        <div className="apex-v3-announcement-list">
          {ANNOUNCEMENTS.map((announcement) => (
            <article key={announcement.title}>
              <small className={announcement.tone}>{announcement.tone.replace('_', ' ')}</small>
              <strong>{announcement.title}</strong>
              <p>{announcement.description}</p>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );

  return (
    <>
      <WorkspacePageFrame className="apex-v3-page apex-v3-help-page" main={main} context={context} />
      {activeTutorial && (
        <div className="apex-help-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeTutorial(); }}>
          <section ref={tutorialDialogRef} className="apex-help-modal" role="dialog" aria-modal="true" aria-labelledby="help-tutorial-title">
            <header>
              <div><small>{activeTutorial.duration} guided walkthrough</small><h2 id="help-tutorial-title">{activeTutorial.title}</h2><p>{activeTutorial.description}</p></div>
              <button ref={tutorialCloseRef} type="button" aria-label="Close tutorial" onClick={closeTutorial}><X size={18} /></button>
            </header>
            <ol>{TUTORIAL_STEPS[activeTutorial.title].map((step) => <li key={step}><CheckCircle2 size={16} /><span>{step}</span></li>)}</ol>
            <footer><button type="button" onClick={closeTutorial}>Done</button></footer>
          </section>
        </div>
      )}
      {supportMode && (
        <div className="apex-help-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSupport(); }}>
          <section ref={supportDialogRef} className="apex-help-modal support" role="dialog" aria-modal="true" aria-labelledby="help-support-title">
            <header>
              <div><small>Deployment-ready support handoff</small><h2 id="help-support-title">{supportMode}</h2><p>Copy the diagnostic template and send it through the support channel configured for your deployment.</p></div>
              <button ref={supportCloseRef} type="button" aria-label="Close support panel" onClick={closeSupport}><X size={18} /></button>
            </header>
            <pre>{supportTemplate}</pre>
            <footer><button type="button" onClick={() => void copySupportTemplate()}>{copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy support template'}</button></footer>
          </section>
        </div>
      )}
      <SystemHealthDrawer isOpen={healthOpen} onClose={() => setHealthOpen(false)} />
    </>
  );
}
