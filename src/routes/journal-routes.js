import { Router } from "express";
import { createJournalController } from "../controllers/journal-controller.js";
import { requireCapability } from "../middleware/require-capability.js";
import { CAPABILITIES } from "../models/access.js";

export function createJournalRoutes() {
  const router = Router();
  const journalController = createJournalController();
  router.use(requireCapability(CAPABILITIES.JOURNAL));
  router.get("/journal", journalController.index);
  router.get("/journal/new", journalController.create);
  router.get("/journal/:id", journalController.publicEntry);
  return router;
}
