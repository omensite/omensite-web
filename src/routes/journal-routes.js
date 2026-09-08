import { Router } from "express";
import { createJournalController } from "../controllers/journal-controller.js";
import { requireCapability } from "../middleware/require-capability.js";
import { CAPABILITIES } from "../models/access.js";
import { requireCsrf } from "../security/csrf.js";
import { createJournalApiController } from "../controllers/journal-api-controller.js";

export function createJournalRoutes({ journalRepository }) {
  const router = Router();
  const journalController = createJournalController();
  const journalApiController = createJournalApiController({ journalRepository });
  router.use(requireCapability(CAPABILITIES.JOURNAL));
  router.get("/api/journal", journalApiController.list);
  router.get("/api/journal/:id", journalApiController.find);
  router.post("/api/journal", requireCsrf, journalApiController.create);
  router.get("/journal", journalController.index);
  router.get("/journal/new", journalController.create);
  router.get("/journal/:id", journalController.publicEntry);
  return router;
}
