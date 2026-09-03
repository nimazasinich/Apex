import type { Express, Request, Response } from 'express';
import {
  PARLIAMENT_CANDIDATE_FINGERPRINT,
  PARLIAMENT_DEMOTION_CONFIRMATION,
  PARLIAMENT_SIGNAL_CONFIRMATION,
  type ParliamentPromotionStore,
} from '../parliamentPromotionStore';
import type { ParliamentValidationEvidence } from '../parliamentPromotionGate';

const safety = Object.freeze({
  researchOnlyUntilPromoted: true,
  signalPromotionRequiresHumanApproval: true,
  orderExecutionAuthorized: false,
  automaticOrderSubmission: false,
  autonomousLiveExecutionEnabled: false as const,
});

export function registerParliamentPromotionRoutes(app: Express, store: ParliamentPromotionStore): void {
  app.get('/api/strategies/parliament/promotion/status', (_req: Request, res: Response) => {
    res.json({ ok: true, state: store.snapshot(), scannerMode: store.scannerMode(), candidateFingerprint: PARLIAMENT_CANDIDATE_FINGERPRINT, safety });
  });

  app.post('/api/strategies/parliament/promotion/evaluate', (req: Request, res: Response) => {
    try {
      if (String(req.body?.candidateFingerprint || '') !== PARLIAMENT_CANDIDATE_FINGERPRINT) {
        return res.status(409).json({ ok: false, error: 'parliament_candidate_fingerprint_mismatch', candidateFingerprint: PARLIAMENT_CANDIDATE_FINGERPRINT });
      }
      const state = store.evaluateEvidence(req.body?.evidence as ParliamentValidationEvidence);
      return res.json({ ok: true, state, scannerMode: store.scannerMode(), safety });
    } catch (error) {
      return res.status(422).json({ ok: false, error: error instanceof Error ? error.message : String(error), safety });
    }
  });

  app.post('/api/strategies/parliament/promotion/approve-signal', (req: Request, res: Response) => {
    try {
      const state = store.approveSignalPromotion({
        confirmation: String(req.body?.confirmation || ''),
        signalDeliveryOptIn: req.body?.signalDeliveryOptIn === true,
      });
      return res.json({ ok: true, state, scannerMode: store.scannerMode(), requiredConfirmation: PARLIAMENT_SIGNAL_CONFIRMATION, safety });
    } catch (error) {
      return res.status(409).json({ ok: false, error: error instanceof Error ? error.message : String(error), requiredConfirmation: PARLIAMENT_SIGNAL_CONFIRMATION, safety });
    }
  });

  app.post('/api/strategies/parliament/promotion/demote', (req: Request, res: Response) => {
    try {
      const state = store.demoteToShadow({ confirmation: String(req.body?.confirmation || ''), reason: String(req.body?.reason || '') });
      return res.json({ ok: true, state, scannerMode: store.scannerMode(), requiredConfirmation: PARLIAMENT_DEMOTION_CONFIRMATION, safety });
    } catch (error) {
      return res.status(409).json({ ok: false, error: error instanceof Error ? error.message : String(error), requiredConfirmation: PARLIAMENT_DEMOTION_CONFIRMATION, safety });
    }
  });
}
