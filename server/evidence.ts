import type { Express, Request, Response } from "express";

export function registerEvidenceUpload(app: Express) {
  app.post("/api/evidence/upload", (_req: Request, res: Response) => {
    return res.status(410).json({ ok: false, error: "legacy_upload_retired", message: "The legacy evidence upload endpoint is retired. Use an authenticated, case-scoped Customer Space upload procedure." });
  });
}
